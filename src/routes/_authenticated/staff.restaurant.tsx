import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, ClipboardList, ShoppingCart, UtensilsCrossed } from "lucide-react";
import { getOrders, subscribeToMenuItems, subscribeToOrders } from "@/lib/firebase-data";
import { getPublicMenuItems } from "@/lib/public-catalog";
import { useFirestoreRealtime } from "@/hooks/useFirestoreRealtime";
import { hotelDayBounds, hotelToday } from "@/lib/dates";
import { collectedOrderAmount, lkr } from "@/lib/hotel";

export const Route = createFileRoute("/_authenticated/staff/restaurant")({
  component: RestaurantDashboard,
});

function RestaurantDashboard() {
  const today = hotelToday();
  const bounds = hotelDayBounds(today);
  const queryKey = ["restaurant-dashboard", today];
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey,
    queryFn: async () => {
      const [orders, menu] = await Promise.all([getOrders(), getPublicMenuItems()]);
      const todaysOrders = orders.filter(
        (order) => order.created_at >= bounds.start && order.created_at < bounds.end,
      );
      const nonCancelled = todaysOrders.filter((order) => order.status !== "cancelled");
      const itemTotals = new Map<string, number>();
      for (const order of nonCancelled) {
        for (const item of order.order_items) {
          itemTotals.set(item.name, (itemTotals.get(item.name) ?? 0) + Number(item.qty));
        }
      }
      const topItem = [...itemTotals.entries()].sort((a, b) => b[1] - a[1])[0];

      return {
        todayOrderCount: nonCancelled.length,
        todaySales: nonCancelled.reduce((sum, order) => sum + Number(order.total), 0),
        todayCollected: nonCancelled.reduce((sum, order) => sum + collectedOrderAmount(order), 0),
        openOrders: orders.filter(
          (order) => !["delivered", "cancelled"].includes(order.status) && order.is_closed !== true,
        ).length,
        unpaidBalance: orders
          .filter((order) => order.status !== "cancelled")
          .reduce(
            (sum, order) => sum + Math.max(0, Number(order.total) - collectedOrderAmount(order)),
            0,
          ),
        availableMenuItems: menu.filter((item) => item.available && !item.deleted).length,
        topItem: topItem ? `${topItem[0]} · ${topItem[1]} sold` : "No sales yet",
      };
    },
  });
  useFirestoreRealtime(queryKey, subscribeToOrders);
  useFirestoreRealtime(queryKey, subscribeToMenuItems);

  const metrics = [
    { label: "Orders today", value: data?.todayOrderCount ?? "–" },
    { label: "Open kitchen tickets", value: data?.openOrders ?? "–" },
    { label: "Today's sales", value: data ? lkr(data.todaySales) : "–" },
    { label: "Collected today", value: data ? lkr(data.todayCollected) : "–" },
    { label: "Outstanding balance", value: data ? lkr(data.unpaidBalance) : "–" },
    { label: "Available menu items", value: data?.availableMenuItems ?? "–" },
  ];
  const actions = [
    {
      label: "Create order",
      description: "Build a dine-in, takeaway, or room-service bill.",
      to: "/staff/pos",
      icon: ShoppingCart,
    },
    {
      label: "Order queue",
      description: "Find active tickets, record payments, and review order history.",
      to: "/staff/orders",
      hash: () => "order-queue",
      icon: ClipboardList,
    },
    {
      label: "Restaurant reports",
      description: "Review sales, top-selling items, and payment methods.",
      to: "/staff/orders",
      hash: () => "restaurant-reports",
      icon: BarChart3,
    },
  ] as const;

  return (
    <div>
      <div className="eyebrow">Restaurant cashier · {today}</div>
      <h1 className="mt-2 text-4xl">Restaurant operations</h1>
      {isLoading && (
        <p className="mt-6 text-sm text-muted-foreground">Loading live restaurant data…</p>
      )}
      {isError && (
        <div
          role="alert"
          className="mt-6 rounded-sm border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive"
        >
          <p>Restaurant data could not be loaded: {error.message}</p>
          <button className="mt-2 underline" onClick={() => void refetch()}>
            Try again
          </button>
        </div>
      )}
      <div className="mt-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {metrics.map((metric) => (
          <div key={metric.label} className="bg-card p-6 shadow-luxe">
            <div className="text-xs uppercase tracking-widest text-muted-foreground">
              {metric.label}
            </div>
            <div className="mt-3 font-display text-3xl text-primary">{metric.value}</div>
          </div>
        ))}
      </div>
      <section className="mt-10 bg-card p-6 shadow-luxe">
        <div className="eyebrow">Best seller today</div>
        <h2 className="mt-2 font-display text-2xl">{data?.topItem ?? "–"}</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          This dashboard refreshes automatically as orders and menu availability change.
        </p>
      </section>
      <section className="mt-10">
        <div className="eyebrow">Quick access</div>
        <h2 className="mt-2 font-display text-2xl">Restaurant tools</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {actions.map((action) => {
            const { label, description, to, icon: Icon } = action;
            const hashOption = "hash" in action ? { hash: action.hash } : {};
            return (
              <Link
                key={label}
                to={to}
                {...hashOption}
                className="bg-card p-5 shadow-luxe transition hover:-translate-y-0.5 hover:ring-1 hover:ring-accent"
              >
                <div className="flex items-center gap-3 font-medium text-primary">
                  <Icon className="size-5" />
                  {label}
                </div>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p>
              </Link>
            );
          })}
        </div>
        <Link
          to="/staff/pos"
          className="mt-6 inline-flex items-center gap-2 text-sm text-primary hover:underline"
        >
          <UtensilsCrossed className="size-4" />
          Open restaurant POS
        </Link>
      </section>
    </div>
  );
}
