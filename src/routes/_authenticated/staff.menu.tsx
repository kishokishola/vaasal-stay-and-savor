import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/staff/menu")({
  component: MenuAdmin,
});

function MenuAdmin() {
  const qc = useQueryClient();
  const [n, setN] = useState({ name: "", category: "Mains", price: "", description: "" });
  const { data } = useQuery({
    queryKey: ["menu"],
    queryFn: async () => (await supabase.from("menu_items").select("*").order("category").order("name")).data ?? [],
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["menu"] });
  async function add(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.from("menu_items").insert({ ...n, price: Number(n.price) });
    if (error) return toast.error(error.message);
    setN({ ...n, name: "", price: "", description: "" }); refresh();
  }
  async function patch(id: string, p: Record<string, unknown>) {
    const { error } = await supabase.from("menu_items").update(p).eq("id", id);
    if (error) toast.error(error.message); else refresh();
  }
  async function del(id: string) {
    if (!confirm("Delete item?")) return;
    await supabase.from("menu_items").delete().eq("id", id); refresh();
  }
  return (
    <div>
      <div className="eyebrow">Restaurant</div><h1 className="mt-2 text-4xl">Menu</h1>
      <form onSubmit={add} className="mt-8 grid gap-3 bg-card p-5 shadow-luxe md:grid-cols-[2fr_1fr_1fr_2fr_auto]">
        <Input placeholder="Item name" required value={n.name} onChange={(e) => setN({ ...n, name: e.target.value })} />
        <Input placeholder="Category" required value={n.category} onChange={(e) => setN({ ...n, category: e.target.value })} />
        <Input placeholder="Price" type="number" required value={n.price} onChange={(e) => setN({ ...n, price: e.target.value })} />
        <Input placeholder="Description" value={n.description} onChange={(e) => setN({ ...n, description: e.target.value })} />
        <Button type="submit"><Plus /> Add</Button>
      </form>
      <div className="mt-6 overflow-x-auto bg-card shadow-luxe">
        <Table>
          <TableHeader><TableRow><TableHead>Item</TableHead><TableHead>Category</TableHead><TableHead>Price</TableHead><TableHead>Available</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>
            {data?.map((m) => (
              <TableRow key={m.id}>
                <TableCell><Input defaultValue={m.name} onBlur={(e) => e.target.value !== m.name && patch(m.id, { name: e.target.value })} /></TableCell>
                <TableCell><Input defaultValue={m.category} onBlur={(e) => e.target.value !== m.category && patch(m.id, { category: e.target.value })} /></TableCell>
                <TableCell><Input type="number" className="w-28" defaultValue={m.price} onBlur={(e) => Number(e.target.value) !== Number(m.price) && patch(m.id, { price: Number(e.target.value) })} /></TableCell>
                <TableCell><Switch checked={m.available} onCheckedChange={(v) => patch(m.id, { available: v })} /></TableCell>
                <TableCell><Button size="icon" variant="ghost" onClick={() => del(m.id)}><Trash2 /></Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
