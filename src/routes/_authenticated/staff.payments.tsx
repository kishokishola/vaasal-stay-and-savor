import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  getBookings,
  getOrders,
  recordBookingPayment,
  recordOrderPayment,
  subscribeToBookings,
  subscribeToOrders,
  type Booking,
  type Order,
} from "@/lib/firebase-data";
import { useFirestoreRealtime } from "@/hooks/useFirestoreRealtime";
import { collectedOrderAmount, lkr, rateAmount } from "@/lib/hotel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/staff/payments")({
  component: Payments,
});

type PaymentTarget = { kind: "booking"; value: Booking } | { kind: "order"; value: Order };

function Payments() {
  const qc = useQueryClient();
  const [target, setTarget] = useState<PaymentTarget | null>(null);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<"cash" | "card" | "bank_transfer">("cash");
  const [busy, setBusy] = useState(false);
  const {
    data: bookings = [],
    isLoading: bookingsLoading,
    isError: bookingsError,
  } = useQuery({
    queryKey: ["bookings"],
    queryFn: () => getBookings(),
  });
  const {
    data: orders = [],
    isLoading: ordersLoading,
    isError: ordersError,
  } = useQuery({
    queryKey: ["orders"],
    queryFn: getOrders,
  });
  useFirestoreRealtime(["bookings"], subscribeToBookings);
  useFirestoreRealtime(["orders"], subscribeToOrders);
  const unpaidBookings = bookings.filter(
    (booking) =>
      booking.status !== "cancelled" &&
      booking.status !== "checked_out" &&
      Number(booking.paid_amount ?? 0) < Number(booking.total),
  );
  const unpaidOrders = orders.filter(
    (order) => order.status !== "cancelled" && collectedOrderAmount(order) < Number(order.total),
  );
  const dueLkr =
    unpaidBookings
      .filter((booking) => booking.rate_currency !== "USD")
      .reduce((sum, booking) => sum + Number(booking.total) - Number(booking.paid_amount ?? 0), 0) +
    unpaidOrders.reduce((sum, order) => sum + Number(order.total) - collectedOrderAmount(order), 0);
  const dueUsd = unpaidBookings
    .filter((booking) => booking.rate_currency === "USD")
    .reduce((sum, booking) => sum + Number(booking.total) - Number(booking.paid_amount ?? 0), 0);

  async function collect() {
    if (!target) return;
    setBusy(true);
    try {
      if (target.kind === "booking") {
        await recordBookingPayment(target.value.id, Number(amount), method);
      } else {
        await recordOrderPayment(
          target.value.id,
          Number(amount),
          method === "bank_transfer" ? "online" : method,
        );
      }
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["bookings"] }),
        qc.invalidateQueries({ queryKey: ["orders"] }),
      ]);
      setTarget(null);
      setAmount("");
      toast.success("Payment recorded.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not record payment.");
    } finally {
      setBusy(false);
    }
  }

  const selectedDue = target
    ? target.kind === "booking"
      ? Number(target.value.total) - Number(target.value.paid_amount ?? 0)
      : Number(target.value.total) - collectedOrderAmount(target.value)
    : 0;

  return (
    <div>
      <div className="eyebrow">Accounts</div>
      <h1 className="mt-2 text-4xl">Track payments</h1>
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="bg-card p-5 shadow-luxe">
          <div className="text-xs uppercase tracking-widest text-muted-foreground">
            Outstanding balance · LKR
          </div>
          <div className="mt-2 font-display text-2xl text-primary">{lkr(dueLkr)}</div>
        </div>
        <div className="bg-card p-5 shadow-luxe">
          <div className="text-xs uppercase tracking-widest text-muted-foreground">
            Outstanding balance · USD
          </div>
          <div className="mt-2 font-display text-2xl text-primary">{rateAmount(dueUsd, "USD")}</div>
        </div>
        <div className="bg-card p-5 shadow-luxe">
          <div className="text-xs uppercase tracking-widest text-muted-foreground">
            Bookings with balance
          </div>
          <div className="mt-2 font-display text-2xl text-primary">{unpaidBookings.length}</div>
        </div>
        <div className="bg-card p-5 shadow-luxe">
          <div className="text-xs uppercase tracking-widest text-muted-foreground">
            Food orders with balance
          </div>
          <div className="mt-2 font-display text-2xl text-primary">{unpaidOrders.length}</div>
        </div>
      </div>
      {(bookingsError || ordersError) && (
        <p role="alert" className="mt-5 text-destructive">
          Payment data could not be loaded. Verify staff access.
        </p>
      )}
      <section className="mt-8">
        <h2 className="font-display text-2xl">Room bookings</h2>
        {bookingsLoading && <p className="mt-3 text-muted-foreground">Loading booking balances…</p>}
        <div className="mt-3 space-y-3">
          {unpaidBookings.map((booking) => {
            const paid = Number(booking.paid_amount ?? 0);
            const due = Math.max(0, Number(booking.total) - paid);
            return (
              <article
                key={booking.id}
                className="flex flex-wrap items-center justify-between gap-4 bg-card p-5 shadow-luxe"
              >
                <div>
                  <div className="font-medium">
                    {booking.guest_name} · {booking.room_code}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {booking.check_in} → {booking.check_out} · {booking.status}
                  </div>
                </div>
                <div className="text-sm">
                  {rateAmount(paid, booking.rate_currency)} paid ·{" "}
                  <strong>{rateAmount(due, booking.rate_currency)} due</strong>
                </div>
                <Button
                  size="sm"
                  onClick={() => {
                    setTarget({ kind: "booking", value: booking });
                    setAmount(String(due));
                  }}
                >
                  Collect payment
                </Button>
              </article>
            );
          })}
          {!bookingsLoading && !bookingsError && !unpaidBookings.length && (
            <p className="text-sm text-muted-foreground">No outstanding booking payments.</p>
          )}
        </div>
      </section>
      <section className="mt-10">
        <h2 className="font-display text-2xl">Restaurant orders</h2>
        {ordersLoading && <p className="mt-3 text-muted-foreground">Loading order balances…</p>}
        <div className="mt-3 space-y-3">
          {unpaidOrders.map((order) => {
            const paid = collectedOrderAmount(order);
            const due = Math.max(0, Number(order.total) - paid);
            return (
              <article
                key={order.id}
                className="flex flex-wrap items-center justify-between gap-4 bg-card p-5 shadow-luxe"
              >
                <div>
                  <div className="font-medium">
                    Order #{order.order_no} · {order.customer_name || "Walk-in"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(order.created_at).toLocaleString()} ·{" "}
                    {order.order_type.replace("_", " ")}
                  </div>
                </div>
                <div className="text-sm">
                  <Badge variant="secondary">{order.payment_status ?? "unpaid"}</Badge> {lkr(paid)}{" "}
                  paid · <strong>{lkr(due)} due</strong>
                </div>
                <Button
                  size="sm"
                  onClick={() => {
                    setTarget({ kind: "order", value: order });
                    setAmount(String(due));
                  }}
                >
                  Collect payment
                </Button>
              </article>
            );
          })}
          {!ordersLoading && !ordersError && !unpaidOrders.length && (
            <p className="text-sm text-muted-foreground">No outstanding restaurant payments.</p>
          )}
        </div>
      </section>
      <Dialog
        open={!!target}
        onOpenChange={(open) => {
          if (!open) setTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Record payment ·{" "}
              {target?.kind === "order"
                ? `Order #${target.value.order_no}`
                : target?.kind === "booking"
                  ? target.value.guest_name
                  : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Outstanding:{" "}
              {rateAmount(
                selectedDue,
                target?.kind === "booking" ? target.value.rate_currency : "LKR",
              )}
            </p>
            <div>
              <label htmlFor="payment-amount" className="text-sm font-medium">
                Amount (
                {target?.kind === "booking" && target.value.rate_currency === "USD" ? "USD" : "LKR"}
                )
              </label>
              <Input
                id="payment-amount"
                type="number"
                min="0.01"
                max={selectedDue}
                step="0.01"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Method</label>
              <Select
                value={method}
                onValueChange={(value) => {
                  if (value === "cash" || value === "card" || value === "bank_transfer")
                    setMethod(value);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="card">Card</SelectItem>
                  <SelectItem value="bank_transfer">Bank transfer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              disabled={busy || Number(amount) <= 0 || Number(amount) > selectedDue}
              onClick={() => void collect()}
            >
              {busy ? "Saving…" : "Confirm payment"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
