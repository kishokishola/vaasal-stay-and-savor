import { createFileRoute } from "@tanstack/react-router";
import { Phone, Mail, MapPin, MessageCircle } from "lucide-react";
import { SiteLayout, PageHero } from "@/components/site/SiteLayout";
import { Button } from "@/components/ui/button";
import { HOTEL } from "@/lib/hotel";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contact — Vaasal Villa Hotel" },
      { name: "description", content: "Contact Vaasal Villa Hotel in Jaffna by phone, email or WhatsApp." },
      { property: "og:title", content: "Contact — Vaasal Villa Hotel" },
      { property: "og:description", content: "Reach Vaasal Villa by phone, email or WhatsApp." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Contact,
});

function Contact() {
  const items = [
    { i: MapPin, l: "Address", v: HOTEL.address },
    { i: Phone, l: "Phone", v: HOTEL.phone },
    { i: Mail, l: "Email", v: HOTEL.email },
  ];
  return (
    <SiteLayout>
      <PageHero eyebrow="Get in touch" title="Contact Us" image="/images/room-king.jpg" />
      <section className="mx-auto max-w-5xl px-6 py-24">
        <div className="grid gap-6 md:grid-cols-3">
          {items.map((x) => (
            <div key={x.l} className="bg-card p-8 shadow-luxe">
              <x.i className="size-6 text-accent" />
              <div className="eyebrow mt-5">{x.l}</div>
              <p className="mt-2">{x.v}</p>
            </div>
          ))}
        </div>
        <div className="mt-14 text-center">
          <Button asChild variant="luxe" size="lg">
            <a href={`https://api.whatsapp.com/send?phone=${HOTEL.whatsapp}`} target="_blank" rel="noreferrer">
              <MessageCircle /> Chat on WhatsApp
            </a>
          </Button>
        </div>
      </section>
    </SiteLayout>
  );
}
