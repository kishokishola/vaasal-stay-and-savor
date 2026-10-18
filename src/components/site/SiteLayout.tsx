import { Link } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { Menu, X, Phone, Mail, MapPin, MessageCircle } from "lucide-react";
import { HOTEL } from "@/lib/hotel";
import { Button } from "@/components/ui/button";

const nav = [
  { to: "/", label: "Home" },
  { to: "/rooms", label: "Rooms" },
  { to: "/dining", label: "Dining" },
  { to: "/about", label: "About" },
  { to: "/contact", label: "Contact" },
] as const;

export function SiteLayout({ children, transparent = false }: { children: ReactNode; transparent?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-screen flex flex-col">
      <header
        className={
          transparent
            ? "absolute inset-x-0 top-0 z-40 text-espresso-foreground"
            : "sticky top-0 z-40 bg-espresso text-espresso-foreground"
        }
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <Link to="/" className="flex flex-col leading-none">
            <span className="font-display text-2xl">Vaasal Villa</span>
            <span className="text-[0.6rem] uppercase tracking-[0.4em] text-gold">Jaffna · Hotel</span>
          </Link>
          <nav className="hidden items-center gap-8 md:flex">
            {nav.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                className="text-xs uppercase tracking-[0.25em] opacity-80 transition hover:opacity-100 hover:text-gold"
                activeProps={{ className: "text-gold opacity-100" }}
                activeOptions={{ exact: n.to === "/" }}
              >
                {n.label}
              </Link>
            ))}
            <Button asChild variant="luxe" size="sm">
              <Link to="/rooms">Book Now</Link>
            </Button>
          </nav>
          <button className="md:hidden" onClick={() => setOpen(!open)} aria-label="Menu">
            {open ? <X /> : <Menu />}
          </button>
        </div>
        {open && (
          <div className="flex flex-col gap-4 bg-espresso px-6 pb-6 md:hidden">
            {nav.map((n) => (
              <Link key={n.to} to={n.to} onClick={() => setOpen(false)} className="text-sm uppercase tracking-[0.25em]">
                {n.label}
              </Link>
            ))}
          </div>
        )}
      </header>
      <main className="flex-1">{children}</main>
      <footer className="bg-espresso text-espresso-foreground">
        <div className="mx-auto grid max-w-7xl gap-10 px-6 py-16 md:grid-cols-3">
          <div>
            <div className="font-display text-3xl">Vaasal Villa</div>
            <div className="gold-rule my-4" />
            <p className="text-sm opacity-75">{HOTEL.tagline}. Warm hospitality, quiet luxury.</p>
          </div>
          <div className="space-y-3 text-sm opacity-85">
            <div className="eyebrow mb-4">Reach us</div>
            <p className="flex gap-2"><MapPin className="size-4 text-gold" />{HOTEL.address}</p>
            <p className="flex gap-2"><Phone className="size-4 text-gold" />{HOTEL.phone}</p>
            <p className="flex gap-2"><Mail className="size-4 text-gold" />{HOTEL.email}</p>
          </div>
          <div className="space-y-3 text-sm">
            <div className="eyebrow mb-4">Explore</div>
            {nav.map((n) => (
              <Link key={n.to} to={n.to} className="block opacity-75 hover:text-gold">{n.label}</Link>
            ))}
            <Link to="/auth" className="block opacity-50 hover:text-gold">Staff login</Link>
          </div>
        </div>
        <div className="border-t border-sidebar-border py-5 text-center text-xs opacity-60">
          © {new Date().getFullYear()} Vaasal Villa Hotel. All rights reserved.
        </div>
      </footer>
      <a
        href={`https://api.whatsapp.com/send?phone=${HOTEL.whatsapp}&text=Hi!%20I%20need%20help.`}
        target="_blank"
        rel="noreferrer"
        className="fixed bottom-6 right-6 z-50 flex size-14 items-center justify-center rounded-full bg-gold-gradient text-accent-foreground shadow-luxe"
        aria-label="Chat on WhatsApp"
      >
        <MessageCircle />
      </a>
    </div>
  );
}

export function PageHero({ eyebrow, title, image }: { eyebrow: string; title: string; image: string }) {
  return (
    <section className="relative flex h-[46vh] min-h-[340px] items-end overflow-hidden">
      <img src={image} alt="" className="absolute inset-0 h-full w-full object-cover" />
      <div className="absolute inset-0 bg-hero-overlay" />
      <div className="relative mx-auto w-full max-w-7xl px-6 pb-14 text-espresso-foreground fade-up">
        <div className="eyebrow text-gold">{eyebrow}</div>
        <h1 className="mt-3 text-5xl md:text-6xl">{title}</h1>
      </div>
    </section>
  );
}
