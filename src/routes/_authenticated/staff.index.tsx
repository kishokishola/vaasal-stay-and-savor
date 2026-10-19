import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getBookings, getOrders } from "@/lib/firebase-data";
import { lkr } from "@/lib/hotel";

export const Route = createFileRoute("/_authenticated/staff/")({
  component: Overview,
});

function Overview() {
  const today = new Date().toISOString().slice(0, 10);
  const { data } = useQuery({
    queryKey: ["overview", today],
    queryFn: async () => {
      const [bookings, orders] = await Promise.all([getBookings(), getOrders()]);
      const todaysOrders = orders.filter((order) => order.created_at.startsWith(today));
      return {
        pending: bookings.filter((booking) => booking.status === "pending").length,
        arrivals: bookings.filter(
          (booking) => booking.check_in === today && booking.status === "confirmed",
        ).length,
        inHouse: bookings.filter((booking) => booking.status === "checked_in").length,
        sales: todaysOrders.reduce((sum, order) => sum + Number(order.total), 0),
        orderCount: todaysOrders.length,
      };
    },
  });
  const cards = [
    { l: "Pending requests", v: data?.pending ?? "–", to: "/staff/bookings" },
    { l: "Arrivals today", v: data?.arrivals ?? "–", to: "/staff/bookings" },
    { l: "Guests in house", v: data?.inHouse ?? "–", to: "/staff/bookings" },
    {
      l: `Restaurant today (${data?.orderCount ?? 0} bills)`,
      v: data ? lkr(data.sales) : "–",
      to: "/staff/orders",
    },
  ] as const;
  return (
    <div>
      <div className="eyebrow">Overview</div>
      <h1 className="mt-2 text-4xl">Good day</h1>
      <div className="mt-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((c) => (
          <Link
            key={c.l}
            to={c.to}
            className="bg-card p-6 shadow-luxe hover:-translate-y-0.5 transition"
          >
            <div className="text-xs uppercase tracking-widest text-muted-foreground">{c.l}</div>
            <div className="mt-3 font-display text-4xl text-primary">{c.v}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
