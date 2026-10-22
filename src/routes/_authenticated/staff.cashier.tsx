import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CalendarCheck, CreditCard, Plus, Receipt, ShoppingCart, Wallet } from "lucide-react";
import {
  getBookings,
  getOrders,
  getPettyCash,
  subscribeToBookings,
  subscribeToOrders,
  subscribeToPettyCash,
  type Booking,
  type Order,
} from "@/lib/firebase-data";
import { collectedOrderAmount, lkr } from "@/lib/hotel";
import { hotelDayBounds, hotelToday } from "@/lib/dates";
import { useFirestoreRealtime } from "@/hooks/useFirestoreRealtime";

export const Route = createFileRoute("/_authenticated/staff/cashier")({
  component: CashierDashboard,
});

function paymentCollectedToday(
  amount: number,
  history: { amount: number; at: string }[] | undefined,
  createdAt: string,
  start: string,
  end: string,
) {
  if (history?.length) {
    return history
      .filter((payment) => payment.at >= start && payment.at < end)
      .reduce((sum, payment) => sum + Number(payment.amount), 0);
  }
  return createdAt >= start && createdAt < end ? amount : 0;
}

function CashierDashboard() {
  const today = hotelToday();
  const bounds = hotelDayBounds(today);
  const queryKey = ["cashier-dashboard", today];
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey,
    queryFn: async () => {
      const [bookings, orders, pettyCash] = await Promise.all([
        getBookings(),
        getOrders(),
        getPettyCash(),
      ]);
      const bookingsToday = bookings.filter(
        (booking) => booking.created_at >= bounds.start && booking.created_at < bounds.end,
      );
      const ordersToday = orders.filter(
        (order) => order.created_at >= bounds.start && order.created_at < bounds.end,
      );
      const roomRevenueLkr = bookings
        .filter((booking) => booking.status !== "cancelled" && booking.rate_currency !== "USD")
        .reduce(
          (sum, booking) =>
            sum +
            paymentCollectedToday(
              Number(booking.paid_amount ?? 0),
              booking.payment_history,
              booking.created_at,
              bounds.start,
              bounds.end,
            ),
          0,
        );
      const roomRevenueUsd = bookings
        .filter((booking) => booking.status !== "cancelled" && booking.rate_currency === "USD")
        .reduce(
          (sum, booking) =>
            sum +
            paymentCollectedToday(
              Number(booking.paid_amount ?? 0),
              booking.payment_history,
              booking.created_at,
              bounds.start,
              bounds.end,
            ),
          0,
        );
      const restaurantRevenue = orders
        .filter((order) => order.status !== "cancelled" && order.payment_status !== "refunded")
        .reduce(
          (sum, order) =>
            sum +
            paymentCollectedToday(
              collectedOrderAmount(order),
              order.payment_history,
              order.created_at,
              bounds.start,
              bounds.end,
            ),
          0,
        );
      const pettyCashSpent = pettyCash.entries
        .filter(
          (entry) =>
            entry.kind === "expense" &&
            entry.created_at >= bounds.start &&
            entry.created_at < bounds.end,
        )
        .reduce((sum, entry) => sum + Number(entry.amount), 0);
      return {
        bookingsToday: bookingsToday.length,
        ordersToday: ordersToday.length,
        revenueLkr: roomRevenueLkr + restaurantRevenue,
        revenueUsd: roomRevenueUsd,
        pettyCashSpent,
        recentBookings: [...bookings]
          .sort((a, b) => b.created_at.localeCompare(a.created_at))
          .slice(0, 5),
        recentOrders: [...orders]
          .sort((a, b) => b.created_at.localeCompare(a.created_at))
          .slice(0, 5),
      };
    },
  });
  useFirestoreRealtime(queryKey, subscribeToBookings);
  useFirestoreRealtime(queryKey, subscribeToOrders);
  useFirestoreRealtime(queryKey, subscribeToPettyCash);

  const metrics = [
    {
      label: "Bookings Today",
      value: data?.bookingsToday ?? "–",
      detail: undefined,
      icon: CalendarCheck,
    },
    {
      label: "Food Orders Today",
      value: data?.ordersToday ?? "–",
      detail: undefined,
      icon: ShoppingCart,
    },
    {
      label: "Revenue (Paid Today)",
      value: data ? lkr(data.revenueLkr) : "–",
      detail: data?.revenueUsd ? `Plus ${data.revenueUsd.toFixed(2)} USD` : undefined,
      icon: CreditCard,
    },
    {
      label: "Petty Cash Spent",
      value: data ? lkr(data.pettyCashSpent) : "–",
      detail: undefined,
      icon: Wallet,
    },
  ] as const;
  const actions = [
    {
      label: "Create Booking",
      description: "Register a guest's room booking.",
      to: "/staff/create-booking",
      icon: Plus,
    },
    {
      label: "Create Food Order",
      description: "Build and bill a restaurant order.",
      to: "/staff/pos",
      icon: ShoppingCart,
    },
    {
      label: "Spending Records",
      description: "Track petty cash and expenses.",
      to: "/staff/petty-cash",
      icon: Wallet,
    },
    {
      label: "Booking History",
      description: "Review and manage reservations.",
      to: "/staff/bookings",
      icon: CalendarCheck,
    },
    {
      label: "Order History",
      description: "Review bills, payments and sales.",
      to: "/staff/orders",
      icon: Receipt,
    },
  ] as const;

  return (
    <div>
      <div className="eyebrow">Cashier dashboard · {today}</div>
      <h1 className="mt-2 text-4xl">Hotel operations</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Live overview for room bookings, restaurant orders and today&apos;s cash activity.
      </p>
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
      <div className="mt-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map(({ label, value, detail, icon: Icon }) => (
          <article key={label} className="bg-card p-6 shadow-luxe">
            <Icon className="size-5 text-primary" />
            <div className="mt-4 text-xs uppercase tracking-widest text-muted-foreground">
              {label}
            </div>
            <div className="mt-2 font-display text-3xl text-primary">{value}</div>
            {detail && <div className="mt-1 text-xs text-muted-foreground">{detail}</div>}
          </article>
        ))}
      </div>
      <section className="mt-10">
        <div className="eyebrow">Front desk and restaurant</div>
        <h2 className="mt-2 font-display text-2xl">Quick actions</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {actions.map(({ label, description, to, icon: Icon }) => (
            <Link
              key={label}
              to={to}
              className="bg-card p-5 shadow-luxe transition hover:-translate-y-0.5 hover:ring-1 hover:ring-accent"
            >
              <Icon className="size-5 text-primary" />
              <div className="mt-3 font-medium">{label}</div>
              <p className="mt-1 text-sm text-muted-foreground">{description}</p>
            </Link>
          ))}
        </div>
      </section>
      <div className="mt-10 grid gap-6 xl:grid-cols-2">
        <RecentBookings bookings={data?.recentBookings ?? []} />
        <RecentOrders orders={data?.recentOrders ?? []} />
      </div>
    </div>
  );
}

