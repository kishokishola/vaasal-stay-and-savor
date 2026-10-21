import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { getBookings, getRooms, subscribeToBookings, subscribeToRooms } from "@/lib/firebase-data";
import { useFirestoreRealtime } from "@/hooks/useFirestoreRealtime";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/staff/calendar")({
  component: RoomCalendar,
});

function RoomCalendar() {
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
  });
  const {
    data: rooms = [],
    isLoading: roomsLoading,
    isError: roomsError,
  } = useQuery({
    queryKey: ["admin-rooms"],
    queryFn: () => getRooms(true),
  });
  const {
    data: bookings = [],
    isLoading: bookingsLoading,
    isError: bookingsError,
  } = useQuery({
    queryKey: ["bookings"],
    queryFn: () => getBookings(),
  });
  useFirestoreRealtime(["admin-rooms"], subscribeToRooms);
  useFirestoreRealtime(["bookings"], subscribeToBookings);
  const days = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0)).getUTCDate();
  const monthName = month.toLocaleDateString("en", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  function dateKey(day: number) {
    return `${month.getUTCFullYear()}-${String(month.getUTCMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="eyebrow">Hotel operations</div>
          <h1 className="mt-2 text-4xl">Room calendar</h1>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="icon"
            aria-label="Previous month"
            onClick={() =>
              setMonth(new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() - 1, 1)))
            }
          >
            <ChevronLeft />
          </Button>
          <span className="min-w-36 text-center font-display text-xl">{monthName}</span>
          <Button
            variant="outline"
            size="icon"
            aria-label="Next month"
            onClick={() =>
              setMonth(new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1)))
            }
          >
            <ChevronRight />
          </Button>
          <Button asChild>
            <Link to="/staff/create-booking">Create booking</Link>
          </Button>
        </div>
      </div>
      {(roomsError || bookingsError) && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          Calendar data could not be loaded. Check your staff access and refresh.
        </p>
      )}
      <div className="mt-6 flex flex-wrap gap-3 text-sm">
        <Badge>Confirmed / in house</Badge>
        <Badge variant="secondary">Pending request</Badge>
        <span className="text-muted-foreground">
          Select a booking row in Booking History to contact its guest.
        </span>
      </div>
      <div className="mt-5 overflow-x-auto bg-card shadow-luxe">
        <table className="w-full min-w-max border-collapse text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 min-w-40 bg-card p-3 text-left">Room</th>
              {Array.from({ length: days }, (_, index) => (
                <th key={index} className="min-w-12 border-l border-border p-2 text-center">
                  <span className="block text-xs text-muted-foreground">
                    {new Date(
                      Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), index + 1),
                    ).toLocaleDateString("en", { weekday: "short", timeZone: "UTC" })}
                  </span>
                  {index + 1}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(roomsLoading || bookingsLoading) && (
              <tr>
                <td colSpan={days + 1} className="p-5 text-muted-foreground">
                  Loading room availability…
                </td>
              </tr>
            )}
            {!roomsLoading && !rooms.length && (
              <tr>
                <td colSpan={days + 1} className="p-5 text-muted-foreground">
                  No active rooms.
                </td>
              </tr>
            )}
            {rooms.map((room) => (
              <tr key={room.id} className="border-t border-border">
                <th className="sticky left-0 z-10 bg-card p-3 text-left">
                  <span className="block">{room.code}</span>
                  <span className="text-xs font-normal text-muted-foreground">{room.name}</span>
                </th>
                {Array.from({ length: days }, (_, index) => {
                  const date = dateKey(index + 1);
                  const booking = bookings.find(
                    (item) =>
                      item.room_id === room.id &&
                      date >= item.check_in &&
                      date < item.check_out &&
                      item.status !== "cancelled" &&
                      item.status !== "checked_out",
                  );
                  return (
                    <td
                      key={date}
                      title={
                        booking
                          ? `${booking.guest_name} · ${booking.status}`
                          : `${date} · Available`
                      }
                      className={`border-l border-border p-1 text-center ${booking ? (booking.status === "pending" ? "bg-amber-100 dark:bg-amber-950" : "bg-primary/15") : ""}`}
                    >
                      {booking && (
                        <span className="block truncate text-[10px]">
                          {index === Number(booking.check_in.slice(-2)) - 1
                            ? booking.guest_name
                            : "•"}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        The live calendar updates when a room, booking, confirmation or check-in changes.
      </p>
    </div>
  );
}
