import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Minus, Plus, Trash2, Printer, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { lkr, orderTotals, HOTEL } from "@/lib/hotel";

export const Route = createFileRoute("/_authenticated/staff/pos")({
  component: Pos,
});

type Line = { id: string; name: string; price: number; qty: number };
type Receipt = { no: number; type: string; ref: string; lines: Line[]; subtotal: number; discount: number; service: number; total: number; method: string; at: string };

function Pos() {
  const qc = useQueryClient();
  const { data: menu } = useQuery({
    queryKey: ["menu"],
    queryFn: async () => (await supabase.from("menu_items").select("*").order("category").order("name")).data ?? [],
  });
  const [cat, setCat] = useState("All");
  const [q, setQ] = useState("");
  const [cart, setCart] = useState<Line[]>([]);
  const [type, setType] = useState("dine_in");
  const [ref, setRef] = useState("");
  const [discount, setDiscount] = useState(0);
  const [servicePct, setServicePct] = useState(10);
  const [method, setMethod] = useState("cash");
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);

  const avail = (menu ?? []).filter((m) => m.available);
  const cats = ["All", ...Array.from(new Set(avail.map((m) => m.category)))];
  const shown = avail.filter((m) => (cat === "All" || m.category === cat) && m.name.toLowerCase().includes(q.toLowerCase()));
  const subtotal = useMemo(() => cart.reduce((s, l) => s + l.price * l.qty, 0), [cart]);
  const t = orderTotals(subtotal, discount, servicePct);

  const add = (m: { id: string; name: string; price: number }) =>
    setCart((c) => {
      const f = c.find((l) => l.id === m.id);
      return f ? c.map((l) => (l.id === m.id ? { ...l, qty: l.qty + 1 } : l)) : [...c, { id: m.id, name: m.name, price: Number(m.price), qty: 1 }];
    });
  const bump = (id: string, d: number) => setCart((c) => c.map((l) => (l.id === id ? { ...l, qty: l.qty + d } : l)).filter((l) => l.qty > 0));

  async function checkout() {
    if (!cart.length) { toast.error("Cart is empty"); return; }
    setBusy(true);
    const { data: order, error } = await supabase
      .from("orders")
      .insert({
        order_type: type,
        table_no: type === "dine_in" ? ref || null : null,
        room_code: type === "room" ? ref || null : null,
        subtotal, discount, service_charge: t.service, total: t.total,
        payment_method: method,
        status: method === "room_bill" ? "charged_to_room" : "paid",
      })
      .select()
      .single();
    if (error || !order) { setBusy(false); { toast.error(error?.message ?? "Failed"); return; } }
    const { error: e2 } = await supabase.from("order_items").insert(cart.map((l) => ({ order_id: order.id, menu_item_id: l.id, name: l.name, price: l.price, qty: l.qty })));
    setBusy(false);
    if (e2) { toast.error(e2.message); return; }
    setReceipt({ no: order.order_no, type, ref, lines: cart, subtotal, discount, service: t.service, total: t.total, method, at: new Date().toLocaleString() });
    setCart([]); setDiscount(0); setRef("");
    qc.invalidateQueries({ queryKey: ["orders"] });
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_400px]">
      <div>
        <div className="eyebrow">Restaurant</div>
        <h1 className="mt-2 text-4xl">Point of Sale</h1>
        <div className="mt-6 flex flex-wrap items-center gap-2">
          {cats.map((c) => (
            <Button key={c} size="sm" variant={c === cat ? "default" : "outline"} onClick={() => setCat(c)}>{c}</Button>
          ))}
          <div className="relative ml-auto">
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input className="pl-8 w-52" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3 2xl:grid-cols-4">
          {shown.map((m) => (
            <button key={m.id} onClick={() => add(m)} className="bg-card p-4 text-left shadow-luxe transition hover:-translate-y-0.5 hover:ring-1 hover:ring-accent">
              <div className="text-[0.65rem] uppercase tracking-widest text-accent">{m.category}</div>
              <div className="mt-1 font-display text-lg leading-tight">{m.name}</div>
              <div className="mt-2 text-sm text-primary">{lkr(m.price)}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="h-fit bg-card p-6 shadow-luxe xl:sticky xl:top-6">
        <h2 className="text-2xl">Current bill</h2>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div>
            <Label>Order type</Label>
            <Select value={type} onValueChange={(v) => { setType(v); if (v !== "room" && method === "room_bill") setMethod("cash"); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="dine_in">Dine in</SelectItem>
                <SelectItem value="takeaway">Takeaway</SelectItem>
                <SelectItem value="room">Room service</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {type !== "takeaway" && (
            <div><Label>{type === "room" ? "Room no." : "Table no."}</Label><Input value={ref} onChange={(e) => setRef(e.target.value)} /></div>
          )}
        </div>
        <div className="mt-5 max-h-72 space-y-3 overflow-y-auto">
          {!cart.length && <p className="text-sm text-muted-foreground">Tap menu items to add them.</p>}
          {cart.map((l) => (
            <div key={l.id} className="flex items-center gap-2 text-sm">
              <div className="flex-1"><div>{l.name}</div><div className="text-xs text-muted-foreground">{lkr(l.price)}</div></div>
              <Button size="icon" variant="outline" className="size-7" onClick={() => bump(l.id, -1)}><Minus /></Button>
              <span className="w-6 text-center">{l.qty}</span>
              <Button size="icon" variant="outline" className="size-7" onClick={() => bump(l.id, 1)}><Plus /></Button>
              <Button size="icon" variant="ghost" className="size-7" onClick={() => bump(l.id, -l.qty)}><Trash2 /></Button>
            </div>
          ))}
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 border-t border-border pt-4">
          <div><Label>Discount (LKR)</Label><Input type="number" min={0} value={discount} onChange={(e) => setDiscount(Number(e.target.value) || 0)} /></div>
          <div><Label>Service charge %</Label><Input type="number" min={0} value={servicePct} onChange={(e) => setServicePct(Number(e.target.value) || 0)} /></div>
        </div>
        <div className="mt-4 space-y-1 text-sm">
          <Row l="Subtotal" v={lkr(subtotal)} />
          {discount > 0 && <Row l="Discount" v={"− " + lkr(discount)} />}
          <Row l={`Service (${servicePct}%)`} v={lkr(t.service)} />
          <div className="flex justify-between pt-2 font-display text-2xl"><span>Total</span><span className="text-primary">{lkr(t.total)}</span></div>
        </div>
        <div className="mt-4">
          <Label>Payment</Label>
          <Select value={method} onValueChange={setMethod}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="cash">Cash</SelectItem>
              <SelectItem value="card">Card</SelectItem>
              {type === "room" && <SelectItem value="room_bill">Charge to room</SelectItem>}
            </SelectContent>
          </Select>
        </div>
        <Button variant="luxe" size="lg" className="mt-5 w-full" disabled={busy || !cart.length} onClick={checkout}>
          {busy ? "Saving…" : "Complete & Print"}
        </Button>
      </div>

      <Dialog open={!!receipt} onOpenChange={(o) => !o && setReceipt(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Bill #{receipt?.no}</DialogTitle></DialogHeader>
          {receipt && (
            <div id="receipt" className="space-y-2 font-mono text-xs">
              <div className="text-center">
                <div className="font-display text-xl">{HOTEL.name}</div>
                <div>{HOTEL.address}</div><div>{HOTEL.phone}</div>
                <div className="mt-1">{receipt.at}</div>
                <div>{receipt.type.replace("_", " ")} {receipt.ref && `· ${receipt.ref}`}</div>
              </div>
              <div className="border-t border-dashed border-border pt-2">
                {receipt.lines.map((l) => <Row key={l.id} l={`${l.qty} × ${l.name}`} v={lkr(l.price * l.qty)} />)}
              </div>
              <div className="border-t border-dashed border-border pt-2">
                <Row l="Subtotal" v={lkr(receipt.subtotal)} />
                {receipt.discount > 0 && <Row l="Discount" v={"− " + lkr(receipt.discount)} />}
                <Row l="Service" v={lkr(receipt.service)} />
                <div className="flex justify-between text-sm font-bold"><span>TOTAL</span><span>{lkr(receipt.total)}</span></div>
                <Row l="Paid by" v={receipt.method.replace("_", " ")} />
              </div>
              <div className="pt-2 text-center">Thank you — come again!</div>
            </div>
          )}
          <Button onClick={() => window.print()}><Printer /> Print</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Row({ l, v }: { l: string; v: string }) {
  return <div className="flex justify-between gap-2"><span>{l}</span><span>{v}</span></div>;
}
