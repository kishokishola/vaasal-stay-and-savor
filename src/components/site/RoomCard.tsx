import { Link } from "@tanstack/react-router";
import { Users, Bath, Wifi, Snowflake } from "lucide-react";
import { lkr } from "@/lib/hotel";
import type { Tables } from "@/integrations/supabase/types";

export function RoomCard({ room }: { room: Tables<"rooms"> }) {
  return (
    <Link
      to="/rooms/$code"
      params={{ code: room.code }}
      className="group block overflow-hidden bg-card shadow-luxe transition hover:-translate-y-1"
    >
      <div className="relative aspect-[4/3] overflow-hidden">
        <img
          src={room.image_url ?? "/images/room-double.jpg"}
          alt={room.name}
          loading="lazy"
          className="h-full w-full object-cover transition duration-700 group-hover:scale-105"
        />
        <div className="absolute left-4 top-4 bg-espresso/85 px-3 py-1 text-xs tracking-widest text-gold">
          {room.code}
        </div>
      </div>
      <div className="p-6">
        <h3 className="text-2xl">{room.name}</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          <span className="text-primary font-medium">{lkr(room.price)}</span> / night
        </p>
        <div className="mt-4 flex flex-wrap gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><Users className="size-3.5" />{room.capacity} Pax</span>
          <span className="flex items-center gap-1"><Bath className="size-3.5" />{room.bathroom}</span>
          {room.ac && <span className="flex items-center gap-1"><Snowflake className="size-3.5" />AC</span>}
          {room.wifi && <span className="flex items-center gap-1"><Wifi className="size-3.5" />WiFi</span>}
        </div>
        <div className="mt-5 text-xs uppercase tracking-[0.25em] text-accent">View &amp; Book →</div>
      </div>
    </Link>
  );
}
