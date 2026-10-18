import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { lkr } from "@/lib/hotel";

export const Route = createFileRoute("/_authenticated/staff/bookings")({
  component: Bookings,
});

const STATUSES = ["pending", "confirmed", "checked_in", "checked_out", "cancelled"] as const;
const next: Record<string, { label: string; to: string }[]> = {
  pending: [{ label: "Confirm", to: "confirmed" }, { label: "Decline", to: "cancelled" }],
  confirmed: [{ label: "Check in", to: "checked_in" }, { label: "Cancel", to: "cancelled" }],
  checked_in: [{ label: "Check out", to: "checked_out" }],
};

function Bookings() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState("all");
  const { data, isLoading } = useQuery({
    queryKey: ["bookings", filter],
    queryFn: async () => {
      let q = supabase.from("bookings").select("*, rooms(code,name)").order("check_in", { ascending: false });
      if (filter !== "all") q = q.eq("status", filter);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });
  async function setStatus(id: string, status: string) {
    const { error } = await supabase.from("bookings").update({ status }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Booking updated");
    qc.invalidateQueries({ queryKey: ["bookings"] });
  }
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><div className="eyebrow">Hotel</div><h1 className="mt-2 text-4xl">Bookings</h1></div>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            {STATUSES.map((s) => <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="mt-8 overflow-x-auto bg-card shadow-luxe">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Guest</TableHead><TableHead>Room</TableHead><TableHead>Dates</TableHead>
              <TableHead>Total</TableHead><TableHead>Status</TableHead><TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={6}>Loading…</TableCell></TableRow>}
            {data?.length === 0 && <TableRow><TableCell colSpan={6} className="text-muted-foreground">No bookings yet.</TableCell></TableRow>}
            {data?.map((b) => (
              <TableRow key={b.id}>
                <TableCell>
                  <div className="font-medium">{b.guest_name}</div>
                  <div className="text-xs text-muted-foreground">{b.guest_phone} · {b.guest_email}</div>
                  {b.notes && <div className="text-xs italic text-muted-foreground">“{b.notes}”</div>}
                </TableCell>
                <TableCell>{b.rooms?.code} <span className="text-xs text-muted-foreground">{b.rooms?.name}</span></TableCell>
                <TableCell className="whitespace-nowrap text-sm">{b.check_in} → {b.check_out}<div className="text-xs text-muted-foreground">{b.guests} guest(s)</div></TableCell>
                <TableCell>{lkr(b.total)}</TableCell>
                <TableCell><Badge variant={b.status === "cancelled" ? "destructive" : b.status === "pending" ? "secondary" : "default"}>{b.status.replace("_", " ")}</Badge></TableCell>
                <TableCell className="space-x-2 whitespace-nowrap">
                  {(next[b.status] ?? []).map((n) => (
                    <Button key={n.to} size="sm" variant={n.to === "cancelled" ? "outline" : "default"} onClick={() => setStatus(b.id, n.to)}>{n.label}</Button>
                  ))}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
