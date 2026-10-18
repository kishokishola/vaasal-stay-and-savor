import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SiteLayout, PageHero } from "@/components/site/SiteLayout";
import { lkr } from "@/lib/hotel";

export const Route = createFileRoute("/dining")({
  head: () => ({
    meta: [
      { title: "Dining & Menu — Vaasal Villa Hotel" },
      { name: "description", content: "Authentic Jaffna cuisine at Vaasal Villa — crab curry, kothu, hoppers and more. See our full menu." },
      { property: "og:title", content: "Dining & Menu — Vaasal Villa Hotel" },
      { property: "og:description", content: "Authentic Jaffna cuisine served by candlelight." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dining,
});

function Dining() {
  const { data } = useQuery({
    queryKey: ["menu-public"],
    queryFn: async () => {
      const { data, error } = await supabase.from("menu_items").select("*").eq("available", true).order("category").order("name");
      if (error) throw error;
      return data;
    },
  });
  const groups = (data ?? []).reduce<Record<string, typeof data>>((acc, m) => {
    (acc[m.category] ||= [] as never).push(m);
    return acc;
  }, {});
  return (
    <SiteLayout>
      <PageHero eyebrow="The Restaurant" title="Flavours of the North" image="/images/dining.jpg" />
      <section className="mx-auto max-w-5xl px-6 py-24">
        <div className="grid gap-16 md:grid-cols-2">
          {Object.entries(groups).map(([cat, items]) => (
            <div key={cat}>
              <div className="eyebrow">{cat}</div>
              <div className="gold-rule mt-3 mb-6" />
              <ul className="space-y-6">
                {items!.map((m) => (
                  <li key={m.id}>
                    <div className="flex items-baseline gap-3">
                      <span className="font-display text-xl">{m.name}</span>
                      <span className="flex-1 border-b border-dotted border-border" />
                      <span className="text-sm text-primary">{lkr(m.price)}</span>
                    </div>
                    {m.description && <p className="mt-1 text-sm text-muted-foreground">{m.description}</p>}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </SiteLayout>
  );
}
