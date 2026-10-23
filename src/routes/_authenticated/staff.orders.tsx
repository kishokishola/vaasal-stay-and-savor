import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Download, Eye, Printer, X } from "lucide-react";
import {
  convertCustomerOrderRequestToOrder,
  getCustomerOrderRequests,
  getOrders,
  subscribeToCustomerOrderRequests,
  subscribeToOrders,
  updateCustomerOrderRequestStatus,
  updateOrderStatus,
  recordOrderPayment,
  type Order,
} from "@/lib/firebase-data";
import { useFirestoreRealtime } from "@/hooks/useFirestoreRealtime";
import { hotelDayBounds, hotelToday } from "@/lib/dates";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { collectedOrderAmount, HOTEL, rateAmount } from "@/lib/hotel";

export const Route = createFileRoute("/_authenticated/staff/orders")({
  component: Orders,
});

type View = "open" | "today" | "all";
type PaymentMethod = "cash" | "card" | "online";

function csvCell(value: string | number) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function collectedFor(order: Order) {
  return collectedOrderAmount(order);
}

function orderCurrency(order: Order) {
  return order.price_currency ?? "LKR";
}

function currencyTotals(orders: Order[], amount: (order: Order) => number) {
  return {
    LKR: orders.reduce(
      (sum, order) => sum + (orderCurrency(order) === "LKR" ? amount(order) : 0),
      0,
    ),
    USD: orders.reduce(
      (sum, order) => sum + (orderCurrency(order) === "USD" ? amount(order) : 0),
      0,
    ),
  };
}

function formatCurrencyTotals(values: { LKR: number; USD: number }) {
  return `${rateAmount(values.LKR, "LKR")} · ${rateAmount(values.USD, "USD")}`;
}