function RecentBookings({ bookings }: { bookings: Booking[] }) {
  return (
    <section className="bg-card shadow-luxe">
      <div className="flex items-center justify-between gap-3 border-b border-border p-5">
        <h2 className="font-display text-xl">Recent Bookings</h2>
        <Link to="/staff/bookings" className="text-sm text-primary hover:underline">
          View all
        </Link>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="p-3">Guest</th>
              <th className="p-3">Room</th>
              <th className="p-3">Check-in</th>
              <th className="p-3">Status</th>
              <th className="p-3">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {bookings.length ? (
              bookings.map((booking) => (
                <tr key={booking.id}>
                  <td className="p-3">{booking.guest_name}</td>
                  <td className="p-3">{booking.room_code}</td>
                  <td className="p-3">{booking.check_in}</td>
                  <td className="p-3 capitalize">{booking.status.replaceAll("_", " ")}</td>
                  <td className="p-3">{lkr(booking.total)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="p-5 text-center text-muted-foreground">
                  No recent bookings.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function RecentOrders({ orders }: { orders: Order[] }) {
  return (
    <section className="bg-card shadow-luxe">
      <div className="flex items-center justify-between gap-3 border-b border-border p-5">
        <h2 className="font-display text-xl">Recent Food Orders</h2>
        <Link to="/staff/orders" className="text-sm text-primary hover:underline">
          View all
        </Link>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="p-3">Bill</th>
              <th className="p-3">Customer</th>
              <th className="p-3">Items</th>
              <th className="p-3">Time</th>
              <th className="p-3">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {orders.length ? (
              orders.map((order) => (
                <tr key={order.id}>
                  <td className="p-3">#{order.order_no}</td>
                  <td className="p-3">{order.customer_name || "Walk-in"}</td>
                  <td className="p-3">
                    {order.order_items.reduce((sum, item) => sum + Number(item.qty), 0)}
                  </td>
                  <td className="p-3">{new Date(order.created_at).toLocaleString()}</td>
                  <td className="p-3">{lkr(order.total)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="p-5 text-center text-muted-foreground">
                  No recent food orders.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
