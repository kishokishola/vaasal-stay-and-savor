import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { toast } from "sonner";
import { Users, Bath, Wifi, Snowflake, CheckCircle2 } from "lucide-react";
import {
  createBooking,
  getBookedRanges,
  subscribeToBooking,
  subscribeToRoomLocks,
  subscribeToRooms,
  type Booking,
} from "@/lib/firebase-data";
import { auth } from "@/integrations/firebase/client";
import { getPublicRoomByCode } from "@/lib/public-catalog";
import { useFirestoreRealtime } from "@/hooks/useFirestoreRealtime";
import { hotelToday } from "@/lib/dates";
import { SiteLayout } from "@/components/site/SiteLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { lkr, nightsBetween, publicAsset, roomRate } from "@/lib/hotel";

export const Route = createFileRoute("/rooms/$code")({
  head: ({ params }) => ({
    meta: [
      { title: `Room ${params.code} — Vaasal Villa Hotel` },
      {
        name: "description",
        content: `View details and book room ${params.code} at Vaasal Villa Hotel, Jaffna.`,
      },
      { property: "og:title", content: `Room ${params.code} — Vaasal Villa Hotel` },
      {
        property: "og:description",
        content: "Check availability and request your booking online.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: RoomDetail,
});

function RoomDetail() {
  const { code } = Route.useParams();
  const {
    data: room,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["room", code],
    queryFn: () => getPublicRoomByCode(code),
  });
  useFirestoreRealtime(["room", code], subscribeToRooms);
  const { data: booked } = useQuery({
    enabled: !!room,
    queryKey: ["booked", room?.id],
    queryFn: () => getBookedRanges(room!.id),
  });
  useFirestoreRealtime(
    ["booked", room?.id],
    (onChange, onError) =>
      room ? subscribeToRoomLocks(room.id, onChange, onError) : () => undefined,
    !!room,
  );
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    in: "",
    out: "",
    guests: "1",
    notes: "",
  });
  const [done, setDone] = useState(false);
  const [trackedBookingId, setTrackedBookingId] = useState<string | null>(null);
  const [trackedBookingStatus, setTrackedBookingStatus] = useState<Booking["status"] | null>(null);
  const [busy, setBusy] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [currency, setCurrency] = useState<"LKR" | "USD">("LKR");
  const [period, setPeriod] = useState<"night" | "day">("night");
  const nights = nightsBetween(form.in, form.out);
  const photos = useMemo(
    () =>
      room
        ? [
            ...new Set(
              [room.image_url, ...(room.gallery_urls ?? [])].filter((url): url is string => !!url),
            ),
          ]
        : [],
    [room],
  );
  const rate = room ? roomRate(room, currency, period) : 0;
  const bookingTotal = rate * nights;
  useEffect(
    () =>
      onAuthStateChanged(auth, (user) => {
        if (!user) return;
        const savedBookingId = window.localStorage.getItem(`vaasal-last-booking-${user.uid}`);
        if (savedBookingId) setTrackedBookingId(savedBookingId);
      }),
    [],
  );
  useEffect(() => {
    if (!trackedBookingId) return;
    return subscribeToBooking(
      trackedBookingId,
      (booking) => setTrackedBookingStatus(booking?.status ?? null),
      (error) => toast.error(`Could not refresh booking status: ${error.message}`),
    );
  }, [trackedBookingId]);
  useEffect(() => {
    setGalleryIndex(0);
    if (photos.length < 2) return;
    const timer = window.setInterval(
      () => setGalleryIndex((current) => (current + 1) % photos.length),
      3000,
    );
    return () => window.clearInterval(timer);
  }, [photos]);

  if (isLoading)
    return (
      <SiteLayout>
        <div className="p-24 text-center text-muted-foreground">Loading…</div>
      </SiteLayout>
    );
  if (!room)
    return (
      <SiteLayout>
        <div className="p-24 text-center">
          <h1 className="text-4xl">{isError ? "Room details unavailable" : "Room not found"}</h1>
          {isError && (
            <p role="alert" className="mt-3 text-muted-foreground">
              We could not load this room. Please try again later.
            </p>
          )}
          <Link to="/rooms" className="mt-4 inline-block text-primary">
            Back to rooms
          </Link>
        </div>
      </SiteLayout>
    );

  const clash = (booked ?? []).some(
    (b) => form.in && form.out && b.check_in < form.out && b.check_out > form.in,
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!room) return;
    if (nights < 1) {
      toast.error("Please choose valid dates");
      return;
    }
    if (clash) {
      toast.error("Those dates are already booked");
      return;
    }
    setBusy(true);
    try {
      if (rate <= 0) {
        toast.error("This room does not have a price for that rate. Contact the hotel.");
        return;
      }
      const bookingId = await createBooking({
        room,
        guest_name: form.name,
        guest_email: form.email,
        guest_phone: form.phone,
        check_in: form.in,
        check_out: form.out,
        guests: Number(form.guests),
        notes: form.notes.trim() || null,
        rate_currency: currency,
        rate_period: period,
      });
      if (auth.currentUser) {
        window.localStorage.setItem(`vaasal-last-booking-${auth.currentUser.uid}`, bookingId);
      }
      setTrackedBookingId(bookingId);
      setDone(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not submit booking.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SiteLayout>
      <section className="relative h-[60vh] min-h-[420px] overflow-hidden">
        <img
          src={publicAsset(photos[galleryIndex] ?? room.image_url ?? "/images/room-double.jpg")}
          alt={room.name}
          onError={(event) => {
            const image = event.currentTarget;
            image.onerror = null;
            image.src = publicAsset("/images/room-double.jpg");
          }}
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-hero-overlay" />
        <div className="relative mx-auto flex h-full max-w-7xl items-end px-6 pb-14 text-espresso-foreground">
          <div className="fade-up">
            <div className="eyebrow text-gold">Room {room.code}</div>
            <h1 className="mt-3 text-5xl md:text-6xl">{room.name}</h1>
            <p className="mt-3 text-lg text-gold">
              {lkr(room.price)} <span className="text-sm opacity-80">/ night</span>
            </p>
          </div>
        </div>
      </section>
      <section className="mx-auto grid max-w-7xl gap-14 px-6 py-20 lg:grid-cols-[1fr_440px]">
        <div>
          <div className="eyebrow">The Room</div>
          <p className="mt-4 text-lg leading-relaxed text-muted-foreground">{room.description}</p>
          <div className="mt-10 grid grid-cols-2 gap-6 sm:grid-cols-4">
            {[
              { i: Users, t: `${room.capacity} Guests` },
              { i: Bath, t: `${room.bathroom} bath` },
              { i: Snowflake, t: room.ac ? "Air conditioned" : "Fan room" },
              { i: Wifi, t: room.wifi ? "Free WiFi" : "No WiFi" },
            ].map((f) => (
              <div key={f.t} className="border border-border bg-card p-5">
                <f.i className="size-5 text-accent" />
                <div className="mt-3 text-sm">{f.t}</div>
              </div>
            ))}
          </div>
          {photos.length > 1 && (
            <div className="mt-5 flex gap-3 overflow-x-auto">
              {photos.map((photo, index) => (
                <button
                  key={photo}
                  type="button"
                  aria-label={`Show room photo ${index + 1}`}
                  aria-pressed={galleryIndex === index}
                  onClick={() => setGalleryIndex(index)}
                  className={`shrink-0 border-2 ${galleryIndex === index ? "border-accent" : "border-transparent"}`}
                >
                  <img
                    src={publicAsset(photo)}
                    alt={`${room.name} view ${index + 1}`}
                    className="size-20 object-cover"
                  />
                </button>
              ))}
            </div>
          )}
          <div className="mt-6 flex flex-wrap gap-2 text-sm">
            <span className="rounded border border-border px-3 py-2">
              Local overnight: {lkr(room.price_local ?? room.price)}
            </span>
            {room.price_foreign ? (
              <span className="rounded border border-border px-3 py-2">
                Foreign overnight: USD {room.price_foreign.toLocaleString()}
              </span>
            ) : null}
            <span className="rounded border border-border px-3 py-2">
              Local day rate: {lkr(room.day_rate_local ?? room.price)}
            </span>
            {room.day_rate_foreign ? (
              <span className="rounded border border-border px-3 py-2">
                Foreign day rate: USD {room.day_rate_foreign.toLocaleString()}
              </span>
            ) : null}
          </div>
          {(booked ?? []).length > 0 && (
            <div className="mt-10">
              <div className="eyebrow">Already booked</div>
              <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
                {booked!.map((b, i) => (
                  <li key={i}>
                    {b.check_in} → {b.check_out}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <aside className="h-fit bg-card p-8 shadow-luxe">
          {done || trackedBookingId ? (
            <div className="text-center">
              <CheckCircle2 className="mx-auto size-12 text-accent" />
              <h2 className="mt-4 text-3xl">
                {done ? "Request received" : "Your booking request"}
              </h2>
              <p className="mt-3 text-sm text-muted-foreground">
                {done ? `Thank you, ${form.name}. ` : ""}
                Our team will confirm your stay shortly. Payment is made at the hotel.
              </p>
              <p className="mt-3 text-sm" aria-live="polite">
                Status: {trackedBookingStatus?.replace("_", " ") ?? "checking"}
              </p>
              <Button asChild variant="outline" className="mt-6">
                <Link to="/rooms">Browse more rooms</Link>
              </Button>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <h2 className="text-3xl">Reserve this room</h2>
              <p className="text-xs text-muted-foreground">Pay at the hotel on arrival.</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Rate currency</Label>
                  <Select
                    value={currency}
                    onValueChange={(value) => {
                      if (value === "LKR" || value === "USD") setCurrency(value);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="LKR">Local · LKR</SelectItem>
                      <SelectItem
                        value="USD"
                        disabled={period === "night" ? !room.price_foreign : !room.day_rate_foreign}
                      >
                        Foreign · USD
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Rate type</Label>
                  <Select
                    value={period}
                    onValueChange={(value) => {
                      if (value === "night" || value === "day") setPeriod(value);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="night">Overnight</SelectItem>
                      <SelectItem
                        value="day"
                        disabled={currency === "USD" && !room.day_rate_foreign}
                      >
                        Day rate
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Check-in</Label>
                  <Input
                    type="date"
                    required
                    min={hotelToday()}
                    value={form.in}
                    onChange={(e) => setForm({ ...form, in: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Check-out</Label>
                  <Input
                    type="date"
                    required
                    min={form.in || hotelToday()}
                    value={form.out}
                    onChange={(e) => setForm({ ...form, out: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <Label>Guests</Label>
                <Input
                  type="number"
                  min={1}
                  max={room.capacity}
                  value={form.guests}
                  onChange={(e) => setForm({ ...form, guests: e.target.value })}
                />
              </div>
              <div>
                <Label>Full name</Label>
                <Input
                  required
                  maxLength={100}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div>
                <Label>Email</Label>
                <Input
                  type="email"
                  required
                  maxLength={255}
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
              <div>
                <Label>Phone</Label>
                <Input
                  required
                  maxLength={30}
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </div>
              <div>
                <Label>Special requests</Label>
                <Textarea
                  maxLength={500}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </div>
              {nights > 0 && (
                <div className="flex justify-between border-t border-border pt-4 text-sm">
                  <span>
                    {nights} {period === "night" ? "night" : "day"}
                    {nights > 1 ? "s" : ""}
                  </span>
                  <span className="font-medium text-primary">
                    {currency === "LKR"
                      ? lkr(bookingTotal)
                      : `USD ${bookingTotal.toLocaleString()}`}
                  </span>
                </div>
              )}
              {clash && <p className="text-sm text-destructive">These dates are not available.</p>}
              <Button
                type="submit"
                variant="luxe"
                className="w-full"
                size="lg"
                disabled={busy || clash || rate <= 0}
              >
                {busy ? "Sending…" : "Request Booking"}
              </Button>
            </form>
          )}
        </aside>
      </section>
    </SiteLayout>
  );
}
