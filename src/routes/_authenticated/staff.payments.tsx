import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
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
  const [method, setMethod] = useState<"cash" | "card" | "bank_transfer" | "online">("cash");
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [roomFilter, setRoomFilter] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState("due");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
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
  const validBookings = useMemo(
    () => bookings.filter((booking) => booking.status !== "cancelled"),
    [bookings],
  );
  const unpaidBookings = validBookings.filter(
    (booking) => Number(booking.paid_amount ?? 0) < Number(booking.total),
  );
  const guestBookingIds = useMemo(
    () => new Set(validBookings.map((booking) => booking.id)),
    [validBookings],
  );
  const unpaidOrders = orders.filter(
    (order) => order.status !== "cancelled" && collectedOrderAmount(order) < Number(order.total),
  );
  const standaloneUnpaidOrders = unpaidOrders.filter(
    (order) =>
      !(order.order_type === "room" && order.booking_id && guestBookingIds.has(order.booking_id)),
  );
  const guestBills = useMemo(() => {
    const term = search.trim().toLowerCase();
    return validBookings
      .map((booking) => {
        const roomOrders = orders.filter(
          (order) =>
            order.booking_id === booking.id &&
            order.status !== "cancelled" &&
            order.order_type === "room",
        );
        const roomPaid = Number(booking.paid_amount ?? 0);
        const roomDue = Math.max(0, Number(booking.total) - roomPaid);
        const sumFood = (currency: "LKR" | "USD") => {
          const ordersInCurrency = roomOrders.filter(
            (order) => (order.price_currency ?? "LKR") === currency,
          );
          const total = ordersInCurrency.reduce((sum, order) => sum + Number(order.total), 0);
          const paid = ordersInCurrency.reduce(
            (sum, order) => sum + collectedOrderAmount(order),
            0,
          );
          return { total, paid, due: Math.max(0, total - paid) };
        };
        const foodLkr = sumFood("LKR");
        const foodUsd = sumFood("USD");
        const hasDue = roomDue > 0 || foodLkr.due > 0 || foodUsd.due > 0;
        const matchesSearch =
          !term ||
          [booking.guest_name, booking.guest_phone, booking.room_code].some((value) =>
            value.toLowerCase().includes(term),
          );
        const matchesDate =
          (!dateFrom || booking.check_in >= dateFrom) && (!dateTo || booking.check_in <= dateTo);
        return {
          booking,
          roomOrders,
          roomPaid,
          roomDue,
          foodLkr,
          foodUsd,
          hasDue,
          matchesSearch,
          matchesDate,
        };
      })
      .filter(
        (bill) =>
          bill.matchesSearch &&
          bill.matchesDate &&
          (roomFilter === "all" || bill.booking.room_code === roomFilter) &&
          (paymentFilter === "all" || (paymentFilter === "due" ? bill.hasDue : !bill.hasDue)),
      )
      .sort((a, b) => b.booking.check_in.localeCompare(a.booking.check_in));
  }, [dateFrom, dateTo, orders, paymentFilter, roomFilter, search, validBookings]);
  const dueLkr =
    validBookings
      .filter((booking) => booking.rate_currency !== "USD")
      .reduce(
        (sum, booking) =>
          sum + Math.max(0, Number(booking.total) - Number(booking.paid_amount ?? 0)),
        0,
      ) +
    unpaidOrders
      .filter((order) => (order.price_currency ?? "LKR") !== "USD")
      .reduce(
        (sum, order) => sum + Math.max(0, Number(order.total) - collectedOrderAmount(order)),
        0,
      );
  const dueUsd =
    validBookings
      .filter((booking) => booking.rate_currency === "USD")
      .reduce(
        (sum, booking) =>
          sum + Math.max(0, Number(booking.total) - Number(booking.paid_amount ?? 0)),
        0,
      ) +
    unpaidOrders
      .filter((order) => order.price_currency === "USD")
      .reduce(
        (sum, order) => sum + Math.max(0, Number(order.total) - collectedOrderAmount(order)),
        0,
      );

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
        <h2 className="font-display text-2xl">Room & food bills</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Room and restaurant charges are grouped by guest and retained in their original
          currencies.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Input
            aria-label="Search guest bills"
            placeholder="Guest, phone or room"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <Select value={roomFilter} onValueChange={setRoomFilter}>
            <SelectTrigger aria-label="Filter by room">
              <SelectValue placeholder="All rooms" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All rooms</SelectItem>
              {[...new Set(validBookings.map((booking) => booking.room_code))]
                .sort((a, b) => a.localeCompare(b))
                .map((room) => (
                  <SelectItem key={room} value={room}>
                    Room {room}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <Select value={paymentFilter} onValueChange={setPaymentFilter}>
            <SelectTrigger aria-label="Filter by payment status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="due">Outstanding</SelectItem>
              <SelectItem value="settled">Settled</SelectItem>
              <SelectItem value="all">All bills</SelectItem>
            </SelectContent>
          </Select>
          <div className="grid grid-cols-2 gap-2">
            <Input
              aria-label="Bookings from date"
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
            />
            <Input
              aria-label="Bookings to date"
              type="date"
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
            />
          </div>
        </div>
        {bookingsLoading && <p className="mt-3 text-muted-foreground">Loading guest bills…</p>}
        <div className="mt-3 space-y-3">
          {guestBills.map((bill) => {
            const { booking, roomOrders, roomPaid, roomDue, foodLkr, foodUsd } = bill;
            return (
              <article key={booking.id} className="bg-card p-5 shadow-luxe">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="font-medium">
                      {booking.guest_name} · Room {booking.room_code}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {booking.guest_phone} · {booking.check_in} → {booking.check_out} ·{" "}
                      {booking.status.replace("_", " ")}
                    </div>
                  </div>
                  <Badge variant={bill.hasDue ? "destructive" : "secondary"}>
                    {bill.hasDue ? "Balance due" : "Settled"}
                  </Badge>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="border border-border p-3">
                    <div className="text-xs uppercase tracking-widest text-muted-foreground">
                      Room charge
                    </div>
                    <div className="mt-1 text-sm">
                      {rateAmount(roomPaid, booking.rate_currency)} paid ·{" "}
                      <strong>{rateAmount(roomDue, booking.rate_currency)} due</strong>
                    </div>
                    {roomDue > 0 && (
                      <Button
                        className="mt-2"
                        size="sm"
                        onClick={() => {
                          setTarget({ kind: "booking", value: booking });
                          setAmount(String(roomDue));
                        }}
                      >
                        Collect room payment
                      </Button>
                    )}
                  </div>
                  <div className="border border-border p-3">
                    <div className="text-xs uppercase tracking-widest text-muted-foreground">
                      Room-service food
                    </div>
                    <div className="mt-1 text-sm">
                      {rateAmount(foodLkr.paid, "LKR")} paid ·{" "}
                      <strong>{rateAmount(foodLkr.due, "LKR")} due</strong>
                      {(foodUsd.total > 0 || foodUsd.paid > 0) && (
                        <div>
                          {rateAmount(foodUsd.paid, "USD")} paid ·{" "}
                          <strong>{rateAmount(foodUsd.due, "USD")} due</strong>
                        </div>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {roomOrders.length} attached order(s) · {rateAmount(foodLkr.total, "LKR")}{" "}
                      total
                      {foodUsd.total > 0 && ` · ${rateAmount(foodUsd.total, "USD")} total`}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {roomOrders
                        .filter((order) => Number(order.total) > collectedOrderAmount(order))
                        .map((order) => (
                          <Button
                            key={order.id}
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setTarget({ kind: "order", value: order });
                              setAmount(String(Number(order.total) - collectedOrderAmount(order)));
                            }}
                          >
                            Collect order #{order.order_no}
                          </Button>
                        ))}
                    </div>
                  </div>
                </div>
                <div className="mt-3 text-right text-xs text-muted-foreground">
                  Guest food charges are included in the restaurant balance above.
                </div>
              </article>
            );
          })}
          {!bookingsLoading && !bookingsError && !guestBills.length && (
            <p className="text-sm text-muted-foreground">No guest bills match these filters.</p>
          )}
        </div>
      </section>
      <section className="mt-10">
        <h2 className="font-display text-2xl">Restaurant orders</h2>
        {ordersLoading && <p className="mt-3 text-muted-foreground">Loading order balances…</p>}
        <div className="mt-3 space-y-3">
          {standaloneUnpaidOrders.map((order) => {
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
                  <Badge variant="secondary">{order.payment_status ?? "unpaid"}</Badge>{" "}
                  {rateAmount(paid, order.price_currency ?? "LKR")} paid ·{" "}
                  <strong>{rateAmount(due, order.price_currency ?? "LKR")} due</strong>
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
          {!ordersLoading && !ordersError && !standaloneUnpaidOrders.length && (
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
                target?.kind === "booking"
                  ? (target.value.rate_currency ?? "LKR")
                  : target?.kind === "order"
                    ? (target.value.price_currency ?? "LKR")
                    : "LKR",
              )}
            </p>
            <div>
              <label htmlFor="payment-amount" className="text-sm font-medium">
                Amount (
                {target?.kind === "booking"
                  ? (target.value.rate_currency ?? "LKR")
                  : target?.kind === "order"
                    ? (target.value.price_currency ?? "LKR")
                    : "LKR"}
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
                  if (
                    value === "cash" ||
                    value === "card" ||
                    value === "bank_transfer" ||
                    value === "online"
                  )
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
                  <SelectItem value="online">Online payment</SelectItem>
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
