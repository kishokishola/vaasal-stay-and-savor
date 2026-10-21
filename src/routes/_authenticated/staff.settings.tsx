import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, Inbox } from "lucide-react";
import {
  getContactMessages,
  getSiteSettings,
  markContactMessageRead,
  saveSiteSettings,
  subscribeToContactMessages,
  subscribeToSiteSettings,
  type SiteSettings,
} from "@/lib/site-settings";
import { useFirestoreRealtime } from "@/hooks/useFirestoreRealtime";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/staff/settings")({
  component: Settings,
});

const initial: SiteSettings = {
  name: "Vaasal Villa",
  tagline: "A luxury villa hotel in the heart of Jaffna",
  phone: "+94 76 465 8567",
  whatsapp: "94764658567",
  email: "stay@vaasalvilla.lk",
  address: "Jaffna, Northern Province, Sri Lanka",
  map_url: "",
  facebook: "",
  instagram: "",
  twitter: "",
  youtube: "",
  hero_title: "Where Jaffna welcomes you home.",
  hero_subtitle: "A luxury villa hotel combining comfort, style and timeless northern hospitality.",
  about_title: "Quiet luxury in the heart of Jaffna",
  about_body: "",
  about_image: "/images/room-family.jpg",
  services: [],
  faqs: [],
  terms: "",
  terms_pdf_url: "",
};

