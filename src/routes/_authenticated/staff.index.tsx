import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  BedDouble,
  CalendarCheck,
  ChefHat,
  CreditCard,
  Receipt,
  Settings,
  ShoppingCart,
  Users,
  UtensilsCrossed,
  Wallet,
} from "lucide-react";
import {
  getBookings,
  getMenuItems,
  getPettyCash,
  getReservedRoomIds,
  getRooms,
  subscribeToBookings,
  subscribeToDateLocks,
  subscribeToMenuItems,
  subscribeToPettyCash,
  subscribeToRooms,
  type Booking,
} from "@/lib/firebase-data";
import { lkr } from "@/lib/hotel";
import { hotelToday } from "@/lib/dates";
import { useFirestoreRealtime } from "@/hooks/useFirestoreRealtime";

export const Route = createFileRoute("/_authenticated/staff/")({
  component: Overview,
});

function Overview() {
  const today = hotelToday();
  const overviewKey = ["overview", today];
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: overviewKey,
    queryFn: async () => {
      const [bookings, rooms, reservedRoomIds, menuItems, pettyCash] = await Promise.all([
        getBookings(),
        getRooms(true),
        getReservedRoomIds(today),
        getMenuItems(),
        getPettyCash(),
      ]);
      return {
        bookings,
        totalBookings: bookings.length,
        availableRooms: rooms.filter((room) => !reservedRoomIds.includes(room.id)).length,
        foodItems: menuItems.filter((item) => !item.deleted).length,
        funds: pettyCash.balance,
      };
    },
  });
  useFirestoreRealtime(overviewKey, subscribeToBookings);
  useFirestoreRealtime(overviewKey, subscribeToRooms);
  useFirestoreRealtime(overviewKey, (onChange, onError) =>
    subscribeToDateLocks(today, onChange, onError),
  );
  useFirestoreRealtime(overviewKey, subscribeToMenuItems);
  useFirestoreRealtime(overviewKey, subscribeToPettyCash);

  const metrics = [
    { label: "Total Bookings", value: data?.totalBookings ?? "–", icon: CalendarCheck },
    { label: "Available Rooms", value: data?.availableRooms ?? "–", icon: BedDouble },
    { label: "Food Items", value: data?.foodItems ?? "–", icon: UtensilsCrossed },
    { label: "Petty Cash Balance", value: data ? lkr(data.funds) : "–", icon: Wallet },
  ] as const;
  const actions = [
    {
      label: "Manage Rooms",
      description: "Edit room details, photos, prices and availability.",
      to: "/staff/rooms",
      icon: BedDouble,
    },
    {
      label: "Food Menu",
      description: "Manage restaurant food items, prices and availability.",
      to: "/staff/menu",
      icon: UtensilsCrossed,
    },
    {
      label: "Room Calendar",
      description: "View room reservations and availability by date.",
      to: "/staff/calendar",
      icon: CalendarCheck,
    },
    {
      label: "Petty Cash",
      description: "Review the cash balance and expense ledger.",
      to: "/staff/petty-cash",
      icon: Wallet,
    },
    {
      label: "Track Payments",
      description: "Review collections, expenses and cash deposits.",
      to: "/staff/funds",
      icon: BarChart3,
    },
    {
      label: "Booking History",
      description: "Review guest reservations and booking status.",
      to: "/staff/bookings",
      icon: Receipt,
    },
    {
      label: "Pending Payments",
      description: "Review outstanding room and restaurant balances.",
      to: "/staff/payments",
      icon: CreditCard,
    },
    {
      label: "Order History",
      description: "Review restaurant bills, queues and sales reports.",
      to: "/staff/orders",
      icon: ShoppingCart,
    },
    {
      label: "Restaurant POS",
      description: "Create dine-in, takeaway and room-service bills.",
      to: "/staff/pos",
      icon: ShoppingCart,
    },
    {
      label: "Kitchen Queue",
      description: "Update order preparation and service progress.",
      to: "/staff/kitchen",
      icon: ChefHat,
    },
    {
      label: "Settings",
      description: "Manage hotel details and website settings.",
      to: "/staff/settings",
      icon: Settings,
    },
    {
      label: "Staff Accounts",
      description: "Create and manage Admin and Cashier access.",
      to: "/staff/team",
      icon: Users,
    },
  ] as const;
  const upcoming = (data?.bookings ?? [])
    .filter(
      (booking) =>
        booking.check_out >= today &&
        booking.status !== "cancelled" &&
        booking.status !== "checked_out",
    )
    .sort((a, b) => a.check_in.localeCompare(b.check_in))
    .slice(0, 5);

  return (
    <div>
      <div className="eyebrow">Admin dashboard · {today}</div>
      <h1 className="mt-2 text-4xl">Hotel operations</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Live overview of bookings, room availability, food menu and petty cash.
      </p>
      {isLoading && <p className="mt-6 text-sm text-muted-foreground">Loading live hotel data…</p>}
      {isError && (
        <div
          role="alert"
          className="mt-6 rounded-sm border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive"
        >
          <p>Dashboard data could not be loaded: {error.message}</p>
          <button className="mt-2 underline" onClick={() => void refetch()}>
            Try again
          </button>
        </div>
      )}
      <div className="mt-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map(({ label, value, icon: Icon }) => (
          <article key={label} className="bg-card p-6 shadow-luxe">
            <Icon className="size-5 text-primary" />
            <div className="mt-4 text-xs uppercase tracking-widest text-muted-foreground">
              {label}
            </div>
            <div className="mt-2 font-display text-3xl text-primary">{value}</div>
          </article>
        ))}
      </div>
      <div className="mt-10 grid gap-8 xl:grid-cols-[1fr_1.4fr]">
        <section className="bg-card p-6 shadow-luxe">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="eyebrow">Hotel operations</div>
              <h2 className="mt-2 font-display text-2xl">Upcoming stays</h2>
            </div>
            <Link to="/staff/bookings" className="text-sm text-primary hover:underline">
              All bookings
            </Link>
          </div>
          {!isLoading && !isError && !upcoming.length && (
            <p className="mt-6 text-sm text-muted-foreground">
              No upcoming bookings have been recorded.
            </p>
          )}
          <div className="mt-4 divide-y divide-border">
            {upcoming.map((booking) => (
              <UpcomingBooking key={booking.id} booking={booking} />
            ))}
          </div>
        </section>
        <section>
          <div className="eyebrow">Admin access</div>
          <h2 className="mt-2 font-display text-2xl">Manage your hotel</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {actions.map(({ label, description, to, icon: Icon }) => (
              <Link
                key={to}
                to={to}
                className="bg-card p-5 shadow-luxe transition hover:-translate-y-0.5 hover:ring-1 hover:ring-accent"
              >
                <Icon className="size-5 text-primary" />
                <div className="mt-3 font-medium text-primary">{label}</div>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{description}</p>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function UpcomingBooking({ booking }: { booking: Booking }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 py-3">
      <div>
        <div className="font-medium">{booking.guest_name}</div>
        <div className="text-xs text-muted-foreground">
          {booking.room_code} · {booking.check_in} → {booking.check_out}
        </div>
      </div>
      <span className="text-xs capitalize text-muted-foreground">
        {booking.status.replaceAll("_", " ")}
      </span>
    </div>
  );
}
