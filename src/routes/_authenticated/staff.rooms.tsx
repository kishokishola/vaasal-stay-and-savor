import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { lkr } from "@/lib/hotel";

export const Route = createFileRoute("/_authenticated/staff/rooms")({
  component: RoomsAdmin,
});

type Room = Tables<"rooms">;
const blank = { code: "", name: "", description: "", price: 10000, capacity: 2, bathroom: "Attached", ac: true, wifi: true, image_url: "/images/room-double.jpg", active: true };

function RoomsAdmin() {
  const qc = useQueryClient();
  const [edit, setEdit] = useState<Partial<Room> | null>(null);
  const { data } = useQuery({
    queryKey: ["admin-rooms"],
    queryFn: async () => (await supabase.from("rooms").select("*").order("code")).data ?? [],
  });
  const refresh = () => { qc.invalidateQueries({ queryKey: ["admin-rooms"] }); qc.invalidateQueries({ queryKey: ["rooms"] }); };

  async function save() {
    if (!edit) return;
    const row = { ...blank, ...edit, price: Number(edit.price), capacity: Number(edit.capacity) };
    const { id, created_at: _c, ...payload } = row as Room;
    const res = id ? await supabase.from("rooms").update(payload).eq("id", id) : await supabase.from("rooms").insert(payload);
    if (res.error) return toast.error(res.error.message);
    toast.success("Room saved"); setEdit(null); refresh();
  }
  async function del(id: string) {
    if (!confirm("Delete this room and its bookings?")) return;
    const { error } = await supabase.from("rooms").delete().eq("id", id);
    if (error) return toast.error(error.message);
    refresh();
  }
  async function upload(file: File) {
    const path = `${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from("rooms").upload(path, file);
    if (error) return toast.error(error.message);
    const { data, error: e2 } = await supabase.storage.from("rooms").createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
    if (e2 || !data) return toast.error(e2?.message ?? "Upload failed");
    setEdit((e) => ({ ...e, image_url: data.signedUrl }));
  }

  return (
    <div>
      <div className="flex items-end justify-between">
        <div><div className="eyebrow">Hotel</div><h1 className="mt-2 text-4xl">Rooms</h1></div>
        <Button onClick={() => setEdit({ ...blank })}><Plus /> Add room</Button>
      </div>
      <div className="mt-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {data?.map((r) => (
          <div key={r.id} className="bg-card shadow-luxe">
            <img src={r.image_url ?? ""} alt="" className="aspect-video w-full object-cover" />
            <div className="p-5">
              <div className="flex justify-between">
                <div><div className="text-xs text-accent">{r.code}</div><div className="font-display text-xl">{r.name}</div></div>
                <div className="text-sm text-primary">{lkr(r.price)}</div>
              </div>
              <div className="mt-1 text-xs text-muted-foreground">{r.active ? "Visible on website" : "Hidden"}</div>
              <div className="mt-4 flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setEdit(r)}><Pencil /> Edit</Button>
                <Button size="sm" variant="ghost" onClick={() => del(r.id)}><Trash2 /></Button>
              </div>
            </div>
          </div>
        ))}
      </div>
      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{edit?.id ? "Edit room" : "New room"}</DialogTitle></DialogHeader>
          {edit && (
            <div className="grid gap-3">
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Room no.</Label><Input value={edit.code ?? ""} onChange={(e) => setEdit({ ...edit, code: e.target.value })} /></div>
                <div><Label>Name</Label><Input value={edit.name ?? ""} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></div>
                <div><Label>Price / night (LKR)</Label><Input type="number" value={edit.price ?? 0} onChange={(e) => setEdit({ ...edit, price: Number(e.target.value) })} /></div>
                <div><Label>Max guests</Label><Input type="number" value={edit.capacity ?? 2} onChange={(e) => setEdit({ ...edit, capacity: Number(e.target.value) })} /></div>
                <div><Label>Bathroom</Label><Input value={edit.bathroom ?? ""} onChange={(e) => setEdit({ ...edit, bathroom: e.target.value })} /></div>
              </div>
              <div><Label>Description</Label><Textarea value={edit.description ?? ""} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></div>
              <div><Label>Photo</Label><Input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
                {edit.image_url && <img src={edit.image_url} alt="" className="mt-2 h-24 object-cover" />}</div>
              <div className="flex flex-wrap gap-6 text-sm">
                <label className="flex items-center gap-2"><Switch checked={!!edit.ac} onCheckedChange={(v) => setEdit({ ...edit, ac: v })} />AC</label>
                <label className="flex items-center gap-2"><Switch checked={!!edit.wifi} onCheckedChange={(v) => setEdit({ ...edit, wifi: v })} />WiFi</label>
                <label className="flex items-center gap-2"><Switch checked={!!edit.active} onCheckedChange={(v) => setEdit({ ...edit, active: v })} />Show on website</label>
              </div>
              <Button onClick={save}>Save room</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
