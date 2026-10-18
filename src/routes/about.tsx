import { createFileRoute } from "@tanstack/react-router";
import { SiteLayout, PageHero } from "@/components/site/SiteLayout";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About Us — Vaasal Villa Hotel" },
      { name: "description", content: "Discover Vaasal Villa, a luxury villa hotel in Jaffna known for comfort, cleanliness and personal care." },
      { property: "og:title", content: "About Us — Vaasal Villa Hotel" },
      { property: "og:description", content: "Comfort, cleanliness and personal care in the heart of Jaffna." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: About,
});

function About() {
  return (
    <SiteLayout>
      <PageHero eyebrow="Our Story" title="About Vaasal Villa" image="/images/hero.jpg" />
      <section className="mx-auto grid max-w-6xl gap-16 px-6 py-24 md:grid-cols-2 md:items-center">
        <div className="space-y-6 text-muted-foreground leading-relaxed">
          <div className="eyebrow">Vaasal — the doorway</div>
          <h2 className="text-5xl text-foreground">An open door to Jaffna</h2>
          <div className="gold-rule" />
          <p>In Tamil, <em>vaasal</em> means doorway — the place where guests are welcomed. That idea shapes everything we do.</p>
          <p>Located in the heart of Jaffna, Vaasal Villa combines comfort, style and relaxation. Our rooms are thoughtfully furnished, our atmosphere calm, and the essentials — free high-speed WiFi, 24-hour check-in and dedicated guest support — are always taken care of.</p>
          <p>Whether you visit for business, family or leisure, we deliver a memorable stay through premium service and warm hospitality.</p>
        </div>
        <img src="/images/room-family.jpg" alt="Family room" loading="lazy" className="aspect-[4/5] w-full object-cover shadow-luxe" />
      </section>
    </SiteLayout>
  );
}