function Settings() {
  const qc = useQueryClient();
  const [form, setForm] = useState<SiteSettings>(initial);
  const [busy, setBusy] = useState(false);
  const { data: site } = useQuery({ queryKey: ["site-settings"], queryFn: getSiteSettings });
  const {
    data: messages = [],
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["contact-messages"],
    queryFn: getContactMessages,
  });
  useFirestoreRealtime(["site-settings"], subscribeToSiteSettings);
  useFirestoreRealtime(["contact-messages"], subscribeToContactMessages);
  useEffect(() => {
    if (site) setForm(site);
  }, [site]);

  function change<K extends keyof SiteSettings>(key: K, value: SiteSettings[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      await saveSiteSettings(form);
      await qc.invalidateQueries({ queryKey: ["site-settings"] });
      toast.success("Website settings published live.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save website settings.");
    } finally {
      setBusy(false);
    }
  }

  async function markRead(id: string) {
    try {
      await markContactMessageRead(id);
      await qc.invalidateQueries({ queryKey: ["contact-messages"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update message.");
    }
  }

  return (
    <div className="max-w-5xl">
      <div className="eyebrow">Admin</div>
      <h1 className="mt-2 text-4xl">Hotel & website settings</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Updates are saved in Firestore and appear on the customer site in realtime.
      </p>
      <form onSubmit={save} className="mt-6 space-y-8">
        <section className="grid gap-4 bg-card p-6 shadow-luxe sm:grid-cols-2">
          <h2 className="font-display text-2xl sm:col-span-2">Hotel contact</h2>
          {(
            [
              ["name", "Hotel name"],
              ["tagline", "Tagline"],
              ["phone", "Phone"],
              ["whatsapp", "WhatsApp number (country code)"],
              ["email", "Email"],
              ["address", "Address"],
              ["map_url", "Google Maps link"],
            ] as const
          ).map(([key, label]) => (
            <div key={key}>
              <Label htmlFor={`setting-${key}`}>{label}</Label>
              <Input
                id={`setting-${key}`}
                value={form[key]}
                onChange={(event) => change(key, event.target.value)}
              />
            </div>
          ))}
          <h2 className="font-display text-2xl sm:col-span-2">Social media</h2>
          {(
            [
              ["facebook", "Facebook"],
              ["instagram", "Instagram"],
              ["twitter", "X / Twitter"],
              ["youtube", "YouTube"],
            ] as const
          ).map(([key, label]) => (
            <div key={key}>
              <Label htmlFor={`setting-${key}`}>{label} URL</Label>
              <Input
                id={`setting-${key}`}
                type="url"
                value={form[key]}
                onChange={(event) => change(key, event.target.value)}
              />
            </div>
          ))}
        </section>
        <section className="grid gap-4 bg-card p-6 shadow-luxe">
          <h2 className="font-display text-2xl">Homepage and about</h2>
          {(
            [
              ["hero_title", "Homepage hero title"],
              ["hero_subtitle", "Homepage hero text"],
              ["about_title", "About section title"],
              ["about_image", "About image path or URL"],
            ] as const
          ).map(([key, label]) => (
            <div key={key}>
              <Label htmlFor={`setting-${key}`}>{label}</Label>
              <Input
                id={`setting-${key}`}
                value={form[key]}
                onChange={(event) => change(key, event.target.value)}
              />
            </div>
          ))}
          <div>
            <Label htmlFor="setting-about-body">About section text</Label>
            <Textarea
              id="setting-about-body"
              rows={5}
              value={form.about_body}
              onChange={(event) => change("about_body", event.target.value)}
            />
          </div>
        </section>
        <section className="grid gap-5 bg-card p-6 shadow-luxe">
          <h2 className="font-display text-2xl">Services (up to 20)</h2>
          {form.services.map((service, index) => (
            <div
              key={index}
              className="grid gap-3 border-b border-border pb-4 sm:grid-cols-[1fr_2fr_auto]"
            >
              <Input
                aria-label={`Service ${index + 1} title`}
                value={service.title}
                onChange={(event) =>
                  change(
                    "services",
                    form.services.map((item, i) =>
                      i === index ? { ...item, title: event.target.value } : item,
                    ),
                  )
                }
              />
              <Input
                aria-label={`Service ${index + 1} description`}
                value={service.description}
                onChange={(event) =>
                  change(
                    "services",
                    form.services.map((item, i) =>
                      i === index ? { ...item, description: event.target.value } : item,
                    ),
                  )
                }
              />
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  change(
                    "services",
                    form.services.filter((_, i) => i !== index),
                  )
                }
              >
                Remove
              </Button>
            </div>
          ))}
          {form.services.length < 20 && (
            <Button
              type="button"
              variant="outline"
              onClick={() => change("services", [...form.services, { title: "", description: "" }])}
            >
              Add service
            </Button>
          )}
        </section>
        <section className="grid gap-5 bg-card p-6 shadow-luxe">
          <h2 className="font-display text-2xl">Frequently asked questions (up to 30)</h2>
          {form.faqs.map((faq, index) => (
            <div key={index} className="grid gap-3 border-b border-border pb-4">
              <Input
                aria-label={`FAQ ${index + 1} question`}
                value={faq.question}
                onChange={(event) =>
                  change(
                    "faqs",
                    form.faqs.map((item, i) =>
                      i === index ? { ...item, question: event.target.value } : item,
                    ),
                  )
                }
              />
              <Textarea
                aria-label={`FAQ ${index + 1} answer`}
                value={faq.answer}
                onChange={(event) =>
                  change(
                    "faqs",
                    form.faqs.map((item, i) =>
                      i === index ? { ...item, answer: event.target.value } : item,
                    ),
                  )
                }
              />
              <Button
                type="button"
                variant="outline"
                className="w-fit"
                onClick={() =>
                  change(
                    "faqs",
                    form.faqs.filter((_, i) => i !== index),
                  )
                }
              >
                Remove FAQ
              </Button>
            </div>
          ))}
          {form.faqs.length < 30 && (
            <Button
              type="button"
              variant="outline"
              onClick={() => change("faqs", [...form.faqs, { question: "", answer: "" }])}
            >
              Add FAQ
            </Button>
          )}
        </section>
        <section className="bg-card p-6 shadow-luxe">
          <Label htmlFor="setting-terms" className="font-display text-2xl">
            Terms & conditions
          </Label>
          <Textarea
            id="setting-terms"
            className="mt-4"
            rows={10}
            value={form.terms}
            onChange={(event) => change("terms", event.target.value)}
          />
          <div className="mt-4">
            <Label htmlFor="setting-terms-pdf">Terms PDF URL (optional)</Label>
            <Input
              id="setting-terms-pdf"
              type="url"
              value={form.terms_pdf_url}
              onChange={(event) => change("terms_pdf_url", event.target.value)}
              placeholder="https://…"
            />
          </div>
        </section>
        <Button type="submit" size="lg" disabled={busy}>
          <Check /> {busy ? "Publishing…" : "Save and publish"}
        </Button>
      </form>

      <section className="mt-12">
        <div className="flex items-center gap-3">
          <Inbox className="text-accent" />
          <h2 className="font-display text-3xl">Website contact inbox</h2>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Contact form submissions are stored securely here for staff follow-up.
        </p>
        {isLoading && <p className="mt-4">Loading messages…</p>}
        {isError && (
          <p role="alert" className="mt-4 text-destructive">
            {error.message}
          </p>
        )}
        {!isLoading && !isError && !messages.length && (
          <p className="mt-4 text-muted-foreground">No messages yet.</p>
        )}
        <div className="mt-4 space-y-3">
          {messages.map((message) => (
            <article key={message.id} className="bg-card p-5 shadow-luxe">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-medium">{message.name}</h3>
                  <p className="text-sm text-muted-foreground">
                    {message.email}
                    {message.phone ? ` · ${message.phone}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground">
                    {new Date(message.created_at).toLocaleString()}
                  </span>
                  {message.status === "new" && (
                    <Button size="sm" variant="outline" onClick={() => void markRead(message.id)}>
                      Mark read
                    </Button>
                  )}
                </div>
              </div>
              <p className="mt-4 whitespace-pre-wrap text-sm">{message.message}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
