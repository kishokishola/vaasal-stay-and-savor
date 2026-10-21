import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, ChefHat, Clock, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getOrders,
  subscribeToOrders,
  updateOrderStatus,
  closeKitchenOrder,
} from "@/lib/firebase-data";
import { useFirestoreRealtime } from "@/hooks/useFirestoreRealtime";
import { lkr } from "@/lib/hotel";

export const Route = createFileRoute("/_authenticated/staff/kitchen")({
  component: Kitchen,
});

const columns = [
  { status: "placed", title: "Placed", next: "in_prep", action: "Start preparing" },
  { status: "in_prep", title: "In preparation", next: "ready", action: "Mark ready" },
  { status: "ready", title: "Ready", next: "delivered", action: "Mark out" },
  { status: "delivered", title: "Out", next: null, action: "" },
] as const;

function Kitchen() {
  const qc = useQueryClient();
  const [now, setNow] = useState(Date.now());
  const {
    data: orders,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["orders"],
    queryFn: getOrders,
  });
  useFirestoreRealtime(["orders"], subscribeToOrders);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  async function moveOrder(id: string, status: string) {
    try {
      await updateOrderStatus(id, status);
      await qc.invalidateQueries({ queryKey: ["orders"] });
      await qc.invalidateQueries({ queryKey: ["customer-order-requests"] });
      toast.success("Kitchen order updated.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update kitchen order.");
    }
  }

  async function closeOrder(id: string) {
    try {
      await closeKitchenOrder(id);
      await qc.invalidateQueries({ queryKey: ["orders"] });
      toast.success("Completed ticket closed.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not close this ticket.");
    }
  }

  return (
    <div>
      <div className="eyebrow">Restaurant</div>
      <h1 className="mt-2 text-4xl">Kitchen order queue</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Live tickets move from placed through preparation to ready and out.
      </p>
      {isError && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {error instanceof Error ? error.message : "Could not load kitchen orders."}
        </p>
      )}
      <div className="mt-6 grid gap-4 xl:grid-cols-4">
        {columns.map((column) => {
          const tickets = (orders ?? [])
            .filter((order) => {
              if (column.status === "delivered") {
                const changedAt = Date.parse(order.order_status_updated_at ?? order.created_at);
                return (
                  order.status === "delivered" &&
                  !order.is_closed &&
                  now - changedAt < 10 * 60 * 1000
                );
              }
              return order.status === column.status;
            })
            .sort((a, b) => a.created_at.localeCompare(b.created_at));
          return (
            <section key={column.status} className="min-h-64 bg-card p-4 shadow-luxe">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <h2 className="font-display text-xl">{column.title}</h2>
                <span className="rounded-full bg-muted px-2 py-1 text-xs">{tickets.length}</span>
              </div>
              {isLoading && <p className="py-4 text-sm text-muted-foreground">Loading…</p>}
              {!isLoading && !tickets.length && (
                <p className="py-4 text-sm text-muted-foreground">No tickets.</p>
              )}
              <div className="space-y-3 pt-3">
                {tickets.map((order) => (
                  <article key={order.id} className="border border-border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-display text-lg">#{order.order_no}</div>
                        <div className="text-xs text-muted-foreground">
                          {order.order_type.replace("_", " ")}
                          {order.table_no && ` · Table ${order.table_no}`}
                          {order.room_code && ` · Room ${order.room_code}`}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="size-3" />
                        {new Date(order.created_at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                    </div>
                    <p className="mt-2 text-sm font-medium">{order.customer_name || "Walk-in"}</p>
                    <ul className="mt-2 space-y-1 text-sm">
                      {order.order_items.map((item) => (
                        <li key={item.id}>
                          {item.qty} × {item.name}
                        </li>
                      ))}
                    </ul>
                    {order.status_note && (
                      <p className="mt-2 border-t border-border pt-2 text-xs text-muted-foreground">
                        Note: {order.status_note}
                      </p>
                    )}
                    <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                      <span>{order.payment_status ?? "paid"}</span>
                      <span>{lkr(order.total)}</span>
                    </div>
                    {column.next ? (
                      <Button
                        size="sm"
                        className="mt-3 w-full"
                        onClick={() => void moveOrder(order.id, column.next)}
                      >
                        {column.status === "placed" ? <ChefHat /> : <Check />}
                        {column.action}
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-3 w-full"
                        onClick={() => void closeOrder(order.id)}
                      >
                        <X /> Close ticket
                      </Button>
                    )}
                  </article>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
