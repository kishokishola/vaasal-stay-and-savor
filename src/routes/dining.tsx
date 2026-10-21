import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Minus, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { onAuthStateChanged } from "firebase/auth";
import { getPublicMenuItems } from "@/lib/public-catalog";
import { SiteLayout, PageHero } from "@/components/site/SiteLayout";
import { lkr, publicAsset } from "@/lib/hotel";
import type { CustomerOrderRequest, MenuItem } from "@/lib/firebase-data";
import { createCustomerOrderRequest, subscribeToCustomerOrderRequest } from "@/lib/firebase-data";
import { subscribeToMenuItems } from "@/lib/firebase-data";
import { useFirestoreRealtime } from "@/hooks/useFirestoreRealtime";
import { auth } from "@/integrations/firebase/client";
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

export const Route = createFileRoute("/dining")({
  head: () => ({
    meta: [
      { title: "Dining & Menu — Vaasal Villa Hotel" },
      {
        name: "description",
        content:
          "Authentic Jaffna cuisine at Vaasal Villa — crab curry, kothu, hoppers and more. See our full menu.",
      },
      { property: "og:title", content: "Dining & Menu — Vaasal Villa Hotel" },
      { property: "og:description", content: "Authentic Jaffna cuisine served by candlelight." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dining,
});

type DiningLine = { item: MenuItem; qty: number };

function Dining() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["menu-public"],
    queryFn: getPublicMenuItems,
  });
  useFirestoreRealtime(["menu-public"], subscribeToMenuItems);
  const [cart, setCart] = useState<DiningLine[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [orderType, setOrderType] = useState<CustomerOrderRequest["order_type"]>("dine_in");
  const [orderReference, setOrderReference] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [trackingUid, setTrackingUid] = useState<string | null>(null);
  const [trackedIds, setTrackedIds] = useState<string[]>([]);
  const [trackedOrders, setTrackedOrders] = useState<Record<string, CustomerOrderRequest | null>>(
    {},
  );
  const [trackingErrors, setTrackingErrors] = useState<Record<string, string>>({});
  const items = (data ?? []).filter((item) => item.available && !item.deleted);
  const groups = items.reduce<Record<string, MenuItem[]>>((acc, m) => {
    (acc[m.category] ||= [] as never).push(m);
    return acc;
  }, {});
  const subtotal = useMemo(
    () => cart.reduce((total, line) => total + Number(line.item.price) * line.qty, 0),
    [cart],
  );
  useEffect(
    () =>
      onAuthStateChanged(auth, (user) => {
        setTrackingUid(user?.uid ?? null);
        if (!user) {
          setTrackedIds([]);
          return;
        }
        try {
          const saved = window.localStorage.getItem(`vaasal-villa:dining-orders:${user.uid}`);
          const parsed: unknown = saved ? JSON.parse(saved) : [];
          setTrackedIds(
            Array.isArray(parsed) && parsed.every((id) => typeof id === "string")
              ? parsed.slice(0, 10)
              : [],
          );
        } catch (error) {
          console.error("Could not restore saved dining order references.", error);
          setTrackedIds([]);
        }
      }),
    [],
  );
  useEffect(() => {
    if (!trackingUid || !trackedIds.length) return;
    const stop = trackedIds.map((id) =>
      subscribeToCustomerOrderRequest(
        id,
        (request) => {
          setTrackedOrders((current) => ({ ...current, [id]: request }));
          setTrackingErrors((current) => ({ ...current, [id]: "" }));
        },
        (error) => {
          console.error(`Could not follow dining order ${id}.`, error);
          setTrackingErrors((current) => ({ ...current, [id]: error.message }));
        },
      ),
    );
    return () => stop.forEach((unsubscribe) => unsubscribe());
  }, [trackingUid, trackedIds]);
  function add(item: MenuItem) {
    setCart((current) => {
      const existing = current.find((line) => line.item.id === item.id);
      return existing
        ? current.map((line) => (line.item.id === item.id ? { ...line, qty: line.qty + 1 } : line))
        : [...current, { item, qty: 1 }];
    });
  }
  function bump(id: string, delta: number) {
    setCart((current) =>
      current
        .map((line) => (line.item.id === id ? { ...line, qty: line.qty + delta } : line))
        .filter((line) => line.qty > 0),
    );
  }
  async function sendOrder() {
    if (!cart.length) {
      toast.error("Add at least one food item to your order.");
      return;
    }
    if (!customerName.trim() || !customerPhone.trim()) {
      toast.error("Enter your name and phone number to continue.");
      return;
    }
    if (orderType === "room" && !orderReference.trim()) {
      toast.error("Enter your room number for room service.");
      return;
    }
    setSubmitting(true);
    try {
      const requestId = await createCustomerOrderRequest({
        customer_name: customerName,
        customer_phone: customerPhone,
        order_type: orderType,
        order_reference: orderType === "takeaway" ? null : orderReference.trim() || null,
        items_summary: cart
          .map(({ item, qty }) => `${qty} x ${item.name} — ${lkr(Number(item.price) * qty)}`)
          .join("\n"),
        items: cart.map(({ item, qty }) => ({
          menu_item_id: item.id,
          name: item.name,
          price: Number(item.price),
          qty,
        })),
        subtotal_estimate: subtotal,
        notes: notes.trim() || null,
      });
      const uid = auth.currentUser?.uid;
      if (uid) {
        const next = [requestId, ...trackedIds.filter((id) => id !== requestId)].slice(0, 10);
        try {
          window.localStorage.setItem(`vaasal-villa:dining-orders:${uid}`, JSON.stringify(next));
        } catch (error) {
          console.error("Could not save dining order references on this device.", error);
        }
        setTrackingUid(uid);
        setTrackedIds(next);
      }
      setCart([]);
      setNotes("");
      toast.success(`Order request received. Reference: ${requestId.slice(0, 8)}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not submit your food order.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SiteLayout>
      <PageHero
        eyebrow="The Restaurant"
        title="Flavours of the North"
        image={publicAsset("/images/dining.jpg")}
      />
      <section className="mx-auto max-w-5xl px-6 py-24">
        {isLoading && <p className="text-muted-foreground">Loading restaurant menu…</p>}
        {isError && (
          <p role="alert" className="text-destructive">
            The restaurant menu could not be loaded. Please try again later.
          </p>
        )}
        {!isLoading && !isError && !data?.length && (
          <p className="text-muted-foreground">
            Our menu is being updated. Please check back soon.
          </p>
        )}
        {!isLoading && !isError && !!data?.length && !items.length && (
          <p className="text-muted-foreground">
            No dishes are available to order right now. Please check back soon.
          </p>
        )}
        <div className="grid gap-16 md:grid-cols-2">
          {Object.entries(groups).map(([cat, items]) => (
            <div key={cat}>
              <div className="eyebrow">{cat}</div>
              <div className="gold-rule mt-3 mb-6" />
              <ul className="space-y-6">
                {items!.map((m) => (
                  <li key={m.id} className="flex items-start gap-3">
                    {m.image_url && (
                      <img
                        src={m.image_url}
                        alt={m.name}
                        className="size-16 shrink-0 rounded object-cover"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-3">
                        <span className="font-display text-xl">{m.name}</span>
                        <span className="flex-1 border-b border-dotted border-border" />
                        <span className="text-sm text-primary">{lkr(m.price)}</span>
                      </div>
                      {m.description && (
                        <p className="mt-1 text-sm text-muted-foreground">{m.description}</p>
                      )}
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="mt-2"
                        onClick={() => add(m)}
                      >
                        <Plus /> Add to order
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        {items.length > 0 && (
          <section className="mt-16 bg-card p-6 shadow-luxe">
            <div className="eyebrow">Your order</div>
            <h2 className="mt-2 font-display text-3xl">Place a dining order</h2>
            <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_1fr]">
              <div className="space-y-4">
                {!cart.length && (
                  <p className="text-sm text-muted-foreground">
                    Choose food items above. Your subtotal will update automatically.
                  </p>
                )}
                {cart.map(({ item, qty }) => (
                  <div key={item.id} className="flex items-center gap-2 text-sm">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">{item.name}</div>
                      <div className="text-muted-foreground">
                        {lkr(item.price)} each · {lkr(Number(item.price) * qty)}
                      </div>
                    </div>
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      aria-label={`Remove one ${item.name}`}
                      onClick={() => bump(item.id, -1)}
                    >
                      <Minus />
                    </Button>
                    <span className="w-6 text-center">{qty}</span>
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      aria-label={`Add one ${item.name}`}
                      onClick={() => bump(item.id, 1)}
                    >
                      <Plus />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label={`Remove ${item.name} from order`}
                      onClick={() => bump(item.id, -qty)}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                ))}
                <div className="flex justify-between border-t border-border pt-4 font-display text-xl">
                  <span>Subtotal</span>
                  <span className="text-primary">{lkr(subtotal)}</span>
                </div>
              </div>
              <div className="grid content-start gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="dining-customer-name">Your name</Label>
                  <Input
                    id="dining-customer-name"
                    autoComplete="name"
                    maxLength={120}
                    value={customerName}
                    onChange={(event) => setCustomerName(event.target.value)}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="dining-customer-phone">Phone number</Label>
                  <Input
                    id="dining-customer-phone"
                    type="tel"
                    autoComplete="tel"
                    maxLength={40}
                    value={customerPhone}
                    onChange={(event) => setCustomerPhone(event.target.value)}
                    required
                  />
                </div>
                <div>
                  <Label>Order type</Label>
                  <Select
                    value={orderType}
                    onValueChange={(value) => {
                      if (value === "dine_in" || value === "takeaway" || value === "room") {
                        setOrderType(value);
                        if (value === "takeaway") setOrderReference("");
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
                {orderType !== "takeaway" && (
                  <div>
                    <Label htmlFor="dining-order-reference">
                      {orderType === "room" ? "Room number" : "Table number"}
                    </Label>
                    <Input
                      id="dining-order-reference"
                      maxLength={40}
                      value={orderReference}
                      onChange={(event) => setOrderReference(event.target.value)}
                      required={orderType === "room"}
                    />
                  </div>
                )}
                <div className="sm:col-span-2">
                  <Label htmlFor="dining-order-notes">Order notes</Label>
                  <Input
                    id="dining-order-notes"
                    maxLength={500}
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    placeholder="Allergies or special requests"
                  />
                </div>
                <Button
                  type="button"
                  variant="luxe"
                  size="lg"
                  className="sm:col-span-2"
                  disabled={!cart.length || submitting}
                  onClick={sendOrder}
                >
                  {submitting ? "Sending order…" : "Place order"}
                </Button>
                <p className="text-xs text-muted-foreground sm:col-span-2">
                  Your order request and estimated subtotal will be sent to the hotel team for
                  confirmation. Payment is arranged with the restaurant.
                </p>
              </div>
            </div>
          </section>
        )}
        {trackedIds.length > 0 && (
          <section className="mt-8 bg-card p-6 shadow-luxe" aria-live="polite">
            <div className="eyebrow">Live updates</div>
            <h2 className="mt-2 font-display text-2xl">Your order status</h2>
            <ul className="mt-4 space-y-3">
              {trackedIds.map((id) => {
                const request = trackedOrders[id];
                return (
                  <li key={id} className="border-t border-border pt-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono text-sm">
                        Order {id.slice(0, 8).toUpperCase()}
                      </span>
                      <span className="text-sm font-medium text-primary">
                        {request?.status?.replace("_", " ") ?? "Checking status…"}
                      </span>
                    </div>
                    {request?.converted_order_no && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        POS ticket #{request.converted_order_no}
                        {request.converted_total !== undefined &&
                          ` · Confirmed total ${lkr(request.converted_total)}`}
                      </p>
                    )}
                    {request && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {request.items_summary.replaceAll("\n", " · ")}
                      </p>
                    )}
                    {trackingErrors[id] && (
                      <p role="alert" className="mt-1 text-xs text-destructive">
                        Status is temporarily unavailable: {trackingErrors[id]}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </section>
    </SiteLayout>
  );
}
