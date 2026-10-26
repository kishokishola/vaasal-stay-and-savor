import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";
import {
  deleteRoom,
  getRooms,
  saveRoom,
  subscribeToRooms,
  validateRoomPhotoPayload,
  type Room,
} from "@/lib/firebase-data";
import { useFirestoreRealtime } from "@/hooks/useFirestoreRealtime";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { lkr } from "@/lib/hotel";
import { RoomPhoto } from "@/components/site/RoomPhoto";

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
  const [uploading, setUploading] = useState(false);
  const mainPhotoInput = useRef<HTMLInputElement>(null);
  const galleryPhotoInput = useRef<HTMLInputElement>(null);
  const { data } = useQuery({
    queryKey: ["admin-rooms"],
    queryFn: () => getRooms(),
  });
  useFirestoreRealtime(["admin-rooms"], subscribeToRooms);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin-rooms"] });
    qc.invalidateQueries({ queryKey: ["rooms"] });
  };

  async function uploadImage(file: File) {
    if (!file.type.startsWith("image/")) throw new Error("Choose an image file.");
    const objectUrl = URL.createObjectURL(file);
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("This photo format is not supported."));
      element.src = objectUrl;
    }).finally(() => URL.revokeObjectURL(objectUrl));
    const scale = Math.min(1, 1200 / image.width, 900 / image.height);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not process the selected image.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    for (const quality of [0.82, 0.7, 0.58, 0.45, 0.32]) {
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", quality),
      );
      if (blob && blob.size <= 400_000) {
        return await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () =>
            typeof reader.result === "string"
              ? resolve(reader.result)
              : reject(new Error("Could not read the selected image."));
          reader.onerror = () => reject(new Error("Could not read the selected image."));
          reader.readAsDataURL(blob);
        });
      }
    }
    throw new Error("Image is too large after compression. Choose a smaller image.");
  }

  async function setMainPhoto(file: File | undefined) {
    if (!file || !edit) return;
    setUploading(true);
    try {
      const imageUrl = await uploadImage(file);
      validateRoomPhotoPayload(imageUrl, edit.gallery_urls ?? []);
      setEdit((current) => (current ? { ...current, image_url: imageUrl } : current));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not process the image.");
    } finally {
      setUploading(false);
      if (mainPhotoInput.current) mainPhotoInput.current.value = "";
    }
  }

  async function addGalleryPhotos(files: File[]) {
    if (!edit || !files.length) return;
    const currentGallery = edit.gallery_urls ?? [];
    if (currentGallery.length + files.length > 12) {
      toast.error("Add no more than 12 room gallery photos.");
      return;
    }
    setUploading(true);
    try {
      const uploaded: string[] = [];
      for (const file of files) uploaded.push(await uploadImage(file));
      const galleryUrls = [...currentGallery, ...uploaded];
      validateRoomPhotoPayload(edit.image_url ?? "", galleryUrls);
      setEdit((current) => (current ? { ...current, gallery_urls: galleryUrls } : current));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not process the images.");
    } finally {
      setUploading(false);
      if (galleryPhotoInput.current) galleryPhotoInput.current.value = "";
    }
  }

  async function save() {
    if (!edit || uploading) return;
    const row = {
      ...blank,
      ...edit,
      price: Number(edit.price),
      price_local: Number(edit.price_local ?? edit.price),
      capacity: Number(edit.capacity),
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
            <RoomPhoto
              src={r.image_url ?? "/images/room-double.jpg"}
              alt=""
              className="aspect-video w-full object-cover"
            />
            <div className="p-5">
              <div className="flex justify-between">
                <div>
                  <div className="text-sm text-accent">{r.code}</div>
                  <div className="font-display text-2xl">{r.name}</div>
                </div>
                <div className="text-base text-primary">{lkr(r.price_local ?? r.price)}</div>
              </div>
              <div className="mt-1 text-sm text-muted-foreground">
                {r.active ? "Visible on website" : "Hidden"}
              </div>
              {r.description && (
                <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                  {r.description}
                </p>
              )}
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
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{edit?.id ? "Edit room" : "New room"}</DialogTitle>
          </DialogHeader>
          {edit && (
            <fieldset disabled={uploading} className="grid min-w-0 gap-5 border-0 p-0">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <Label className="mb-1 block text-base">Room no.</Label>
                  <Input
                    className="h-11"
                    value={edit.code ?? ""}
                    onChange={(e) => setEdit({ ...edit, code: e.target.value })}
                  />
                </div>
                <div>
                  <Label className="mb-1 block text-base">Name</Label>
                  <Input
                    className="h-11"
                    value={edit.name ?? ""}
                    onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                  />
                </div>
                <div>
                  <Label className="mb-1 block text-base">Price / night (LKR)</Label>
                  <Input
                    type="number"
                    min={1}
                    value={edit.price_local ?? edit.price ?? 0}
                    onChange={(e) =>
                      setEdit({
                        ...edit,
                        price: Number(e.target.value),
                        price_local: Number(e.target.value),
                      })
                    }
                  />
                </div>
                <div>
                  <Label className="mb-1 block text-base">Foreign / night (USD)</Label>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={edit.price_foreign ?? 0}
                    onChange={(e) => setEdit({ ...edit, price_foreign: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <Label className="mb-1 block text-base">Local day rate (LKR)</Label>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={edit.day_rate_local ?? edit.price ?? 0}
                    onChange={(e) => setEdit({ ...edit, day_rate_local: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <Label className="mb-1 block text-base">Foreign day rate (USD)</Label>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={edit.day_rate_foreign ?? 0}
                    onChange={(e) => setEdit({ ...edit, day_rate_foreign: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <Label className="mb-1 block text-base">Max guests</Label>
                  <Input
                    type="number"
                    value={edit.capacity ?? 2}
                    onChange={(e) => setEdit({ ...edit, capacity: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <Label htmlFor="room-gallery-urls" className="mb-1 block text-base">
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
                  <Label className="mb-1 block text-base">Bathroom</Label>
                  <Input
                    value={edit.bathroom ?? ""}
                    onChange={(e) => setEdit({ ...edit, bathroom: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <Label className="mb-1 block text-base">Description</Label>
                <Textarea
                  rows={4}
                  value={edit.description ?? ""}
                  onChange={(e) => setEdit({ ...edit, description: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="room-main-photo-file" className="mb-1 block text-base">
                  Main photo
                </Label>
                <input
                  ref={mainPhotoInput}
                  id="room-main-photo-file"
                  type="file"
                  accept="image/*"
                  disabled={uploading}
                  aria-label="Choose or take a main room photo from a phone or computer"
                  className="mb-3 block w-full rounded-md border border-input bg-transparent px-3 py-2 text-base file:mr-4 file:rounded-sm file:border-0 file:bg-secondary file:px-3 file:py-2 file:text-sm file:font-medium"
                  onChange={(event) => void setMainPhoto(event.target.files?.[0])}
                />
                <Label htmlFor="room-photo-url" className="mb-1 block text-base">
                  Or paste an image URL
                </Label>
                <Input
                  id="room-photo-url"
                  type="text"
                  value={edit.image_url ?? ""}
                  onChange={(e) => setEdit({ ...edit, image_url: e.target.value })}
                  placeholder="Or paste an image URL / /images/ path"
                />
                <p className="mt-1 text-sm text-muted-foreground">
                  On a phone, choose from your photo library or camera. On a computer, select an
                  image file.
                </p>
                {edit.image_url && (
                  <RoomPhoto src={edit.image_url} alt="" className="mt-2 h-24 object-cover" />
                )}
              </div>
              <div>
                <Label htmlFor="room-gallery-files" className="mb-1 block text-base">
                  Add gallery photos
                </Label>
                <input
                  ref={galleryPhotoInput}
                  id="room-gallery-files"
                  type="file"
                  accept="image/*"
                  multiple
                  disabled={uploading}
                  className="block w-full rounded-md border border-input bg-transparent px-3 py-2 text-base file:mr-4 file:rounded-sm file:border-0 file:bg-secondary file:px-3 file:py-2 file:text-sm file:font-medium"
                  onChange={(event) => void addGalleryPhotos(Array.from(event.target.files ?? []))}
                />
                <p className="mt-1 text-sm text-muted-foreground">
                  Add up to 12 photos from your phone or computer. Photos are compressed when you
                  save the room.
                </p>
                {!!edit.gallery_urls?.length && (
                  <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {edit.gallery_urls.map((url, index) => (
                      <div key={`${url}-${index}`} className="relative">
                        <RoomPhoto
                          src={url}
                          alt={`Room gallery photo ${index + 1}`}
                          className="aspect-square w-full object-cover"
                        />
                        <Button
                          type="button"
                          variant="destructive"
                          size="icon"
                          aria-label={`Remove gallery photo ${index + 1}`}
                          className="absolute right-1 top-1 size-8"
                          onClick={() =>
                            setEdit({
                              ...edit,
                              gallery_urls: edit.gallery_urls?.filter(
                                (_, photoIndex) => photoIndex !== index,
                              ),
                            })
                          }
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-6 text-base">
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
              <Button onClick={save} disabled={uploading}>
                {uploading ? "Processing photos…" : "Save room"}
              </Button>
            </fieldset>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
