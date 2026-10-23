import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Minus, Plus, Trash2, Printer, Search } from "lucide-react";
import {
  getBookings,
  placeOrder,
  subscribeToBookings,
  subscribeToMenuItems,
  type MenuItem,
} from "@/lib/firebase-data";
import { getPublicMenuItems } from "@/lib/public-catalog";
import { useFirestoreRealtime } from "@/hooks/useFirestoreRealtime";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Booking } from "@/lib/firebase-data";
import { menuItemRate, orderTotals, rateAmount, HOTEL } from "@/lib/hotel";
import { usePriceCurrency } from "@/lib/price-currency-context";

export const Route = createFileRoute("/_authenticated/staff/pos")({
  component: Pos,
});

type Line = { id: string; name: string; price: number; qty: number };
type Receipt = {
  no: number;
  type: string;
  ref: string;
  lines: Line[];
  subtotal: number;
  discount: number;
  service: number;
  tax: number;
  total: number;
  method: string;
  paymentStatus: "paid" | "unpaid" | "partial";
  paidAmount: number;
  cashReceived: number;
  changeReturned: number;
  customerName: string;
  customerPhone: string;
  at: string;
  currency: "LKR" | "USD";
};

function Pos() {
  const qc = useQueryClient();
  const { currency, setCurrency } = usePriceCurrency();
  const {
    data: menu,
    isLoading: menuLoading,
    isError: menuError,
    error: menuLoadError,
  } = useQuery({
    queryKey: ["menu"],
    queryFn: getPublicMenuItems,
  });
  useFirestoreRealtime(["menu"], subscribeToMenuItems);
  const { data: inHouseBookings = [] } = useQuery({
    queryKey: ["in-house-bookings"],
    queryFn: () => getBookings("checked_in"),
  });
  useFirestoreRealtime(["in-house-bookings"], subscribeToBookings);
  const [cat, setCat] = useState("All");
  const [q, setQ] = useState("");
  const [cart, setCart] = useState<Line[]>([]);
  const [type, setType] = useState<"dine_in" | "takeaway" | "room">("dine_in");
  const [ref, setRef] = useState("");
  const [discountPct, setDiscountPct] = useState(0);
  const [servicePct, setServicePct] = useState(10);
  const [taxPct, setTaxPct] = useState(0);
  const [method, setMethod] = useState<"cash" | "card" | "online" | "room_bill" | "no_pay">("cash");
  const [paymentStatus, setPaymentStatus] = useState<"paid" | "unpaid" | "partial">("paid");
  const [partialPaid, setPartialPaid] = useState(0);
  const [cashReceived, setCashReceived] = useState(0);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);

  const avail = (menu ?? []).filter((m) => m.available && !m.deleted);
  const cats = ["All", ...Array.from(new Set(avail.map((m) => m.category)))];
  const shown = avail.filter(
    (m) => (cat === "All" || m.category === cat) && m.name.toLowerCase().includes(q.toLowerCase()),
  );
  const currentCart = useMemo(
    () =>
      cart.flatMap((line) => {
        const currentItem = menu?.find((item) => item.id === line.id);
        return currentItem?.available && !currentItem.deleted
          ? [
              {
                ...line,
                name: currentItem.name,
                price: menuItemRate(currentItem, currency, type),
              },
            ]
          : [];
      }),
    [cart, currency, menu, type],
  );
  const subtotal = useMemo(
    () => currentCart.reduce((sum, line) => sum + line.price * line.qty, 0),
    [currentCart],
  );
  const discount = Math.round(subtotal * discountPct) / 100;
  const t = orderTotals(subtotal, discount, servicePct, taxPct);
  const paidAmount =
    method === "room_bill" || method === "no_pay" || paymentStatus === "unpaid"
      ? 0
      : paymentStatus === "partial"
        ? Math.max(0, Math.min(partialPaid, t.total))
        : t.total;
  const changeReturned = method === "cash" ? Math.max(0, cashReceived - paidAmount) : 0;

  const add = (m: MenuItem) => {
    const price = menuItemRate(m, currency, type);
    if (price <= 0) {
      toast.error(`Set a ${currency} price for ${m.name} before adding it.`);
      return;
    }
    setCart((c) => {
      const f = c.find((l) => l.id === m.id);
      return f
        ? c.map((l) => (l.id === m.id ? { ...l, price, qty: l.qty + 1 } : l))
        : [...c, { id: m.id, name: m.name, price, qty: 1 }];
    });
  };
  const bump = (id: string, d: number) =>
    setCart((c) =>
      c.map((l) => (l.id === id ? { ...l, qty: l.qty + d } : l)).filter((l) => l.qty > 0),
    );

  async function checkout() {
    if (!cart.length) {
      toast.error("Cart is empty");
      return;
    }
    if (currentCart.some((line) => line.price <= 0)) {
      toast.error(`A selected food item does not have a ${currency} price.`);
      return;
    }
    if (!customerName.trim()) {
      toast.error("Enter the customer name.");
      return;
    }
    if (type === "room" && !inHouseBookings.some((booking) => booking.room_code === ref)) {
      toast.error("Choose a room with a checked-in guest.");
      return;
    }
    if (
      discountPct < 0 ||
      discountPct > 100 ||
      servicePct < 0 ||
      servicePct > 100 ||
      taxPct < 0 ||
      taxPct > 100
    ) {
      toast.error("Discount, service charge and tax must be between 0% and 100%.");
      return;
    }
    if (paymentStatus === "partial" && (partialPaid <= 0 || partialPaid >= t.total)) {
      toast.error("A partial payment must be greater than zero and less than the total.");
      return;
    }
    if (method === "cash" && cashReceived < paidAmount) {
      toast.error("Cash received cannot be less than the amount paid.");
      return;
    }
    setBusy(true);
    try {
      const order = await placeOrder({
        order_type: type,
        table_no: type === "dine_in" ? ref || null : null,
        room_code: type === "room" ? ref || null : null,
        booking_id:
          type === "room"
            ? (inHouseBookings.find((booking) => booking.room_code === ref)?.id ?? null)
            : null,
        customer_name: customerName,
        customer_phone: customerPhone,
        discount_pct: discountPct,
        service_pct: servicePct,
        tax_pct: taxPct,
        price_currency: currency,
        payment_method: method,
        payment_status: paymentStatus,
        paid_amount: paidAmount,
        cash_received: method === "cash" ? cashReceived : 0,
        status: "placed",
        items: currentCart.map((line) => ({
          menu_item_id: line.id,
          qty: line.qty,
        })),
      });
      setReceipt({
        no: order.order_no,
        type,
        ref,
        lines: order.items,
        subtotal: order.subtotal,
        discount: order.discount,
        service: order.service_charge,
        tax: order.tax,
        total: order.total,
        method,
        paymentStatus:
          order.payment_status === "partial" || order.payment_status === "unpaid"
            ? order.payment_status
            : "paid",
        paidAmount: order.paid_amount,
        cashReceived: method === "cash" ? cashReceived : order.paid_amount,
        changeReturned,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        at: new Date().toLocaleString(),
        currency,
      });
      setCart([]);
      setDiscountPct(0);
      setTaxPct(0);
      setCashReceived(0);
      setPartialPaid(0);
      setRef("");
      setCustomerName("");
      setCustomerPhone("");
      setPaymentStatus("paid");
      if (method === "room_bill" || method === "no_pay") setMethod("cash");
      qc.invalidateQueries({ queryKey: ["orders"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the order.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_400px]">
      <div>
        <div className="eyebrow">Restaurant</div>
        <h1 className="mt-2 text-4xl">Point of Sale</h1>
        <div className="mt-6 flex flex-wrap items-center gap-2">
          {cats.map((c) => (
            <Button
              key={c}
              size="sm"
              variant={c === cat ? "default" : "outline"}
              onClick={() => setCat(c)}
            >
              {c}
            </Button>
          ))}
          <Select
            value={currency}
            onValueChange={(value) => {
              if (value === "LKR" || value === "USD") setCurrency(value);
            }}
          >
            <SelectTrigger aria-label="Choose food price currency" className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="LKR">Local · LKR</SelectItem>
              <SelectItem value="USD">Foreign · USD</SelectItem>
            </SelectContent>
          </Select>
          <div className="relative ml-auto">
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input
              className="pl-8 w-52"
              placeholder="Search…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3 2xl:grid-cols-4">
          {shown.map((m) => (
            <button
              key={m.id}
              onClick={() => add(m)}
              className="bg-card p-4 text-left shadow-luxe transition hover:-translate-y-0.5 hover:ring-1 hover:ring-accent"
            >
              {m.image_url && (
                <img src={m.image_url} alt="" className="mb-3 h-28 w-full rounded object-cover" />
              )}
              <div className="text-[0.65rem] uppercase tracking-widest text-accent">
                {m.category}
              </div>
              <div className="mt-1 font-display text-lg leading-tight">{m.name}</div>
              <div className="mt-2 text-sm text-primary">
                {menuItemRate(m, currency, type) > 0
                  ? rateAmount(menuItemRate(m, currency, type), currency)
                  : "Price not set"}
              </div>
            </button>
          ))}
          {menuLoading && <p className="text-sm text-muted-foreground">Loading menu…</p>}
          {menuError && (
            <p role="alert" className="text-sm text-destructive">
              {menuLoadError instanceof Error
                ? menuLoadError.message
                : "Could not load menu items."}
            </p>
          )}
          {!menuLoading && !menuError && !shown.length && (
            <p className="col-span-full text-sm text-muted-foreground">
              {avail.length
                ? "No available foods match this category or search."
                : "No available food items yet. Add menu items from the Menu page."}
            </p>
          )}
        </div>
      </div>

      <div className="h-fit bg-card p-6 shadow-luxe xl:sticky xl:top-6">
        <h2 className="text-2xl">Current bill</h2>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div>
            <Label>Order type</Label>
            <Select
              value={type}
              onValueChange={(v) => {
                if (v !== "dine_in" && v !== "takeaway" && v !== "room") return;
                setType(v);
                setRef("");
                if (v !== "room" && method === "room_bill") {
                  setMethod("cash");
                  setPaymentStatus("paid");
                }
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="dine_in">Dine in</SelectItem>
                <SelectItem value="takeaway">Takeaway</SelectItem>
                <SelectItem value="room">Room service</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {type === "room" ? (
            <div>
              <Label>Checked-in room</Label>
              <Select
                value={ref}
                onValueChange={(roomCode) => {
                  setRef(roomCode);
                  const booking = inHouseBookings.find((item) => item.room_code === roomCode);
                  if (booking) {
                    setCustomerName(booking.guest_name);
                    setCustomerPhone(booking.guest_phone);
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select room" />
                </SelectTrigger>
                <SelectContent>
                  {inHouseBookings.map((booking: Booking) => (
                    <SelectItem key={booking.id} value={booking.room_code}>
                      {booking.room_code} — {booking.guest_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!inHouseBookings.length && (
                <p className="mt-1 text-xs text-muted-foreground">
                  No checked-in rooms are available for room service.
                </p>
              )}
            </div>
          ) : type === "dine_in" ? (
            <div>
              <Label>Table no.</Label>
              <Input value={ref} onChange={(e) => setRef(e.target.value)} />
            </div>
          ) : null}
        </div>
        <div className="mt-5 max-h-72 space-y-3 overflow-y-auto">
          {!cart.length && (
            <p className="text-sm text-muted-foreground">Tap menu items to add them.</p>
          )}
          {currentCart.map((l) => (
            <div key={l.id} className="flex items-center gap-2 text-sm">
              <div className="flex-1">
                <div>{l.name}</div>
                <div className="text-xs text-muted-foreground">{rateAmount(l.price, currency)}</div>
              </div>
              <Button
                size="icon"
                variant="outline"
                className="size-7"
                onClick={() => bump(l.id, -1)}
              >
                <Minus />
              </Button>
              <span className="w-6 text-center">{l.qty}</span>
              <Button
                size="icon"
                variant="outline"
                className="size-7"
                onClick={() => bump(l.id, 1)}
              >
                <Plus />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="size-7"
                onClick={() => bump(l.id, -l.qty)}
              >
                <Trash2 />
              </Button>
            </div>
          ))}
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <div>
            <Label>Customer name</Label>
            <Input
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Required"
            />
          </div>
          <div>
            <Label>Phone</Label>
            <Input
              type="tel"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              placeholder="Optional"
            />
          </div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 border-t border-border pt-4">
          <div>
            <Label>Discount (%)</Label>
            <Input
              type="number"
              min={0}
              max={100}
              step="0.01"
              value={discountPct}
              onChange={(e) => setDiscountPct(Number(e.target.value) || 0)}
            />
          </div>
          <div>
            <Label>Service charge %</Label>
            <Input
              type="number"
              min={0}
              max={100}
              value={servicePct}
              onChange={(e) => setServicePct(Number(e.target.value) || 0)}
            />
          </div>
          <div>
            <Label>Tax %</Label>
            <Input
              type="number"
              min={0}
              max={100}
              step="0.01"
              value={taxPct}
              onChange={(e) => setTaxPct(Number(e.target.value) || 0)}
            />
          </div>
        </div>
        <div className="mt-4 space-y-1 text-sm">
          <Row l="Subtotal" v={rateAmount(subtotal, currency)} />
          {discount > 0 && <Row l="Discount" v={"− " + rateAmount(discount, currency)} />}
          <Row l={`Service (${servicePct}%)`} v={rateAmount(t.service, currency)} />
          {taxPct > 0 && <Row l={`Tax (${taxPct}%)`} v={rateAmount(t.tax, currency)} />}
          <div className="flex justify-between pt-2 font-display text-2xl">
            <span>Total</span>
            <span className="text-primary">{rateAmount(t.total, currency)}</span>
          </div>
        </div>
        <div className="mt-4">
          <Label>Payment</Label>
          <Select
            value={method}
            onValueChange={(value) => {
              if (
                value === "cash" ||
                value === "card" ||
                value === "online" ||
                value === "room_bill" ||
                value === "no_pay"
              )
                setMethod(value);
              if (value === "room_bill" || value === "no_pay") setPaymentStatus("unpaid");
              else if (paymentStatus === "unpaid") setPaymentStatus("paid");
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="cash">Cash</SelectItem>
              <SelectItem value="card">Card</SelectItem>
              <SelectItem value="online">Online</SelectItem>
              <SelectItem value="no_pay">No payment / pay later</SelectItem>
              {type === "room" && <SelectItem value="room_bill">Charge to room</SelectItem>}
            </SelectContent>
          </Select>
        </div>
        {method !== "room_bill" && method !== "no_pay" && (
          <div className="mt-3">
            <Label>Payment status</Label>
            <Select
              value={paymentStatus}
              onValueChange={(value) => {
                if (value === "paid" || value === "unpaid" || value === "partial")
                  setPaymentStatus(value);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="partial">Partially paid</SelectItem>
                <SelectItem value="unpaid">Unpaid</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
        {paymentStatus === "partial" && method !== "room_bill" && method !== "no_pay" && (
          <div className="mt-3">
            <Label>Amount paid now ({currency})</Label>
            <Input
              type="number"
              min={0.01}
              max={t.total}
              step="0.01"
              value={partialPaid}
              onChange={(event) => setPartialPaid(Number(event.target.value) || 0)}
            />
          </div>
        )}
        {method === "cash" && paidAmount > 0 && (
          <div className="mt-3">
            <Label>Cash received ({currency})</Label>
            <Input
              type="number"
              min={paidAmount}
              step="0.01"
              value={cashReceived}
              onChange={(event) => setCashReceived(Number(event.target.value) || 0)}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Change: {rateAmount(changeReturned, currency)}
            </p>
          </div>
        )}
        <Button
          variant="luxe"
          size="lg"
          className="mt-5 w-full"
          disabled={busy || !currentCart.length || currentCart.some((line) => line.price <= 0)}
          onClick={checkout}
        >
          {busy ? "Saving…" : "Complete & Print"}
        </Button>
      </div>

      <Dialog open={!!receipt} onOpenChange={(o) => !o && setReceipt(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Bill #{receipt?.no}</DialogTitle>
          </DialogHeader>
          {receipt && (
            <div id="receipt" className="space-y-2 font-mono text-xs">
              <div className="text-center">
                <div className="font-display text-xl">{HOTEL.name}</div>
                <div>{HOTEL.address}</div>
                <div>{HOTEL.phone}</div>
                <div className="mt-1">{receipt.at}</div>
                <div>
                  {receipt.type.replace("_", " ")} {receipt.ref && `· ${receipt.ref}`}
                </div>
                <div>
                  {receipt.customerName} {receipt.customerPhone && `· ${receipt.customerPhone}`}
                </div>
              </div>
              <div className="border-t border-dashed border-border pt-2">
                {receipt.lines.map((l) => (
                  <Row
                    key={l.id}
                    l={`${l.qty} × ${l.name}`}
                    v={rateAmount(l.price * l.qty, receipt.currency)}
                  />
                ))}
              </div>
              <div className="border-t border-dashed border-border pt-2">
                <Row l="Subtotal" v={rateAmount(receipt.subtotal, receipt.currency)} />
                {receipt.discount > 0 && (
                  <Row l="Discount" v={"− " + rateAmount(receipt.discount, receipt.currency)} />
                )}
                <Row l="Service" v={rateAmount(receipt.service, receipt.currency)} />
                {receipt.tax > 0 && <Row l="Tax" v={rateAmount(receipt.tax, receipt.currency)} />}
                <div className="flex justify-between text-sm font-bold">
                  <span>TOTAL</span>
                  <span>{rateAmount(receipt.total, receipt.currency)}</span>
                </div>
                <Row l="Paid by" v={receipt.method.replace("_", " ")} />
                <Row l="Payment status" v={receipt.paymentStatus} />
                <Row l="Paid" v={rateAmount(receipt.paidAmount, receipt.currency)} />
                {receipt.cashReceived > receipt.paidAmount && (
                  <Row l="Change" v={rateAmount(receipt.changeReturned, receipt.currency)} />
                )}
              </div>
              <div className="pt-2 text-center">Thank you — come again!</div>
            </div>
          )}
          <Button onClick={() => window.print()}>
            <Printer /> Print
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Row({ l, v }: { l: string; v: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span>{l}</span>
      <span>{v}</span>
    </div>
  );
}
