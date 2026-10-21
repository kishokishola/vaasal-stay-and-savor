import { createFileRoute } from "@tanstack/react-router";
import { ConciergeBell, Sparkles, Utensils, Wifi, Car, Shirt } from "lucide-react";
import { SiteLayout, PageHero } from "@/components/site/SiteLayout";
import { publicAsset } from "@/lib/hotel";
import { useSiteSettings } from "@/lib/site-settings";

export const Route = createFileRoute("/services")({
  head: () => ({
    meta: [
      { title: "Services — Vaasal Villa Hotel" },
      {
        name: "description",
        content: "Explore the services available to guests at Vaasal Villa Hotel.",
      },
    ],
  }),
  component: Services,
});

const icons = [Utensils, ConciergeBell, Car, Wifi, Shirt, Sparkles];

function Services() {
  const { data: site } = useSiteSettings();
  const services = site?.services ?? [];
  return (
    <SiteLayout>
      <PageHero
        eyebrow="Thoughtful hospitality"
        title="Services"
        image={publicAsset("/images/dining.jpg")}
      />
      <section className="mx-auto max-w-7xl px-6 py-24">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {services.map((service, index) => {
            const Icon = icons[index % icons.length]!;
            return (
              <article key={`${service.title}-${index}`} className="bg-card p-8 shadow-luxe">
                <Icon className="size-7 text-accent" />
                <h2 className="mt-5 font-display text-2xl">{service.title}</h2>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  {service.description}
                </p>
              </article>
            );
          })}
        </div>
        {!services.length && (
          <p className="text-muted-foreground">
            Our services are being updated. Please contact us for assistance.
          </p>
        )}
      </section>
    </SiteLayout>
  );
}
