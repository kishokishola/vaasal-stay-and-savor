import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  getBookings,
  getOrders,
  subscribeToBookings,
  subscribeToOrders,
  updateBookingStatus,
} from "@/lib/firebase-data";
import { useFirestoreRealtime } from "@/hooks/useFirestoreRealtime";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { collectedOrderAmount, lkr, rateAmount } from "@/lib/hotel";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/staff/bookings")({
  component: Bookings,
});

const STATUSES = ["pending", "confirmed", "checked_in", "checked_out", "cancelled"] as const;
type PaymentFilter = "all" | "paid" | "partial" | "unpaid";
const next: Record<string, { label: string; to: string }[]> = {
  pending: [
    { label: "Confirm", to: "confirmed" },
    { label: "Decline", to: "cancelled" },
  ],
  confirmed: [
    { label: "Check in", to: "checked_in" },
    { label: "Cancel", to: "cancelled" },
  ],
  checked_in: [{ label: "Check out", to: "checked_out" }],
};

function Bookings() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>("all");
  const [search, setSearch] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["bookings"],
    queryFn: () => getBookings(),
  });
  const { data: orders } = useQuery({ queryKey: ["orders"], queryFn: getOrders });
  useFirestoreRealtime(["bookings"], subscribeToBookings);
  useFirestoreRealtime(["orders"], subscribeToOrders);
  async function setStatus(id: string, status: string) {
    try {
      await updateBookingStatus(id, status);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update booking.");
      return;
    }
    toast.success("Booking updated");
    qc.invalidateQueries({ queryKey: ["bookings"] });
  }
  const visibleBookings = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (data ?? []).filter((booking) => {
      const paid = Number(booking.paid_amount ?? 0);
      const total = Number(booking.total);
      const status = paid >= total ? "paid" : paid > 0 ? "partial" : "unpaid";
      return (
        (filter === "all" || booking.status === filter) &&
        (paymentFilter === "all" || paymentFilter === status) &&
        (!term ||
          booking.guest_name.toLowerCase().includes(term) ||
          (booking.guest_email ?? "").toLowerCase().includes(term) ||
          (booking.guest_phone ?? "").toLowerCase().includes(term) ||
          booking.room_code.toLowerCase().includes(term))
      );
    });
  }, [data, filter, paymentFilter, search]);
  const bookingCounts = useMemo(
    () => ({
      total: data?.length ?? 0,
      pending: (data ?? []).filter((booking) => booking.status === "pending").length,
      checkedIn: (data ?? []).filter((booking) => booking.status === "checked_in").length,
      outstanding: (data ?? []).filter(
        (booking) =>
          !["cancelled", "checked_out"].includes(booking.status) &&
          Number(booking.paid_amount ?? 0) < Number(booking.total),
      ).length,
    }),
    [data],
  );
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="eyebrow">Hotel</div>
          <h1 className="mt-2 text-4xl">Bookings</h1>
        </div>
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Total bookings", bookingCounts.total],
          ["Awaiting decision", bookingCounts.pending],
          ["Checked in", bookingCounts.checkedIn],
          ["Outstanding room bills", bookingCounts.outstanding],
        ].map(([label, value]) => (
          <article key={label} className="bg-card p-4 shadow-luxe">
            <div className="text-xs uppercase tracking-widest text-muted-foreground">{label}</div>
            <div className="mt-2 font-display text-2xl text-primary">{value}</div>
          </article>
        ))}
      </div>
      <div className="mt-6 grid gap-3 md:grid-cols-[1fr_12rem_12rem]">
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search guest, email, phone or room"
          aria-label="Search bookings"
        />
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger aria-label="Filter by booking status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All booking statuses</SelectItem>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s.replace("_", " ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={paymentFilter}
          onValueChange={(value) => setPaymentFilter(value as PaymentFilter)}
        >
          <SelectTrigger aria-label="Filter by payment status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All payment statuses</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="partial">Partially paid</SelectItem>
            <SelectItem value="unpaid">Unpaid</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="mt-8 overflow-x-auto bg-card shadow-luxe">
        <Table className="mobile-card-table">
          <TableHeader>
            <TableRow>
              <TableHead>Guest</TableHead>
              <TableHead>Room</TableHead>
              <TableHead>Dates</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Room-service bill</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={7}>Loading…</TableCell>
              </TableRow>
            )}
            {!isLoading && visibleBookings.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-muted-foreground">
                  {data?.length ? "No bookings match these filters." : "No bookings yet."}
                </TableCell>
              </TableRow>
            )}
            {visibleBookings.map((b) => {
              const roomOrders = (orders ?? []).filter(
                (order) => order.booking_id === b.id && order.status !== "cancelled",
              );
              const roomServiceTotal = roomOrders.reduce(
                (sum, order) => sum + Number(order.total),
                0,
              );
              const roomServicePaid = roomOrders.reduce(
                (sum, order) => sum + collectedOrderAmount(order),
                0,
              );
              return (
                <TableRow key={b.id}>
                  <TableCell data-label="Guest">
                    <div className="font-medium">{b.guest_name}</div>
                    <div className="text-xs text-muted-foreground">
                      {b.guest_phone} · {b.guest_email}
                    </div>
                    {b.notes && (
                      <div className="text-xs italic text-muted-foreground">“{b.notes}”</div>
                    )}
                  </TableCell>
                  <TableCell data-label="Room">
                    {b.room_code}{" "}
                    <span className="text-xs text-muted-foreground">{b.room_name}</span>
                  </TableCell>
                  <TableCell data-label="Dates" className="whitespace-nowrap text-sm">
                    {b.check_in} → {b.check_out}
                    <div className="text-xs text-muted-foreground">{b.guests} guest(s)</div>
                  </TableCell>
                  <TableCell data-label="Total">{rateAmount(b.total, b.rate_currency)}</TableCell>
                  <TableCell data-label="Room-service bill" className="whitespace-nowrap text-sm">
                    {lkr(roomServiceTotal)}
                    <div className="text-xs text-muted-foreground">
                      {lkr(roomServicePaid)} paid ·{" "}
                      {lkr(Math.max(0, roomServiceTotal - roomServicePaid))} due
                    </div>
                  </TableCell>
                  <TableCell data-label="Status">
                    <Badge
                      variant={
                        b.status === "cancelled"
                          ? "destructive"
                          : b.status === "pending"
                            ? "secondary"
                            : "default"
                      }
                    >
                      {b.status.replace("_", " ")}
                    </Badge>
                  </TableCell>
                  <TableCell data-label="Actions" className="space-x-2 whitespace-nowrap">
                    {(next[b.status] ?? []).map((n) => (
                      <Button
                        key={n.to}
                        size="sm"
                        variant={n.to === "cancelled" ? "outline" : "default"}
                        onClick={() => setStatus(b.id, n.to)}
                      >
                        {n.label}
                      </Button>
                    ))}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
