import { Link } from "@tanstack/react-router";
import { Users, Bath, Wifi, Snowflake } from "lucide-react";
import { publicAsset, rateAmount, roomRate } from "@/lib/hotel";
import type { PriceCurrency } from "@/lib/pricing";
import type { Tables } from "@/integrations/supabase/types";

type RoomCardData = Tables<"rooms"> & {
  price_local?: number;
  price_foreign?: number;
};

export function RoomCard({
  room,
  availability,
  currency = "LKR",
}: {
  room: RoomCardData;
  availability?: "Available today" | "Reserved today" | undefined;
  currency?: PriceCurrency;
}) {
  const nightlyRate = roomRate(room, currency, "night");
  return (
    <Link
      to="/rooms/$code"
      params={{ code: room.code }}
      className="group block overflow-hidden bg-card shadow-luxe transition hover:-translate-y-1"
    >
      <div className="relative aspect-[4/3] overflow-hidden">
        <img
          src={publicAsset(room.image_url ?? "/images/room-double.jpg")}
          alt={room.name}
          loading="lazy"
          onError={(event) => {
            const image = event.currentTarget;
            image.onerror = null;
            image.src = publicAsset("/images/room-double.jpg");
          }}
          className="h-full w-full object-cover transition duration-700 group-hover:scale-105"
        />
        <div className="absolute left-4 top-4 bg-espresso/85 px-3 py-1 text-xs tracking-widest text-gold">
          {room.code}
        </div>
        {availability && (
          <div className="absolute right-4 top-4 bg-espresso/85 px-3 py-1 text-xs tracking-wider text-gold">
            {availability}
          </div>
        )}
      </div>
      <div className="p-6">
        <h3 className="text-2xl">{room.name}</h3>
        <div className="mt-1 space-y-1 text-sm text-muted-foreground">
          <p>
            <span className="text-primary font-medium">
              {nightlyRate > 0 ? rateAmount(nightlyRate, currency) : "Rate not available"}
            </span>{" "}
            / night
          </p>
        </div>
        <div className="mt-4 flex flex-wrap gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Users className="size-3.5" />
            {room.capacity} Pax
          </span>
          <span className="flex items-center gap-1">
            <Bath className="size-3.5" />
            {room.bathroom}
          </span>
          {room.ac && (
            <span className="flex items-center gap-1">
              <Snowflake className="size-3.5" />
              AC
            </span>
          )}
          {room.wifi && (
            <span className="flex items-center gap-1">
              <Wifi className="size-3.5" />
              WiFi
            </span>
          )}
        </div>
        <div className="mt-5 text-xs uppercase tracking-[0.25em] text-accent">
          View &amp; Book →
        </div>
      </div>
    </Link>
  );
}
