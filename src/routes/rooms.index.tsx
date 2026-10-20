import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { SiteLayout, PageHero } from "@/components/site/SiteLayout";
import { RoomCard } from "@/components/site/RoomCard";
import { publicAsset, roomsQuery } from "@/lib/hotel";
import { getReservedRoomIds, subscribeToDateLocks, subscribeToRooms } from "@/lib/firebase-data";
import { hotelToday } from "@/lib/dates";
import { useFirestoreRealtime } from "@/hooks/useFirestoreRealtime";

export const Route = createFileRoute("/rooms/")({
  head: () => ({
    meta: [
      { title: "Rooms & Suites — Vaasal Villa Hotel" },
      {
        name: "description",
        content:
          "Browse Vaasal Villa's rooms in Jaffna — double, king and family rooms with AC, WiFi and attached bathrooms.",
      },
      { property: "og:title", content: "Rooms & Suites — Vaasal Villa Hotel" },
      {
        property: "og:description",
        content: "Double, king and family rooms in Jaffna. Book online.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Rooms,
});

function Rooms() {
  const { data, isLoading, isError } = useQuery(roomsQuery);
  const today = hotelToday();
  const availabilityKey = ["reserved-room-ids", today];
  const { data: reservedRoomIds } = useQuery({
    queryKey: availabilityKey,
    queryFn: () => getReservedRoomIds(today),
  });
  useFirestoreRealtime(roomsQuery.queryKey, subscribeToRooms);
  useFirestoreRealtime(availabilityKey, (onChange, onError) =>
    subscribeToDateLocks(today, onChange, onError),
  );
  return (
    <SiteLayout>
      <PageHero
        eyebrow="Stay with us"
        title="Rooms & Suites"
        image={publicAsset("/images/room-family.jpg")}
      />
      <section className="mx-auto max-w-7xl px-6 py-24">
        {isLoading && <p className="text-muted-foreground">Loading rooms…</p>}
        {isError && (
          <p role="alert" className="text-destructive">
            Room details could not be loaded. Please try again later.
          </p>
        )}
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {(data ?? []).map((r) => (
            <RoomCard
              key={r.id}
              room={r}
              availability={
                reservedRoomIds
                  ? reservedRoomIds.includes(r.id)
                    ? "Reserved today"
                    : "Available today"
                  : undefined
              }
            />
          ))}
        </div>
        {!isLoading && !isError && !data?.length && (
          <p className="text-muted-foreground">No rooms are currently available to display.</p>
        )}
      </section>
    </SiteLayout>
  );
}