function printOrder(order: Order) {
  const popup = window.open("", "_blank", "popup,width=420,height=720");
  if (!popup) {
    toast.error("Allow pop-ups to print this order.");
    return;
  }
  const entities: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };
  const escape = (value: string | number) =>
    String(value).replace(/[&<>"']/g, (character) => entities[character] ?? character);
  const currency = orderCurrency(order);
  const items = order.order_items
    .map(
      (item) =>
        `<div class="row"><span>${escape(item.qty)} × ${escape(item.name)}</span><span>${rateAmount(Number(item.qty) * Number(item.price), currency)}</span></div>`,
    )
    .join("");
  popup.document.write(`<!doctype html><html><head><title>Bill ${escape(order.order_no)}</title>
    <style>body{font:14px Arial,sans-serif;margin:24px;color:#111}header{text-align:center;border-bottom:1px dashed #777;padding-bottom:12px;margin-bottom:12px}.row{display:flex;justify-content:space-between;gap:16px;margin:7px 0}.total{font-weight:bold;border-top:1px dashed #777;padding-top:10px;margin-top:10px}.muted{color:#555;font-size:12px}</style>
    </head><body><header><h2>${escape(HOTEL.name)}</h2><div>${escape(HOTEL.address)}</div><div>${escape(HOTEL.phone)}</div></header>
    <div class="row"><span>Bill #${escape(order.order_no)}</span><span>${escape(new Date(order.created_at).toLocaleString())}</span></div>
    <div class="muted">${escape(order.order_type.replace("_", " "))}${order.table_no ? ` · Table ${escape(order.table_no)}` : ""}${order.room_code ? ` · Room ${escape(order.room_code)}` : ""}</div>
    <div class="muted">${escape(order.customer_name ?? "Walk-in")} · ${escape(order.customer_phone ?? "")}</div>
    <hr>${items}<hr>
    <div class="row"><span>Subtotal</span><span>${rateAmount(order.subtotal, currency)}</span></div>
    <div class="row"><span>Discount</span><span>− ${rateAmount(order.discount, currency)}</span></div>
    <div class="row"><span>Service charge</span><span>${rateAmount(order.service_charge, currency)}</span></div>
    <div class="row"><span>Tax</span><span>${rateAmount(order.tax ?? 0, currency)}</span></div>
    <div class="row total"><span>Total</span><span>${rateAmount(order.total, currency)}</span></div>
    <div class="row"><span>Paid (${escape(order.payment_method)})</span><span>${rateAmount(collectedFor(order), currency)}</span></div>
    <div class="row"><span>Payment status</span><span>${escape(order.payment_status ?? "paid")}</span></div>
    <p class="muted" style="text-align:center;margin-top:24px">Thank you</p></body></html>`);
  popup.document.close();
  popup.focus();
  popup.print();
}

function Orders() {
  const qc = useQueryClient();
  const [view, setView] = useState<View>("today");
  const [reportFrom, setReportFrom] = useState(hotelToday());
  const [reportTo, setReportTo] = useState(hotelToday());
  const [paidOnly, setPaidOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
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
  const {
    data: requests,
    isLoading: requestsLoading,
    isError: requestsError,
    error: requestsLoadError,
  } = useQuery({
    queryKey: ["customer-order-requests"],
    queryFn: getCustomerOrderRequests,
  });
  useFirestoreRealtime(["customer-order-requests"], subscribeToCustomerOrderRequests);

  const allOrders = useMemo(() => orders ?? [], [orders]);
  const todayBounds = hotelDayBounds(hotelToday());
  const visibleOrders = useMemo(() => {
    const term = search.trim().toLowerCase();
    return allOrders.filter((order) => {
      if (view === "open" && ["delivered", "cancelled"].includes(order.status)) return false;
      if (
        view === "today" &&
        (order.created_at < todayBounds.start || order.created_at >= todayBounds.end)
      )
        return false;
      return (
        !term ||
        String(order.order_no).includes(term) ||
        order.customer_name?.toLowerCase().includes(term) ||
        order.customer_phone?.toLowerCase().includes(term) ||
        order.order_items.some((item) => item.name.toLowerCase().includes(term))
      );
    });
  }, [allOrders, search, todayBounds.end, todayBounds.start, view]);
  const reportBounds = useMemo(
    () => ({ start: hotelDayBounds(reportFrom).start, end: hotelDayBounds(reportTo).end }),
    [reportFrom, reportTo],
  );
  const dateRangeOrders = useMemo(
    () =>
      allOrders.filter(
        (order) => order.created_at >= reportBounds.start && order.created_at < reportBounds.end,
      ),
    [allOrders, reportBounds],
  );
  const reportOrders = useMemo(
    () =>
      paidOnly
        ? dateRangeOrders.filter((order) => order.status !== "cancelled" && collectedFor(order) > 0)
        : dateRangeOrders,
    [dateRangeOrders, paidOnly],
  );
  const reportSales = useMemo(
    () => reportOrders.filter((order) => order.status !== "cancelled"),
    [reportOrders],
  );
  const gross = currencyTotals(reportSales, (order) => Number(order.total));
  const collected = currencyTotals(reportSales, collectedFor);
  const due = {
    LKR: Math.max(0, gross.LKR - collected.LKR),
    USD: Math.max(0, gross.USD - collected.USD),
  };
  const activeOrder = allOrders.find((order) => order.id === selectedId) ?? null;

  const topItems = useMemo(() => {
    const totals = new Map<
      string,
      { name: string; currency: "LKR" | "USD"; qty: number; sales: number }
    >();
    for (const order of reportSales) {
      const currency = orderCurrency(order);
      for (const item of order.order_items) {
        const key = `${currency}:${item.name}`;
        const current = totals.get(key) ?? { name: item.name, currency, qty: 0, sales: 0 };
        current.qty += Number(item.qty);
        current.sales += Number(item.qty) * Number(item.price);
        totals.set(key, current);
      }
    }
    return [...totals.entries()]
      .map(([, values]) => values)
      .sort((a, b) => b.qty - a.qty || b.sales - a.sales)
      .slice(0, 10);
  }, [reportSales]);
  const paymentMix = useMemo(() => {
    const totals = new Map<string, { method: string; currency: "LKR" | "USD"; amount: number }>();
    for (const order of reportSales) {
      const currency = orderCurrency(order);
      const history = order.payment_history ?? [];
      if (history.length) {
        for (const payment of history) {
          const key = `${payment.method}:${currency}`;
          const current = totals.get(key) ?? { method: payment.method, currency, amount: 0 };
          current.amount += Number(payment.amount);
          totals.set(key, current);
        }
      } else {
        const amount = collectedFor(order);
        if (amount > 0) {
          const key = `${order.payment_method}:${currency}`;
          const current = totals.get(key) ?? {
            method: order.payment_method,
            currency,
            amount: 0,
          };
          current.amount += amount;
          totals.set(key, current);
        }
      }
    }
    return [...totals.values()].sort((a, b) => b.amount - a.amount);
  }, [reportSales]);
  const salesByDay = useMemo(() => {
    const totals = new Map<
      string,
      { date: string; currency: "LKR" | "USD"; orders: number; gross: number; collected: number }
    >();
    for (const order of reportOrders) {
      const date = hotelToday(new Date(order.created_at));
      const currency = orderCurrency(order);
      const key = `${date}:${currency}`;
      const current = totals.get(key) ?? { date, currency, orders: 0, gross: 0, collected: 0 };
      current.orders += 1;
      if (order.status !== "cancelled") {
        current.gross += Number(order.total);
        current.collected += collectedFor(order);
      }
      totals.set(key, current);
    }
    return [...totals.values()].sort(
      (a, b) => a.date.localeCompare(b.date) || a.currency.localeCompare(b.currency),
    );
  }, [reportOrders]);

  async function changeStatus(id: string, status: string) {
    if (
      status === "cancelled" &&
      !window.confirm("Cancel this order and mark any paid amount refunded?")
    )
      return;
    try {
      await updateOrderStatus(id, status);
      await qc.invalidateQueries({ queryKey: ["orders"] });
      await qc.invalidateQueries({ queryKey: ["customer-order-requests"] });
      toast.success("Order status updated.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update order status.");
    }
  }

  async function acceptRequest(id: string) {
    try {
      const order = await convertCustomerOrderRequestToOrder(id);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["orders"] }),
        qc.invalidateQueries({ queryKey: ["customer-order-requests"] }),
      ]);
      toast.success(`Added to POS as order #${order.order_no}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not accept this order request.");
    }
  }

  async function cancelRequest(id: string) {
    try {
      await updateCustomerOrderRequestStatus(id, "cancelled");
      await qc.invalidateQueries({ queryKey: ["customer-order-requests"] });
      toast.success("Customer order request cancelled.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not cancel the request.");
    }
  }

  async function collectPayment() {
    if (!activeOrder) return;
    try {
      await recordOrderPayment(activeOrder.id, Number(paymentAmount), paymentMethod);
      setPaymentAmount("");
      await qc.invalidateQueries({ queryKey: ["orders"] });
      toast.success("Payment recorded.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not record payment.");
    }
  }

  function exportSummary() {
    const grouped = new Map<
      string,
      { date: string; currency: "LKR" | "USD"; count: number; gross: number; collected: number }
    >();
    for (const order of reportOrders) {
      const date = hotelToday(new Date(order.created_at));
      const currency = orderCurrency(order);
      const key = `${date}:${currency}`;
      const item = grouped.get(key) ?? { date, currency, count: 0, gross: 0, collected: 0 };
      item.count += 1;
      if (order.status !== "cancelled") {
        item.gross += Number(order.total);
        item.collected += collectedFor(order);
      }
      grouped.set(key, item);
    }
    downloadCsv("vaasal-daily-sales.csv", [
      ["Date", "Currency", "Orders", "Gross sales", "Collected", "Due"],
      ...[...grouped.values()]
        .sort((a, b) => a.date.localeCompare(b.date) || a.currency.localeCompare(b.currency))
        .map((item) => [
          item.date,
          item.currency,
          item.count,
          item.gross.toFixed(2),
          item.collected.toFixed(2),
          Math.max(0, item.gross - item.collected).toFixed(2),
        ]),
    ]);
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="eyebrow">Restaurant</div>
          <h1 className="mt-2 text-4xl">Orders & Sales</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {(["open", "today", "all"] as const).map((filter) => (
            <Button
              key={filter}
              size="sm"
              variant={view === filter ? "default" : "outline"}
              onClick={() => setView(filter)}
            >
              {filter === "open" ? "Open" : filter === "today" ? "Today" : "All"}
            </Button>
          ))}
          <Input
            className="w-48"
            placeholder="Search order, guest or item"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {(() => {
          const average = {
            LKR: reportSales.length ? gross.LKR / reportSales.length : 0,
            USD: reportSales.length ? gross.USD / reportSales.length : 0,
          };
          return [
            ["Orders", reportOrders.length],
            ["Gross sales", formatCurrencyTotals(gross)],
            ["Collected", formatCurrencyTotals(collected)],
            ["Outstanding", formatCurrencyTotals(due)],
            ["Average bill", formatCurrencyTotals(average)],
          ];
        })().map(([label, value]) => (
          <div key={label} className="bg-card p-5 shadow-luxe">
            <div className="text-xs uppercase tracking-widest text-muted-foreground">{label}</div>
            <div className="mt-2 font-display text-2xl text-primary">{value}</div>
          </div>
        ))}
      </div>

      <div id="order-queue" className="mt-6 overflow-x-auto bg-card shadow-luxe">
        <Table className="mobile-card-table">
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
              <TableHead>Details</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={9}>Loading orders…</TableCell>
              </TableRow>
            )}
            {isError && (
              <TableRow>
                <TableCell colSpan={9} role="alert" className="text-destructive">
                  {error instanceof Error ? error.message : "Could not load orders."}
                </TableCell>
              </TableRow>
            )}
            {!isLoading && !isError && !visibleOrders.length && (
              <TableRow>
                <TableCell colSpan={9} className="text-muted-foreground">
                  No matching orders.
                </TableCell>
              </TableRow>
            )}
            {visibleOrders.map((order) => {
              const paid = collectedFor(order);
              return (
                <TableRow key={order.id}>
                  <TableCell data-label="#"> {order.order_no}</TableCell>
                  <TableCell data-label="Time" className="text-sm">
                    {new Date(order.created_at).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </TableCell>
                  <TableCell data-label="Type" className="text-sm">
                    {order.order_type.replace("_", " ")} {order.table_no && `· T${order.table_no}`}{" "}
                    {order.room_code && `· ${order.room_code}`}
                  </TableCell>
                  <TableCell data-label="Customer" className="text-sm">
                    {order.customer_name || "Walk-in"}
                    {order.customer_phone && (
                      <div className="text-xs text-muted-foreground">{order.customer_phone}</div>
                    )}
                  </TableCell>
                  <TableCell data-label="Items" className="max-w-64 text-xs text-muted-foreground">
                    {order.order_items.map((item) => `${item.qty}× ${item.name}`).join(", ")}
                  </TableCell>
                  <TableCell data-label="Payment" className="space-y-1">
                    <Badge variant="secondary">{order.payment_method.replace("_", " ")}</Badge>
                    <div className="text-xs">
                      <Badge
                        variant={order.payment_status === "unpaid" ? "destructive" : "outline"}
                      >
                        {order.payment_status ?? "paid"}
                      </Badge>
                      <div className="mt-1 text-muted-foreground">
                        {rateAmount(paid, orderCurrency(order))} paid ·{" "}
                        {rateAmount(Math.max(0, Number(order.total) - paid), orderCurrency(order))}{" "}
                        due
                      </div>
                    </div>
                  </TableCell>
                  <TableCell data-label="Order status">
                    <Select
                      value={
                        ["placed", "in_prep", "ready", "delivered", "cancelled"].includes(
                          order.status,
                        )
                          ? order.status
                          : "placed"
                      }
                      disabled={order.status === "cancelled"}
                      onValueChange={(status) => void changeStatus(order.id, status)}
                    >
                      <SelectTrigger className="w-36">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="placed">Placed</SelectItem>
                        <SelectItem value="in_prep">In preparation</SelectItem>
                        <SelectItem value="ready">Ready</SelectItem>
                        <SelectItem value="delivered">Delivered</SelectItem>
                        <SelectItem value="cancelled">Cancelled / refunded</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell data-label="Total" className="text-right">
                    {rateAmount(order.total, orderCurrency(order))}
                  </TableCell>
                  <TableCell data-label="Details">
                    <Button
                      size="icon"
                      variant="outline"
                      aria-label={`View order ${order.order_no}`}
                      onClick={() => setSelectedId(order.id)}
                    >
                      <Eye />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <section id="customer-order-requests" className="mt-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="eyebrow">Website orders</div>
            <h2 className="mt-2 font-display text-2xl">Customer order requests</h2>
          </div>
          <p className="text-xs text-muted-foreground">
            Accepting a request creates a live POS ticket at the current menu prices.
          </p>
        </div>
        <div className="mt-4 overflow-x-auto bg-card shadow-luxe">
          <Table className="mobile-card-table">
            <TableHeader>
              <TableRow>
                <TableHead>Reference</TableHead>
                <TableHead>Received</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Order type</TableHead>
                <TableHead>Items</TableHead>
                <TableHead>Estimate</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requestsLoading && (
                <TableRow>
                  <TableCell colSpan={8}>Loading customer requests…</TableCell>
                </TableRow>
              )}
              {requestsError && (
                <TableRow>
                  <TableCell colSpan={8} role="alert" className="text-destructive">
                    {requestsLoadError instanceof Error
                      ? requestsLoadError.message
                      : "Could not load customer order requests."}
                  </TableCell>
                </TableRow>
              )}
              {!requestsLoading && !requestsError && !requests?.length && (
                <TableRow>
                  <TableCell colSpan={8} className="text-muted-foreground">
                    No website order requests.
                  </TableCell>
                </TableRow>
              )}
              {requests?.map((request) => (
                <TableRow key={request.id}>
                  <TableCell data-label="Reference" className="font-mono text-xs">
                    {request.id.slice(0, 8)}
                  </TableCell>
                  <TableCell data-label="Received" className="text-sm">
                    {new Date(request.created_at).toLocaleString([], {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </TableCell>
                  <TableCell data-label="Customer" className="text-sm">
                    {request.customer_name}
                    <div className="text-xs text-muted-foreground">{request.customer_phone}</div>
                  </TableCell>
                  <TableCell data-label="Order type" className="text-sm">
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
                  <TableCell
                    data-label="Items"
                    className="whitespace-pre-wrap text-xs text-muted-foreground"
                  >
                    {request.items_summary}
                  </TableCell>
                  <TableCell data-label="Estimate">
                    {rateAmount(
                      request.converted_total ?? request.subtotal_estimate,
                      request.price_currency ?? "LKR",
                    )}
                    {request.converted_total !== undefined && (
                      <div className="text-xs text-muted-foreground">Final POS total</div>
                    )}
                  </TableCell>
                  <TableCell data-label="Status">
                    <Badge variant={request.status === "pending" ? "secondary" : "outline"}>
                      {request.status.replace("_", " ")}
                    </Badge>
                    {request.converted_order_no && (
                      <div className="mt-1 text-xs">POS #{request.converted_order_no}</div>
                    )}
                  </TableCell>
                  <TableCell data-label="Action">
                    {request.status === "pending" && (
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => void acceptRequest(request.id)}>
                          Add to POS
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="Cancel request"
                          onClick={() => void cancelRequest(request.id)}
                        >
                          <X />
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      <section id="restaurant-reports" className="mt-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="eyebrow">Restaurant reports</div>
            <h2 className="mt-2 font-display text-2xl">Sales summary</h2>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label htmlFor="report-from" className="text-xs text-muted-foreground">
                From
              </label>
              <Input
                id="report-from"
                type="date"
                value={reportFrom}
                onChange={(event) => setReportFrom(event.target.value)}
              />
            </div>
            <div>
              <label htmlFor="report-to" className="text-xs text-muted-foreground">
                To
              </label>
              <Input
                id="report-to"
                type="date"
                value={reportTo}
                onChange={(event) => setReportTo(event.target.value)}
              />
            </div>
            <label className="flex items-center gap-2 pb-2 text-sm">
              <input
                type="checkbox"
                checked={paidOnly}
                onChange={(event) => setPaidOnly(event.target.checked)}
              />
              Paid orders only
            </label>
            <Button variant="outline" onClick={exportSummary}>
              <Download /> Daily CSV
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                downloadCsv("vaasal-top-items.csv", [
                  ["Item", "Currency", "Quantity", "Sales"],
                  ...topItems.map((item) => [
                    item.name,
                    item.currency,
                    item.qty,
                    item.sales.toFixed(2),
                  ]),
                ])
              }
            >
              <Download /> Items CSV
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                downloadCsv("vaasal-payment-mix.csv", [
                  ["Method", "Currency", "Collected"],
                  ...paymentMix.map((item) => [item.method, item.currency, item.amount.toFixed(2)]),
                ])
              }
            >
              <Download /> Payments CSV
            </Button>
          </div>
        </div>
        <div className="mt-4 grid gap-6 lg:grid-cols-2">
          <div className="overflow-x-auto bg-card p-4 shadow-luxe">
            <h3 className="mb-3 font-display text-xl">Sales by day</h3>
            <Table className="mobile-card-table">
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Orders</TableHead>
                  <TableHead className="text-right">Gross / collected</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!salesByDay.length && (
                  <TableRow>
                    <TableCell colSpan={3}>No orders in this period.</TableCell>
                  </TableRow>
                )}
                {salesByDay.map((totals) => (
                  <TableRow key={`${totals.date}:${totals.currency}`}>
                    <TableCell data-label="Date">
                      {totals.date} · {totals.currency}
                    </TableCell>
                    <TableCell data-label="Orders">{totals.orders}</TableCell>
                    <TableCell data-label="Gross / collected" className="text-right">
                      {rateAmount(totals.gross, totals.currency)} /{" "}
                      {rateAmount(totals.collected, totals.currency)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="overflow-x-auto bg-card p-4 shadow-luxe">
            <h3 className="mb-3 font-display text-xl">Top selling items</h3>
            <Table className="mobile-card-table">
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead>Qty</TableHead>
                  <TableHead className="text-right">Sales</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!topItems.length && (
                  <TableRow>
                    <TableCell colSpan={3}>No sales in this period.</TableCell>
                  </TableRow>
                )}
                {topItems.map((item) => (
                  <TableRow key={`${item.currency}:${item.name}`}>
                    <TableCell data-label="Item">{item.name}</TableCell>
                    <TableCell data-label="Qty">{item.qty}</TableCell>
                    <TableCell data-label="Sales" className="text-right">
                      {rateAmount(item.sales, item.currency)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="overflow-x-auto bg-card p-4 shadow-luxe">
            <h3 className="mb-3 font-display text-xl">Payments by method</h3>
            <Table className="mobile-card-table">
              <TableHeader>
                <TableRow>
                  <TableHead>Method</TableHead>
                  <TableHead className="text-right">Collected</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!paymentMix.length && (
                  <TableRow>
                    <TableCell colSpan={2}>No payments in this period.</TableCell>
                  </TableRow>
                )}
                {paymentMix.map(({ method, currency, amount }) => (
                  <TableRow key={`${method}:${currency}`}>
                    <TableCell data-label="Method" className="capitalize">
                      {method.replace("_", " ")} · {currency}
                    </TableCell>
                    <TableCell data-label="Collected" className="text-right">
                      {rateAmount(amount, currency)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </section>

      <Dialog
        open={!!activeOrder}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedId(null);
            setPaymentAmount("");
          }
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Order #{activeOrder?.order_no}</DialogTitle>
          </DialogHeader>
          {activeOrder && (
            <div className="space-y-5">
              <Button variant="outline" onClick={() => printOrder(activeOrder)}>
                <Printer /> Print bill
              </Button>
              <div className="text-sm">
                <p>
                  {activeOrder.customer_name || "Walk-in"} ·{" "}
                  {activeOrder.customer_phone || "No phone"}
                </p>
                <p className="text-muted-foreground">
                  {activeOrder.order_type.replace("_", " ")}{" "}
                  {activeOrder.table_no && `· Table ${activeOrder.table_no}`}
                  {activeOrder.room_code && `· Room ${activeOrder.room_code}`}
                </p>
              </div>
              <div className="space-y-2 border-y border-border py-3 text-sm">
                {activeOrder.order_items.map((item) => (
                  <div key={item.id} className="flex justify-between gap-3">
                    <span>
                      {item.qty} × {item.name} ·{" "}
                      {rateAmount(item.price, orderCurrency(activeOrder))} each
                    </span>
                    <span>
                      {rateAmount(
                        Number(item.price) * Number(item.qty),
                        orderCurrency(activeOrder),
                      )}
                    </span>
                  </div>
                ))}
                <div className="flex justify-between pt-2">
                  <span>Subtotal</span>
                  <span>{rateAmount(activeOrder.subtotal, orderCurrency(activeOrder))}</span>
                </div>
                <div className="flex justify-between">
                  <span>Discount</span>
                  <span>− {rateAmount(activeOrder.discount, orderCurrency(activeOrder))}</span>
                </div>
                <div className="flex justify-between">
                  <span>Service charge</span>
                  <span>{rateAmount(activeOrder.service_charge, orderCurrency(activeOrder))}</span>
                </div>
                <div className="flex justify-between">
                  <span>Tax</span>
                  <span>{rateAmount(activeOrder.tax ?? 0, orderCurrency(activeOrder))}</span>
                </div>
                <div className="flex justify-between font-semibold">
                  <span>Total</span>
                  <span>{rateAmount(activeOrder.total, orderCurrency(activeOrder))}</span>
                </div>
                <div className="flex justify-between">
                  <span>Paid</span>
                  <span>{rateAmount(collectedFor(activeOrder), orderCurrency(activeOrder))}</span>
                </div>
                <div className="flex justify-between">
                  <span>Due</span>
                  <span>
                    {rateAmount(
                      Math.max(0, Number(activeOrder.total) - collectedFor(activeOrder)),
                      orderCurrency(activeOrder),
                    )}
                  </span>
                </div>
              </div>
              {activeOrder.status !== "cancelled" &&
                Number(activeOrder.total) > collectedFor(activeOrder) && (
                  <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
                    <Input
                      aria-label="Payment amount"
                      type="number"
                      min="0.01"
                      max={Number(activeOrder.total) - collectedFor(activeOrder)}
                      step="0.01"
                      placeholder="Amount received"
                      value={paymentAmount}
                      onChange={(event) => setPaymentAmount(event.target.value)}
                    />
                    <Select
                      value={paymentMethod}
                      onValueChange={(value: PaymentMethod) => setPaymentMethod(value)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cash">Cash</SelectItem>
                        <SelectItem value="card">Card</SelectItem>
                        <SelectItem value="online">Online</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      disabled={!paymentAmount || Number(paymentAmount) <= 0}
                      onClick={() => void collectPayment()}
                    >
                      Record payment
                    </Button>
                  </div>
                )}
              <div>
                <h3 className="font-display text-lg">Order status history</h3>
                <ol className="mt-2 space-y-1 text-xs text-muted-foreground">
                  {(activeOrder.status_history ?? []).map((event, index) => (
                    <li key={`${event.at}-${index}`}>
                      {new Date(event.at).toLocaleString()} · {event.status.replace("_", " ")}
                      {event.by && ` · ${event.by}`}
                      {event.note && ` — ${event.note}`}
                    </li>
                  ))}
                </ol>
              </div>
              {!!activeOrder.payment_history?.length && (
                <div>
                  <h3 className="font-display text-lg">Payment history</h3>
                  <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                    {activeOrder.payment_history.map((payment, index) => (
                      <li key={`${payment.at}-${index}`}>
                        {new Date(payment.at).toLocaleString()} ·{" "}
                        {rateAmount(payment.amount, orderCurrency(activeOrder))} · {payment.method}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {activeOrder.status !== "cancelled" && (
                <Button
                  variant="destructive"
                  onClick={() => void changeStatus(activeOrder.id, "cancelled")}
                >
                  <X /> Cancel order{collectedFor(activeOrder) > 0 ? " & mark refund" : ""}
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
