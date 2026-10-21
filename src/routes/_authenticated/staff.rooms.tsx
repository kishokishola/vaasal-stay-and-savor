import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { deleteRoom, getRooms, saveRoom, subscribeToRooms, type Room } from "@/lib/firebase-data";
import { useFirestoreRealtime } from "@/hooks/useFirestoreRealtime";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { lkr, publicAsset } from "@/lib/hotel";

export const Route = createFileRoute("/_authenticated/staff/rooms")({
  component: RoomsAdmin,
});

const blank = {
  code: "",
  name: "",
  description: "",
  price: 10000,
  capacity: 2,
  bathroom: "Attached",
  ac: true,
  wifi: true,
  image_url: "/images/room-double.jpg",
  price_local: 10000,
  price_foreign: 0,
  day_rate_local: 10000,
  day_rate_foreign: 0,
  gallery_urls: [] as string[],
  active: true,
};

function RoomsAdmin() {
  const qc = useQueryClient();
  const [edit, setEdit] = useState<Partial<Room> | null>(null);
  const { data } = useQuery({
    queryKey: ["admin-rooms"],
    queryFn: () => getRooms(),
  });
  useFirestoreRealtime(["admin-rooms"], subscribeToRooms);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin-rooms"] });
    qc.invalidateQueries({ queryKey: ["rooms"] });
  };

  async function save() {
    if (!edit) return;
    const row = {
      ...blank,
      ...edit,
      price: Number(edit.price),
      capacity: Number(edit.capacity),
      price_local: Number(edit.price_local ?? edit.price),
      price_foreign: Number(edit.price_foreign ?? 0),
      day_rate_local: Number(edit.day_rate_local ?? edit.price),
      day_rate_foreign: Number(edit.day_rate_foreign ?? 0),
    };
    try {
      await saveRoom(row as Room);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save room.");
      return;
    }
    toast.success("Room saved");
    setEdit(null);
    refresh();
  }
  async function del(id: string) {
    if (!confirm("Delete this room? Rooms with booking history must be hidden instead.")) return;
    try {
      await deleteRoom(id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete room.");
      return;
    }
    refresh();
  }
  return (
    <div>
      <div className="flex items-end justify-between">
        <div>
          <div className="eyebrow">Hotel</div>
          <h1 className="mt-2 text-4xl">Rooms</h1>
        </div>
        <Button onClick={() => setEdit({ ...blank })}>
          <Plus /> Add room
        </Button>
      </div>
      <div className="mt-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {data?.map((r) => (
          <div key={r.id} className="bg-card shadow-luxe">
            <img
              src={publicAsset(r.image_url ?? "/images/room-double.jpg")}
              alt=""
              className="aspect-video w-full object-cover"
            />
            <div className="p-5">
              <div className="flex justify-between">
                <div>
                  <div className="text-xs text-accent">{r.code}</div>
                  <div className="font-display text-xl">{r.name}</div>
                </div>
                <div className="text-sm text-primary">{lkr(r.price_local ?? r.price)}</div>
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {r.active ? "Visible on website" : "Hidden"}
              </div>
              <div className="mt-4 flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setEdit(r)}>
                  <Pencil /> Edit
                </Button>
                <Button size="sm" variant="ghost" onClick={() => del(r.id)}>
                  <Trash2 />
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>
      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{edit?.id ? "Edit room" : "New room"}</DialogTitle>
          </DialogHeader>
          {edit && (
            <div className="grid gap-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Room no.</Label>
                  <Input
                    value={edit.code ?? ""}
                    onChange={(e) => setEdit({ ...edit, code: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Name</Label>
                  <Input
                    value={edit.name ?? ""}
                    onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Price / night (LKR)</Label>
                  <Input
                    type="number"
                    value={edit.price ?? 0}
                    onChange={(e) => setEdit({ ...edit, price: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <Label>Foreign / night (USD)</Label>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={edit.price_foreign ?? 0}
                    onChange={(e) => setEdit({ ...edit, price_foreign: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <Label>Local day rate (LKR)</Label>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={edit.day_rate_local ?? edit.price ?? 0}
                    onChange={(e) => setEdit({ ...edit, day_rate_local: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <Label>Foreign day rate (USD)</Label>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={edit.day_rate_foreign ?? 0}
                    onChange={(e) => setEdit({ ...edit, day_rate_foreign: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <Label>Max guests</Label>
                  <Input
                    type="number"
                    value={edit.capacity ?? 2}
                    onChange={(e) => setEdit({ ...edit, capacity: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <Label htmlFor="room-gallery-urls">
                    Gallery image URLs (one per line, up to 12)
                  </Label>
                  <Textarea
                    id="room-gallery-urls"
                    rows={4}
                    value={(edit.gallery_urls ?? []).join("\n")}
                    onChange={(event) =>
                      setEdit({
                        ...edit,
                        gallery_urls: event.target.value
                          .split(/\r?\n/)
                          .map((url) => url.trim())
                          .filter(Boolean)
                          .slice(0, 12),
                      })
                    }
                    placeholder="/images/room-family.jpg"
                  />
                </div>
                <div>
                  <Label>Bathroom</Label>
                  <Input
                    value={edit.bathroom ?? ""}
                    onChange={(e) => setEdit({ ...edit, bathroom: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <Label>Description</Label>
                <Textarea
                  value={edit.description ?? ""}
                  onChange={(e) => setEdit({ ...edit, description: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="room-photo-url">Photo URL</Label>
                <Input
                  id="room-photo-url"
                  type="text"
                  value={edit.image_url ?? ""}
                  onChange={(e) => setEdit({ ...edit, image_url: e.target.value })}
                  placeholder="Paste a Supabase public image URL or /images/ path"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Upload photos in Supabase Storage, then paste their public URL here.
                </p>
                {edit.image_url && (
                  <img
                    src={publicAsset(edit.image_url)}
                    alt=""
                    className="mt-2 h-24 object-cover"
                  />
                )}
              </div>
              <div className="flex flex-wrap gap-6 text-sm">
                <label className="flex items-center gap-2">
                  <Switch
                    checked={!!edit.ac}
                    onCheckedChange={(v) => setEdit({ ...edit, ac: v })}
                  />
                  AC
                </label>
                <label className="flex items-center gap-2">
                  <Switch
                    checked={!!edit.wifi}
                    onCheckedChange={(v) => setEdit({ ...edit, wifi: v })}
                  />
                  WiFi
                </label>
                <label className="flex items-center gap-2">
                  <Switch
                    checked={!!edit.active}
                    onCheckedChange={(v) => setEdit({ ...edit, active: v })}
                  />
                  Show on website
                </label>
              </div>
              <Button onClick={save}>Save room</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
