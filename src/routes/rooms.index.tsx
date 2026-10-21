import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { SiteLayout, PageHero } from "@/components/site/SiteLayout";
import { RoomCard } from "@/components/site/RoomCard";
import { publicAsset, roomsQuery } from "@/lib/hotel";
import { getReservedRoomIds, subscribeToDateLocks, subscribeToRooms } from "@/lib/firebase-data";
import { hotelToday } from "@/lib/dates";
import { useFirestoreRealtime } from "@/hooks/useFirestoreRealtime";
import { Button } from "@/components/ui/button";

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
  const [page, setPage] = useState(1);
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
  const pageCount = Math.max(1, Math.ceil((data?.length ?? 0) / 6));
  const pageRooms = useMemo(() => (data ?? []).slice((page - 1) * 6, page * 6), [data, page]);
  useEffect(() => setPage((current) => Math.min(current, pageCount)), [pageCount]);
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
          {pageRooms.map((r) => (
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
        {pageCount > 1 && (
          <div className="mt-10 flex items-center justify-center gap-3">
            <Button
              variant="outline"
              disabled={page <= 1}
              onClick={() => setPage((value) => Math.max(1, value - 1))}
            >
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {page} of {pageCount}
            </span>
            <Button
              variant="outline"
              disabled={page >= pageCount}
              onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
            >
              Next
            </Button>
          </div>
        )}
      </section>
    </SiteLayout>
  );
}
