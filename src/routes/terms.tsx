import { createFileRoute } from "@tanstack/react-router";
import { SiteLayout, PageHero } from "@/components/site/SiteLayout";
import { publicAsset } from "@/lib/hotel";
import { useSiteSettings } from "@/lib/site-settings";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms & Conditions — Vaasal Villa Hotel" },
      { name: "description", content: "Read the booking and guest terms for Vaasal Villa Hotel." },
    ],
  }),
  component: Terms,
});

function Terms() {
  const { data: site } = useSiteSettings();
  return (
    <SiteLayout>
      <PageHero
        eyebrow="Guest information"
        title="Terms & Conditions"
        image={publicAsset("/images/room-king.jpg")}
      />
      <section className="mx-auto max-w-4xl px-6 py-24">
        <div className="mb-6 flex flex-wrap gap-3 print:hidden">
          <Button type="button" variant="outline" onClick={() => window.print()}>
            Print / Save as PDF
          </Button>
          {site?.terms_pdf_url && (
            <Button asChild variant="outline">
              <a href={site.terms_pdf_url} target="_blank" rel="noreferrer">
                View terms PDF
              </a>
            </Button>
          )}
        </div>
        <p className="whitespace-pre-wrap leading-8 text-muted-foreground">
          {site?.terms ??
            "Booking requests are subject to confirmation by Vaasal Villa. Prices and availability may change until confirmed. Payment is made directly to the hotel. Guests are responsible for providing accurate contact and booking information."}
        </p>
      </section>
    </SiteLayout>
  );
}
