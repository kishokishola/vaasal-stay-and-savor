import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import {
  addMenuItem,
  deleteMenuItem,
  getMenuItems,
  seedMenuItems,
  subscribeToMenuItems,
  updateMenuItem,
} from "@/lib/firebase-data";
import { getPublicMenuItems } from "@/lib/public-catalog";
import { useFirestoreRealtime } from "@/hooks/useFirestoreRealtime";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/staff/menu")({
  component: MenuAdmin,
});

function MenuAdmin() {
  const qc = useQueryClient();
  const [n, setN] = useState({
    name: "",
    category: "Mains",
    price_local: "",
    price_foreign: "",
    price_room_local: "",
    price_room_foreign: "",
    description: "",
    image_url: "",
  });
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["menu"],
    queryFn: getPublicMenuItems,
  });
  useFirestoreRealtime(["menu"], subscribeToMenuItems);
  const refresh = () => qc.invalidateQueries({ queryKey: ["menu"] });

  async function prepareMenuForWrite() {
    const storedItems = await getMenuItems();
    if (!storedItems.length && data?.length) await seedMenuItems(data);
  }

  async function uploadImage(file: File) {
    if (!file.type.startsWith("image/")) throw new Error("Choose an image file.");
    const image = await createImageBitmap(file);
    try {
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
        if (blob && blob.size <= 500_000) {
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
    } finally {
      image.close();
    }
    throw new Error("Image is too large after compression. Choose a smaller image.");
  }

  async function imageChanged(file: File | undefined, save: (image_url: string) => void) {
    if (!file) return;
    try {
      save(await uploadImage(file));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not process the image.");
    }
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    try {
      await prepareMenuForWrite();
      await addMenuItem({
        ...n,
        price: Number(n.price_local),
        price_local: Number(n.price_local),
        price_foreign: Number(n.price_foreign),
        price_room_local: Number(n.price_room_local),
        price_room_foreign: Number(n.price_room_foreign),
        ...(n.image_url ? { image_url: n.image_url } : {}),
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add menu item.");
      return;
    }
    toast.success("Menu item added.");
    setN({
      name: "",
      category: n.category,
      price_local: "",
      price_foreign: "",
      price_room_local: "",
      price_room_foreign: "",
      description: "",
      image_url: "",
    });
    refresh();
  }
  async function patch(
    id: string,
    p: {
      name?: string;
      category?: string;
      price?: number;
      price_local?: number;
      price_foreign?: number;
      price_room_local?: number;
      price_room_foreign?: number;
      description?: string;
      image_url?: string;
      available?: boolean;
    },
  ) {
    try {
      await prepareMenuForWrite();
      await updateMenuItem(id, p);
      refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update menu item.");
    }
  }
  async function del(id: string) {
    if (!confirm("Delete item?")) return;
    try {
      await prepareMenuForWrite();
      await deleteMenuItem(id);
      toast.success("Menu item removed.");
      refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete menu item.");
    }
  }
  return (
    <div>
      <div className="eyebrow">Restaurant</div>
      <h1 className="mt-2 text-4xl">Menu</h1>
      <form
        onSubmit={add}
        className="mt-8 grid gap-3 bg-card p-5 shadow-luxe sm:grid-cols-2 xl:grid-cols-4"
      >
        <Input
          placeholder="Item name"
          required
          value={n.name}
          onChange={(e) => setN({ ...n, name: e.target.value })}
        />
        <Input
          placeholder="Category"
          required
          value={n.category}
          onChange={(e) => setN({ ...n, category: e.target.value })}
        />
        <Input
          placeholder="Dining/takeaway · Local (LKR)"
          type="number"
          min={0.01}
          step="0.01"
          required
          value={n.price_local}
          onChange={(e) => setN({ ...n, price_local: e.target.value })}
        />
        <Input
          placeholder="Dining/takeaway · Foreign (USD)"
          type="number"
          min={0.01}
          step="0.01"
          required
          value={n.price_foreign}
          onChange={(e) => setN({ ...n, price_foreign: e.target.value })}
        />
        <Input
          placeholder="Room booking/service · Local (LKR)"
          type="number"
          min={0.01}
          step="0.01"
          required
          value={n.price_room_local}
          onChange={(e) => setN({ ...n, price_room_local: e.target.value })}
        />
        <Input
          placeholder="Room booking/service · Foreign (USD)"
          type="number"
          min={0.01}
          step="0.01"
          required
          value={n.price_room_foreign}
          onChange={(e) => setN({ ...n, price_room_foreign: e.target.value })}
        />
        <Input
          placeholder="Description"
          value={n.description}
          onChange={(e) => setN({ ...n, description: e.target.value })}
        />
        <Input
          aria-label="Food image"
          type="file"
          accept="image/*"
          onChange={(e) =>
            imageChanged(e.target.files?.[0], (image_url) =>
              setN((current) => ({ ...current, image_url })),
            )
          }
        />
        {n.image_url && (
          <img
            src={n.image_url}
            alt="Selected food preview"
            className="size-12 rounded object-cover"
          />
        )}
        <Button type="submit">
          <Plus /> Add
        </Button>
      </form>
      {isError && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {error instanceof Error ? error.message : "Could not load menu items."}
        </p>
      )}
      <div className="mt-6 overflow-x-auto bg-card shadow-luxe">
        <Table className="mobile-card-table">
          <TableHeader>
            <TableRow>
              <TableHead>Image</TableHead>
              <TableHead>Item</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Dining · Local LKR</TableHead>
              <TableHead>Dining · Foreign USD</TableHead>
              <TableHead>Room booking/service · Local LKR</TableHead>
              <TableHead>Room booking/service · Foreign USD</TableHead>
              <TableHead>Available</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={10}>Loading menu items…</TableCell>
              </TableRow>
            )}
            {!isLoading && !isError && !data?.filter((item) => !item.deleted).length && (
              <TableRow>
                <TableCell colSpan={10} className="text-muted-foreground">
                  No menu items yet. Add the first food item above.
                </TableCell>
              </TableRow>
            )}
            {data
              ?.filter((item) => !item.deleted)
              .map((m) => (
                <TableRow key={m.id}>
                  <TableCell data-label="Image">
                    {m.image_url && (
                      <img
                        src={m.image_url}
                        alt={m.name}
                        className="size-12 rounded object-cover"
                      />
                    )}
                    <Input
                      aria-label={`Change ${m.name} image`}
                      type="file"
                      accept="image/*"
                      className="mt-2 max-w-40"
                      onChange={(e) =>
                        imageChanged(e.target.files?.[0], (image_url) => patch(m.id, { image_url }))
                      }
                    />
                  </TableCell>
                  <TableCell data-label="Item">
                    <Input
                      defaultValue={m.name}
                      onBlur={(e) =>
                        e.target.value !== m.name && patch(m.id, { name: e.target.value })
                      }
                    />
                  </TableCell>
                  <TableCell data-label="Category">
                    <Input
                      defaultValue={m.category}
                      onBlur={(e) =>
                        e.target.value !== m.category && patch(m.id, { category: e.target.value })
                      }
                    />
                  </TableCell>
                  <TableCell data-label="Description">
                    <Input
                      defaultValue={m.description}
                      onBlur={(e) =>
                        e.target.value !== m.description &&
                        patch(m.id, { description: e.target.value })
                      }
                    />
                  </TableCell>
                  <TableCell data-label="Dining · Local LKR">
                    <Input
                      type="number"
                      className="w-28"
                      defaultValue={m.price}
                      min={0.01}
                      step="0.01"
                      onBlur={(e) => {
                        if (!e.target.value) return;
                        const price = Number(e.target.value);
                        if (price !== Number(m.price_local ?? m.price))
                          patch(m.id, { price, price_local: price });
                      }}
                    />
                  </TableCell>
                  <TableCell data-label="Dining · Foreign USD">
                    <Input
                      type="number"
                      className="w-28"
                      min={0.01}
                      step="0.01"
                      defaultValue={m.price_foreign ?? ""}
                      aria-label={`Foreign price in USD for ${m.name}`}
                      onBlur={(e) => {
                        if (!e.target.value) return;
                        const price_foreign = Number(e.target.value);
                        if (price_foreign !== Number(m.price_foreign))
                          patch(m.id, { price_foreign });
                      }}
                    />
                  </TableCell>
                  <TableCell data-label="Room service · Local LKR">
                    <Input
                      type="number"
                      className="w-28"
                      min={0.01}
                      step="0.01"
                      defaultValue={m.price_room_local ?? ""}
                      aria-label={`Room-service local price in LKR for ${m.name}`}
                      onBlur={(e) => {
                        if (!e.target.value) return;
                        const price_room_local = Number(e.target.value);
                        if (price_room_local !== Number(m.price_room_local))
                          patch(m.id, { price_room_local });
                      }}
                    />
                  </TableCell>
                  <TableCell data-label="Room service · Foreign USD">
                    <Input
                      type="number"
                      className="w-28"
                      min={0.01}
                      step="0.01"
                      defaultValue={m.price_room_foreign ?? ""}
                      aria-label={`Room-service foreign price in USD for ${m.name}`}
                      onBlur={(e) => {
                        if (!e.target.value) return;
                        const price_room_foreign = Number(e.target.value);
                        if (price_room_foreign !== Number(m.price_room_foreign))
                          patch(m.id, { price_room_foreign });
                      }}
                    />
                  </TableCell>
                  <TableCell data-label="Available">
                    <Switch
                      checked={m.available}
                      onCheckedChange={(v) => patch(m.id, { available: v })}
                    />
                  </TableCell>
                  <TableCell data-label="Actions">
                    <Button size="icon" variant="ghost" onClick={() => del(m.id)}>
                      <Trash2 />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
