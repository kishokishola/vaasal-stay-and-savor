import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getBookings, getOrders } from "@/lib/firebase-data";
import { lkr } from "@/lib/hotel";

export const Route = createFileRoute("/_authenticated/staff/")({
  component: Overview,
});

function Overview() {
  const today = new Date().toISOString().slice(0, 10);
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["overview", today],
    queryFn: async () => {
      const [bookings, orders] = await Promise.all([getBookings(), getOrders()]);
      const todaysOrders = orders.filter((order) => order.created_at.startsWith(today));
      return {
        bookings,
        pending: bookings.filter((booking) => booking.status === "pending").length,
        arrivals: bookings.filter(
          (booking) => booking.check_in === today && booking.status === "confirmed",
        ).length,
        inHouse: bookings
          .filter((booking) => booking.status === "checked_in")
          .reduce((guests, booking) => guests + Number(booking.guests), 0),
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
  const actions = [
    {
      label: "Manage bookings",
      description: "Confirm stays and update guest arrivals.",
      to: "/staff/bookings",
    },
    {
      label: "Manage rooms",
      description: "Edit prices, room details, photos, and availability.",
      to: "/staff/rooms",
    },
    {
      label: "Open restaurant POS",
      description: "Create dine-in, takeaway, and room-service bills.",
      to: "/staff/pos",
    },
    {
      label: "View sales",
      description: "Review orders, payment methods, and daily totals.",
      to: "/staff/orders",
    },
    {
      label: "Manage menu",
      description: "Update food items, prices, and availability.",
      to: "/staff/menu",
    },
    {
      label: "Manage staff",
      description: "Create staff logins and assign protected roles.",
      to: "/staff/team",
    },
  ] as const;
  const upcoming = (data?.bookings ?? [])
    .filter(
      (booking) =>
        booking.check_out >= today &&
        booking.status !== "cancelled" &&
        booking.status !== "checked_out",
    )
    .sort((a, b) => a.check_in.localeCompare(b.check_in))
    .slice(0, 5);
  return (
    <div>
      <div className="eyebrow">Overview</div>
      <h1 className="mt-2 text-4xl">Good day</h1>
      {isLoading && <p className="mt-6 text-sm text-muted-foreground">Loading hotel operations…</p>}
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
      <div className="mt-10 grid gap-8 xl:grid-cols-[1fr_1.2fr]">
        <section className="bg-card p-6 shadow-luxe">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="eyebrow">Hotel operations</div>
              <h2 className="mt-2 font-display text-2xl">Upcoming stays</h2>
            </div>
            <Link to="/staff/bookings" className="text-sm text-primary hover:underline">
              All bookings
            </Link>
          </div>
          {!isLoading && !isError && !upcoming.length && (
            <p className="mt-6 text-sm text-muted-foreground">
              No bookings have been recorded yet.
            </p>
          )}
          <div className="mt-4 divide-y divide-border">
            {upcoming.map((booking) => (
              <div
                key={booking.id}
                className="flex flex-wrap items-center justify-between gap-2 py-3"
              >
                <div>
                  <div className="font-medium">{booking.guest_name}</div>
                  <div className="text-xs text-muted-foreground">
                    {booking.room_code} · {booking.check_in} → {booking.check_out}
                  </div>
                </div>
                <span className="text-xs capitalize text-muted-foreground">
                  {booking.status.replace("_", " ")}
                </span>
              </div>
            ))}
          </div>
        </section>
        <section>
          <div className="eyebrow">Quick access</div>
          <h2 className="mt-2 font-display text-2xl">Manage your hotel</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {actions.map((action) => (
              <Link
                key={action.to}
                to={action.to}
                className="bg-card p-5 shadow-luxe transition hover:-translate-y-0.5 hover:ring-1 hover:ring-accent"
              >
                <div className="font-medium text-primary">{action.label}</div>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  {action.description}
                </p>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
