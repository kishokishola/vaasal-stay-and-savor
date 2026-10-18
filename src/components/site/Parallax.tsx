import { useEffect, useRef } from "react";

/** Background image that moves slower than the page while scrolling, with a slow cinematic zoom. */
export function ParallaxImage({ src, alt = "", speed = 0.35, eager = false }: { src: string; alt?: string; speed?: number; eager?: boolean }) {
  const ref = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const update = () => {
      const parent = el.parentElement!;
      const r = parent.getBoundingClientRect();
      const offset = (r.top + r.height / 2 - window.innerHeight / 2) * -speed;
      el.style.transform = `translate3d(0, ${offset}px, 0)`;
    };
    const onScroll = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => { window.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onScroll); cancelAnimationFrame(raf); };
  }, [speed]);
  return (
    <div className="absolute inset-0 overflow-hidden">
      <img ref={ref} src={src} alt={alt} loading={eager ? "eager" : "lazy"} className="absolute -inset-y-[20%] inset-x-0 h-[140%] w-full object-cover will-change-transform" />
      <div className="absolute inset-0 animate-none" />
    </div>
  );
}

/** Fades/slides children in when they scroll into view. */
export function Reveal({ children, className = "", delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => { if (entries[0]?.isIntersecting) { el.dataset["shown"] = "true"; io.disconnect(); } }, { threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return <div ref={ref} style={{ transitionDelay: `${delay}ms` }} className={`reveal ${className}`}>{children}</div>;
}
