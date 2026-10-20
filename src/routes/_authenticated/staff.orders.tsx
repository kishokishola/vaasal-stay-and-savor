import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  getCustomerOrderRequests,
  getOrders,
  subscribeToCustomerOrderRequests,
  subscribeToOrders,
  updateCustomerOrderRequestStatus,
  updateOrderStatus,
} from "@/lib/firebase-data";
import { useFirestoreRealtime } from "@/hooks/useFirestoreRealtime";
import { hotelDayBounds, hotelToday } from "@/lib/dates";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { lkr } from "@/lib/hotel";

export const Route = createFileRoute("/_authenticated/staff/orders")({
  component: Orders,
});

function Orders() {
  const qc = useQueryClient();
  const [day, setDay] = useState(hotelToday());
  const bounds = hotelDayBounds(day);
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["orders", day],
    queryFn: async () =>
      (await getOrders()).filter(
        (order) => order.created_at >= bounds.start && order.created_at < bounds.end,
      ),
  });
  useFirestoreRealtime(["orders", day], subscribeToOrders);
  const {
    data: requests,
    isLoading: requestsLoading,
    isError: requestsError,
    error: requestsLoadError,
  } = useQuery({
    queryKey: ["customer-order-requests", day],
    queryFn: async () =>
      (await getCustomerOrderRequests()).filter(
        (request) => request.created_at >= bounds.start && request.created_at < bounds.end,
      ),
  });
  useFirestoreRealtime(["customer-order-requests", day], subscribeToCustomerOrderRequests);
  const paidOrders = (data ?? []).filter(
    (order) =>
      order.payment_status === "paid" ||
      order.payment_method === "room_bill" ||
      (!order.payment_status && order.status !== "pending"),
  );
  const total = paidOrders
    .filter((order) => order.status !== "cancelled")
    .reduce((s, o) => s + Number(o.total), 0);
  const by = (m: string) =>
    paidOrders
      .filter((o) => o.payment_method === m && o.status !== "cancelled")
      .reduce((s, o) => s + Number(o.total), 0);
  async function changeStatus(id: string, status: string) {
    try {
      await updateOrderStatus(id, status);
      await qc.invalidateQueries({ queryKey: ["orders"] });
      toast.success("Order status updated.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update order status.");
    }
  }
  async function changeRequestStatus(id: string, status: string) {
    try {
      await updateCustomerOrderRequestStatus(id, status);
      await qc.invalidateQueries({ queryKey: ["customer-order-requests"] });
      toast.success("Customer order request updated.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update the order request.");
    }
  }
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="eyebrow">Restaurant</div>
          <h1 className="mt-2 text-4xl">Orders & Sales</h1>
        </div>
        <Input type="date" className="w-44" value={day} onChange={(e) => setDay(e.target.value)} />
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-4">
        {[
          ["Total sales", total],
          ["Cash", by("cash")],
          ["Card", by("card")],
          ["Charged to rooms", by("room_bill")],
        ].map(([l, v]) => (
          <div key={l as string} className="bg-card p-5 shadow-luxe">
            <div className="text-xs uppercase tracking-widest text-muted-foreground">{l}</div>
            <div className="mt-2 font-display text-2xl text-primary">{lkr(v as number)}</div>
          </div>
        ))}
      </div>
      <div className="mt-6 overflow-x-auto bg-card shadow-luxe">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>#</TableHead>
              <TableHead>Time</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Items</TableHead>
              <TableHead>Payment</TableHead>
              <TableHead>Order status</TableHead>
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={8}>Loading orders…</TableCell>
              </TableRow>
            )}
            {isError && (
              <TableRow>
                <TableCell colSpan={8} role="alert" className="text-destructive">
                  {error instanceof Error ? error.message : "Could not load orders."}
                </TableCell>
              </TableRow>
            )}
            {!isLoading && !isError && data?.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-muted-foreground">
                  No orders this day.
                </TableCell>
              </TableRow>
            )}
            {data?.map((o) => (
              <TableRow key={o.id}>
                <TableCell>{o.order_no}</TableCell>
                <TableCell className="text-sm">
                  {new Date(o.created_at).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </TableCell>
                <TableCell className="text-sm">
                  {o.order_type.replace("_", " ")} {o.table_no && `· T${o.table_no}`}{" "}
                  {o.room_code && `· ${o.room_code}`}
                </TableCell>
                <TableCell className="text-sm">
                  {o.customer_name || "Walk-in"}
                  {o.customer_phone && (
                    <div className="text-xs text-muted-foreground">{o.customer_phone}</div>
                  )}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {o.order_items.map((i) => `${i.qty}× ${i.name}`).join(", ")}
                </TableCell>
                <TableCell className="space-y-1">
                  <Badge variant="secondary">{o.payment_method.replace("_", " ")}</Badge>
                  <div>
                    <Badge variant={o.payment_status === "unpaid" ? "destructive" : "outline"}>
                      {o.payment_status ?? "paid"}
                    </Badge>
                  </div>
                </TableCell>
                <TableCell>
                  <Select
                    value={
                      ["placed", "in_prep", "ready", "delivered", "cancelled"].includes(o.status)
                        ? o.status
                        : "placed"
                    }
                    onValueChange={(status) => changeStatus(o.id, status)}
                  >
                    <SelectTrigger className="w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="placed">Placed</SelectItem>
                      <SelectItem value="in_prep">In preparation</SelectItem>
                      <SelectItem value="ready">Ready</SelectItem>
                      <SelectItem value="delivered">Delivered</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="text-right">{lkr(o.total)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="mt-10">
        <div className="eyebrow">Website orders</div>
        <h2 className="mt-2 font-display text-2xl">Customer order requests</h2>
        <div className="mt-4 overflow-x-auto bg-card shadow-luxe">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Reference</TableHead>
                <TableHead>Received</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Order type</TableHead>
                <TableHead>Items requested</TableHead>
                <TableHead>Estimated subtotal</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requestsLoading && (
                <TableRow>
                  <TableCell colSpan={7}>Loading customer requests…</TableCell>
                </TableRow>
              )}
              {requestsError && (
                <TableRow>
                  <TableCell colSpan={7} role="alert" className="text-destructive">
                    {requestsLoadError instanceof Error
                      ? requestsLoadError.message
                      : "Could not load customer order requests."}
                  </TableCell>
                </TableRow>
              )}
              {!requestsLoading && !requestsError && !requests?.length && (
                <TableRow>
                  <TableCell colSpan={7} className="text-muted-foreground">
                    No website order requests this day.
                  </TableCell>
                </TableRow>
              )}
              {requests?.map((request) => (
                <TableRow key={request.id}>
                  <TableCell className="font-mono text-xs">{request.id.slice(0, 8)}</TableCell>
                  <TableCell className="text-sm">
                    {new Date(request.created_at).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </TableCell>
                  <TableCell className="text-sm">
                    {request.customer_name}
                    <div className="text-xs text-muted-foreground">{request.customer_phone}</div>
                  </TableCell>
                  <TableCell className="text-sm">
                    {request.order_type.replace("_", " ")}
                    {request.order_reference && (
                      <div className="text-xs text-muted-foreground">
                        {request.order_type === "room" ? "Room" : "Table"} {request.order_reference}
                      </div>
                    )}
                    {request.notes && (
                      <div className="text-xs text-muted-foreground">Note: {request.notes}</div>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-pre-wrap text-xs text-muted-foreground">
                    {request.items_summary}
                  </TableCell>
                  <TableCell>{lkr(request.subtotal_estimate)}</TableCell>
                  <TableCell>
                    <Select
                      value={request.status}
                      onValueChange={(status) => changeRequestStatus(request.id, status)}
                    >
                      <SelectTrigger className="w-40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="confirmed">Confirmed</SelectItem>
                        <SelectItem value="in_prep">In preparation</SelectItem>
                        <SelectItem value="ready">Ready</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                        <SelectItem value="cancelled">Cancelled</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Online order subtotals are estimates until staff verifies the menu and enters the final
          bill in the POS.
        </p>
      </div>
    </div>
  );
}
