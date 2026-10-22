import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CalendarCheck, CreditCard, Plus, Receipt, ShoppingCart } from "lucide-react";
import {
  getBookings,
  getOrders,
  getReservedRoomIds,
  getRooms,
  subscribeToBookings,
  subscribeToDateLocks,
  subscribeToOrders,
  subscribeToRooms,
} from "@/lib/firebase-data";
import { collectedOrderAmount, lkr } from "@/lib/hotel";
import { hotelDayBounds, hotelToday } from "@/lib/dates";
import { useFirestoreRealtime } from "@/hooks/useFirestoreRealtime";

export const Route = createFileRoute("/_authenticated/staff/cashier")({
  component: CashierDashboard,
});

function CashierDashboard() {
  const today = hotelToday();
  const bounds = hotelDayBounds(today);
  const queryKey = ["cashier-dashboard", today];
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey,
    queryFn: async () => {
      const [bookings, orders, rooms, reservedRoomIds] = await Promise.all([
        getBookings(),
        getOrders(),
        getRooms(true),
        getReservedRoomIds(today),
      ]);
      const todaysOrders = orders.filter(
        (order) => order.created_at >= bounds.start && order.created_at < bounds.end,
      );
      const completedOrders = todaysOrders.filter((order) => order.status !== "cancelled");
      return {
        pendingBookings: bookings.filter((booking) => booking.status === "pending").length,
        arrivals: bookings.filter(
          (booking) => booking.check_in === today && booking.status === "confirmed",
        ).length,
        availableRooms: rooms.filter((room) => !reservedRoomIds.includes(room.id)).length,
        pendingPayments: bookings.filter(
          (booking) =>
            booking.status !== "cancelled" &&
            booking.status !== "checked_out" &&
            Number(booking.paid_amount ?? 0) < Number(booking.total),
        ).length,
        todaySales: completedOrders.reduce((sum, order) => sum + collectedOrderAmount(order), 0),
        unpaidOrders: orders.filter(
          (order) =>
            order.status !== "cancelled" &&
            (order.payment_status === "unpaid" || order.payment_status === "partial"),
        ).length,
      };
    },
  });
  useFirestoreRealtime(queryKey, subscribeToBookings);
  useFirestoreRealtime(queryKey, subscribeToOrders);
  useFirestoreRealtime(queryKey, subscribeToRooms);
  useFirestoreRealtime(queryKey, (onChange, onError) =>
    subscribeToDateLocks(today, onChange, onError),
  );

  const metrics = [
    { label: "Website bookings", value: data?.pendingBookings ?? "–", to: "/staff/bookings" },
    { label: "Arrivals today", value: data?.arrivals ?? "–", to: "/staff/bookings" },
    { label: "Rooms available", value: data?.availableRooms ?? "–", to: "/staff/calendar" },
    { label: "Unpaid orders", value: data?.unpaidOrders ?? "–", to: "/staff/orders" },
    {
      label: "Restaurant sales today",
      value: data ? lkr(data.todaySales) : "–",
      to: "/staff/orders",
    },
  ] as const;
  const actions = [
    { label: "Create booking", to: "/staff/create-booking", icon: Plus },
    { label: "Website bookings", to: "/staff/bookings", icon: CalendarCheck },
    { label: "Payments", to: "/staff/payments", icon: CreditCard },
    { label: "Restaurant POS", to: "/staff/pos", icon: ShoppingCart },
    { label: "Order history", to: "/staff/orders", icon: Receipt },
  ] as const;

  return (
    <div>
      <div className="eyebrow">Cashier dashboard · {today}</div>
      <h1 className="mt-2 text-4xl">Hotel operations</h1>
      {isLoading && <p className="mt-6 text-sm text-muted-foreground">Loading live hotel data…</p>}
      {isError && (
        <div
          role="alert"
          className="mt-6 rounded-sm border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive"
        >
          <p>Dashboard data could not be loaded: {error.message}</p>
          <button className="mt-2 underline" onClick={() => void refetch()}>
            Try again
          </button>
        </div>
      )}
      <div className="mt-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-5">
        {metrics.map((metric) => (
          <Link
            key={metric.label}
            to={metric.to}
            className="bg-card p-6 shadow-luxe transition hover:-translate-y-0.5"
          >
            <div className="text-xs uppercase tracking-widest text-muted-foreground">
              {metric.label}
            </div>
            <div className="mt-3 font-display text-4xl text-primary">{metric.value}</div>
          </Link>
        ))}
      </div>
      <section className="mt-10">
        <div className="eyebrow">Front desk</div>
        <h2 className="mt-2 font-display text-2xl">Quick actions</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {actions.map(({ label, to, icon: Icon }) => (
            <Link
              key={label}
              to={to}
              className="flex items-center gap-3 bg-card p-5 shadow-luxe transition hover:-translate-y-0.5 hover:ring-1 hover:ring-accent"
            >
              <Icon className="size-5 text-primary" />
              <span className="font-medium">{label}</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
