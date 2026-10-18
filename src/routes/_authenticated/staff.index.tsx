import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { lkr } from "@/lib/hotel";

export const Route = createFileRoute("/_authenticated/staff/")({
  component: Overview,
});

function Overview() {
  const today = new Date().toISOString().slice(0, 10);
  const { data } = useQuery({
    queryKey: ["overview", today],
    queryFn: async () => {
      const [pending, arrivals, inHouse, orders] = await Promise.all([
        supabase.from("bookings").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("bookings").select("id", { count: "exact", head: true }).eq("check_in", today).eq("status", "confirmed"),
        supabase.from("bookings").select("id", { count: "exact", head: true }).eq("status", "checked_in"),
        supabase.from("orders").select("total").gte("created_at", today),
      ]);
      return {
        pending: pending.count ?? 0,
        arrivals: arrivals.count ?? 0,
        inHouse: inHouse.count ?? 0,
        sales: (orders.data ?? []).reduce((s, o) => s + Number(o.total), 0),
        orderCount: orders.data?.length ?? 0,
      };
    },
  });
  const cards = [
    { l: "Pending requests", v: data?.pending ?? "–", to: "/staff/bookings" },
    { l: "Arrivals today", v: data?.arrivals ?? "–", to: "/staff/bookings" },
    { l: "Guests in house", v: data?.inHouse ?? "–", to: "/staff/bookings" },
    { l: `Restaurant today (${data?.orderCount ?? 0} bills)`, v: data ? lkr(data.sales) : "–", to: "/staff/orders" },
  ] as const;
  return (
    <div>
      <div className="eyebrow">Overview</div>
      <h1 className="mt-2 text-4xl">Good day</h1>
      <div className="mt-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((c) => (
          <Link key={c.l} to={c.to} className="bg-card p-6 shadow-luxe hover:-translate-y-0.5 transition">
            <div className="text-xs uppercase tracking-widest text-muted-foreground">{c.l}</div>
            <div className="mt-3 font-display text-4xl text-primary">{c.v}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
