import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { lkr } from "@/lib/hotel";

export const Route = createFileRoute("/_authenticated/staff/orders")({
  component: Orders,
});

function Orders() {
  const [day, setDay] = useState(new Date().toISOString().slice(0, 10));
  const { data } = useQuery({
    queryKey: ["orders", day],
    queryFn: async () => {
      const start = new Date(day + "T00:00:00");
      const end = new Date(start.getTime() + 86400000);
      const { data, error } = await supabase
        .from("orders")
        .select("*, order_items(name,qty,price)")
        .gte("created_at", start.toISOString())
        .lt("created_at", end.toISOString())
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const total = (data ?? []).reduce((s, o) => s + Number(o.total), 0);
  const by = (m: string) => (data ?? []).filter((o) => o.payment_method === m).reduce((s, o) => s + Number(o.total), 0);
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><div className="eyebrow">Restaurant</div><h1 className="mt-2 text-4xl">Orders & Sales</h1></div>
        <Input type="date" className="w-44" value={day} onChange={(e) => setDay(e.target.value)} />
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-4">
        {[["Total sales", total], ["Cash", by("cash")], ["Card", by("card")], ["Charged to rooms", by("room_bill")]].map(([l, v]) => (
          <div key={l as string} className="bg-card p-5 shadow-luxe">
            <div className="text-xs uppercase tracking-widest text-muted-foreground">{l}</div>
            <div className="mt-2 font-display text-2xl text-primary">{lkr(v as number)}</div>
          </div>
        ))}
      </div>
      <div className="mt-6 overflow-x-auto bg-card shadow-luxe">
        <Table>
          <TableHeader><TableRow><TableHead>#</TableHead><TableHead>Time</TableHead><TableHead>Type</TableHead><TableHead>Items</TableHead><TableHead>Payment</TableHead><TableHead className="text-right">Total</TableHead></TableRow></TableHeader>
          <TableBody>
            {data?.length === 0 && <TableRow><TableCell colSpan={6} className="text-muted-foreground">No orders this day.</TableCell></TableRow>}
            {data?.map((o) => (
              <TableRow key={o.id}>
                <TableCell>{o.order_no}</TableCell>
                <TableCell className="text-sm">{new Date(o.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</TableCell>
                <TableCell className="text-sm">{o.order_type.replace("_", " ")} {o.table_no && `· T${o.table_no}`} {o.room_code && `· ${o.room_code}`}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{o.order_items.map((i) => `${i.qty}× ${i.name}`).join(", ")}</TableCell>
                <TableCell><Badge variant="secondary">{o.payment_method.replace("_", " ")}</Badge></TableCell>
                <TableCell className="text-right">{lkr(o.total)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
