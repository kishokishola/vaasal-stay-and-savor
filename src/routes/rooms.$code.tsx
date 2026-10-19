import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Users, Bath, Wifi, Snowflake, CheckCircle2 } from "lucide-react";
import { createBooking, getBookedRanges } from "@/lib/firebase-data";
import { getPublicRoomByCode } from "@/lib/public-catalog";
import { SiteLayout } from "@/components/site/SiteLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { lkr, nightsBetween, publicAsset } from "@/lib/hotel";

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

const today = () => new Date().toISOString().slice(0, 10);

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
  const { data: booked } = useQuery({
    enabled: !!room,
    queryKey: ["booked", room?.id],
    queryFn: () => getBookedRanges(room!.id),
  });
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
  const [busy, setBusy] = useState(false);
  const nights = nightsBetween(form.in, form.out);

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
      await createBooking({
        room,
        guest_name: form.name,
        guest_email: form.email,
        guest_phone: form.phone,
        check_in: form.in,
        check_out: form.out,
        guests: Number(form.guests),
        notes: form.notes.trim() || null,
      });
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
          src={publicAsset(room.image_url ?? "/images/room-double.jpg")}
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
          {done ? (
            <div className="text-center">
              <CheckCircle2 className="mx-auto size-12 text-accent" />
              <h2 className="mt-4 text-3xl">Request received</h2>
              <p className="mt-3 text-sm text-muted-foreground">
                Thank you, {form.name}. Our team will confirm your stay shortly. Payment is made at
                the hotel.
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
                  <Label>Check-in</Label>
                  <Input
                    type="date"
                    required
                    min={today()}
                    value={form.in}
                    onChange={(e) => setForm({ ...form, in: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Check-out</Label>
                  <Input
                    type="date"
                    required
                    min={form.in || today()}
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
                    {nights} night{nights > 1 ? "s" : ""}
                  </span>
                  <span className="font-medium text-primary">
                    {lkr(nights * Number(room.price))}
                  </span>
                </div>
              )}
              {clash && <p className="text-sm text-destructive">These dates are not available.</p>}
              <Button
                type="submit"
                variant="luxe"
                className="w-full"
                size="lg"
                disabled={busy || clash}
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
