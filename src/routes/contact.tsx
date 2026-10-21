import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Phone, Mail, MapPin, MessageCircle, Send } from "lucide-react";
import { toast } from "sonner";
import { SiteLayout, PageHero } from "@/components/site/SiteLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { publicAsset } from "@/lib/hotel";
import { sendContactMessage, useSiteSettings } from "@/lib/site-settings";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contact — Vaasal Villa Hotel" },
      {
        name: "description",
        content: "Contact Vaasal Villa Hotel in Jaffna by phone, email or WhatsApp.",
      },
      { property: "og:title", content: "Contact — Vaasal Villa Hotel" },
      { property: "og:description", content: "Reach Vaasal Villa by phone, email or WhatsApp." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Contact,
});

function Contact() {
  const { data: site } = useSiteSettings();
  const [form, setForm] = useState({ name: "", email: "", phone: "", message: "", website: "" });
  const [busy, setBusy] = useState(false);
  const hotel = site;
  const items = [
    { i: MapPin, l: "Address", v: hotel?.address ?? "Jaffna, Northern Province, Sri Lanka" },
    { i: Phone, l: "Phone", v: hotel?.phone ?? "+94 76 465 8567" },
    { i: Mail, l: "Email", v: hotel?.email ?? "stay@vaasalvilla.lk" },
  ];
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (form.website) return;
    setBusy(true);
    try {
      await sendContactMessage(form);
      setForm({ name: "", email: "", phone: "", message: "", website: "" });
      toast.success("Your message was sent to the hotel team.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not send your message.");
    } finally {
      setBusy(false);
    }
  }
  const mapUrl =
    hotel?.map_url ||
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(hotel?.address ?? "Jaffna, Northern Province, Sri Lanka")}`;
  return (
    <SiteLayout>
      <PageHero
        eyebrow="Get in touch"
        title="Contact Us"
        image={publicAsset("/images/room-king.jpg")}
      />
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
        <div className="mt-14 grid gap-10 lg:grid-cols-2">
          <form onSubmit={submit} className="space-y-4 bg-card p-7 shadow-luxe">
            <h2 className="font-display text-3xl">Send us a message</h2>
            <div>
              <Label htmlFor="contact-name">Your name</Label>
              <Input
                id="contact-name"
                required
                maxLength={120}
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="contact-email">Email</Label>
              <Input
                id="contact-email"
                type="email"
                required
                maxLength={254}
                value={form.email}
                onChange={(event) => setForm({ ...form, email: event.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="contact-phone">Phone (optional)</Label>
              <Input
                id="contact-phone"
                type="tel"
                maxLength={40}
                value={form.phone}
                onChange={(event) => setForm({ ...form, phone: event.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="contact-message">Message</Label>
              <Textarea
                id="contact-message"
                required
                maxLength={4000}
                rows={5}
                value={form.message}
                onChange={(event) => setForm({ ...form, message: event.target.value })}
              />
            </div>
            <div aria-hidden="true" className="absolute -left-[10000px] h-px w-px overflow-hidden">
              <Label htmlFor="contact-website">Leave this field blank</Label>
              <Input
                id="contact-website"
                tabIndex={-1}
                autoComplete="off"
                value={form.website}
                onChange={(event) => setForm({ ...form, website: event.target.value })}
              />
            </div>
            <Button type="submit" variant="luxe" disabled={busy}>
              <Send /> {busy ? "Sending…" : "Send message"}
            </Button>
            <p className="text-xs text-muted-foreground">
              Messages are delivered to the staff inbox in the admin dashboard.
            </p>
          </form>
          <div>
            <iframe
              title="Map to Vaasal Villa"
              src={`https://www.google.com/maps?q=${encodeURIComponent(hotel?.address ?? "Jaffna, Northern Province, Sri Lanka")}&output=embed`}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              className="h-72 w-full border-0"
            />
            <a
              href={mapUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-block text-sm text-primary hover:underline"
            >
              Open location in Google Maps
            </a>
            <div className="mt-10">
              <h2 className="font-display text-3xl">Frequently asked questions</h2>
              <div className="mt-4 divide-y divide-border">
                {(site?.faqs ?? []).map((faq, index) => (
                  <details key={`${faq.question}-${index}`} className="py-4">
                    <summary className="cursor-pointer font-medium">{faq.question}</summary>
                    <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                      {faq.answer}
                    </p>
                  </details>
                ))}
              </div>
            </div>
          </div>
        </div>
        <div className="mt-14 text-center">
          <Button asChild variant="luxe" size="lg">
            <a
              href={`https://api.whatsapp.com/send?phone=${(hotel?.whatsapp ?? "94764658567").replace(/\D/g, "")}`}
              target="_blank"
              rel="noreferrer"
            >
              <MessageCircle /> Chat on WhatsApp
            </a>
          </Button>
        </div>
      </section>
    </SiteLayout>
  );
}
