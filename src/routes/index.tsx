import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Shield, Waves, Sparkles, Headphones } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SiteLayout } from "@/components/site/SiteLayout";
import { RoomCard } from "@/components/site/RoomCard";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Vaasal Villa Hotel — Luxury Stay in Jaffna" },
      { name: "description", content: "Vaasal Villa is a luxury villa hotel in Jaffna with elegant rooms, Jaffna cuisine and warm hospitality. Book your stay online." },
      { property: "og:title", content: "Vaasal Villa Hotel — Luxury Stay in Jaffna" },
      { property: "og:description", content: "Elegant rooms, Jaffna cuisine and warm hospitality. Book online." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Home,
});

export const roomsQuery = {
  queryKey: ["rooms"],
  queryFn: async () => {
    const { data, error } = await supabase.from("rooms").select("*").eq("active", true).order("code");
    if (error) throw error;
    return data;
  },
};

const features = [
  { icon: Sparkles, title: "Relaxed Living", text: "Calm interiors, crisp linen and quiet nights." },
  { icon: Shield, title: "High Security", text: "Round-the-clock security for peace of mind." },
  { icon: Waves, title: "Private Beach", text: "Golden shores just moments from your door." },
  { icon: Headphones, title: "24/7 Support", text: "24-hour check-in and dedicated guest care." },
];

function Home() {
  const { data: rooms } = useQuery(roomsQuery);
  return (
    <SiteLayout transparent>
      <section className="relative flex h-screen min-h-[640px] items-center overflow-hidden">
        <img src="/images/hero.jpg" alt="Vaasal Villa at sunset" width={1920} height={1088} className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-hero-overlay" />
        <div className="relative mx-auto w-full max-w-7xl px-6 text-espresso-foreground">
          <div className="max-w-2xl fade-up">
            <div className="eyebrow text-gold">Welcome to Vaasal Villa</div>
            <h1 className="mt-6 text-6xl leading-[1.05] md:text-8xl">Where Jaffna welcomes you home.</h1>
            <p className="mt-6 max-w-lg text-lg opacity-85">
              A luxury villa hotel combining comfort, style and timeless northern hospitality.
            </p>
            <div className="mt-10 flex flex-wrap gap-4">
              <Button asChild variant="luxe" size="lg"><Link to="/rooms">Reserve a Room</Link></Button>
              <Button asChild variant="ghostLight" size="lg"><Link to="/dining">Our Dining</Link></Button>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-16 px-6 py-28 md:grid-cols-2 md:items-center">
        <div>
          <div className="eyebrow">About Us</div>
          <h2 className="mt-4 text-5xl">Quiet luxury in the heart of Jaffna</h2>
          <div className="gold-rule my-8" />
          <p className="text-muted-foreground leading-relaxed">
            Well-furnished rooms, a calm atmosphere and the essentials done beautifully — free high-speed WiFi,
            24-hour check-in and dedicated guest support. Whether for business, family or leisure, we focus on
            cleanliness, comfort and personal care so you feel at home throughout your stay.
          </p>
          <div className="mt-10 grid grid-cols-2 gap-8">
            {features.map((f) => (
              <div key={f.title}>
                <f.icon className="size-6 text-accent" />
                <div className="mt-3 font-display text-xl">{f.title}</div>
                <p className="mt-1 text-sm text-muted-foreground">{f.text}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <img src="/images/room-king.jpg" alt="King suite" loading="lazy" className="aspect-[3/4] w-full object-cover shadow-luxe" />
          <img src="/images/dining.jpg" alt="Jaffna cuisine" loading="lazy" className="mt-16 aspect-[3/4] w-full object-cover shadow-luxe" />
        </div>
      </section>

      <section className="bg-secondary py-28">
        <div className="mx-auto max-w-7xl px-6">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <div className="eyebrow">Our Rooms</div>
              <h2 className="mt-4 text-5xl">Explore our rooms</h2>
            </div>
            <Button asChild variant="outline"><Link to="/rooms">View all rooms</Link></Button>
          </div>
          <div className="mt-14 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {(rooms ?? []).slice(0, 6).map((r) => <RoomCard key={r.id} room={r} />)}
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden py-32">
        <img src="/images/dining.jpg" alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-hero-overlay" />
        <div className="relative mx-auto max-w-3xl px-6 text-center text-espresso-foreground">
          <div className="eyebrow text-gold">The Restaurant</div>
          <h2 className="mt-4 text-5xl md:text-6xl">Authentic flavours of the North</h2>
          <p className="mt-6 opacity-85">Lagoon crab curry, odiyal kool, fresh hoppers and more — served by candlelight.</p>
          <Button asChild variant="luxe" size="lg" className="mt-10"><Link to="/dining">See the Menu</Link></Button>
        </div>
      </section>
    </SiteLayout>
  );
}
