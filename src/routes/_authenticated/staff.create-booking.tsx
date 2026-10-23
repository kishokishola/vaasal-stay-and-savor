import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { createStaffBooking, getRooms, subscribeToRooms } from "@/lib/firebase-data";
import { useFirestoreRealtime } from "@/hooks/useFirestoreRealtime";
import { hotelToday } from "@/lib/dates";
import { lkr, rateAmount, roomRate } from "@/lib/hotel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/staff/create-booking")({
  component: CreateBooking,
});

function CreateBooking() {
  const qc = useQueryClient();
  const [roomId, setRoomId] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [guests, setGuests] = useState(1);
  const [notes, setNotes] = useState("");
  const [currency, setCurrency] = useState<"LKR" | "USD">("LKR");
  const [period, setPeriod] = useState<"night" | "day">("night");
  const [initialPayment, setInitialPayment] = useState("0");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card" | "bank_transfer" | "online">(
    "cash",
  );
  const [busy, setBusy] = useState(false);
  const {
    data: rooms = [],
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["admin-rooms"],
    queryFn: () => getRooms(true),
  });
  useFirestoreRealtime(["admin-rooms"], subscribeToRooms);
  const room = rooms.find((item) => item.id === roomId);
  const nights = useMemo(() => {
    if (!checkIn || !checkOut) return 0;
    const count =
      (Date.parse(`${checkOut}T00:00:00Z`) - Date.parse(`${checkIn}T00:00:00Z`)) / 86400000;
    return Number.isInteger(count) && count > 0 ? count : 0;
  }, [checkIn, checkOut]);
  const rate = room ? Number(roomRate(room, currency, period)) : 0;
  const total = rate * nights;
  const initialPaid = Number(initialPayment);
  const validInitialPayment =
    Number.isFinite(initialPaid) && initialPaid >= 0 && initialPaid <= total;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!room || !nights) {
      toast.error("Choose a room and valid check-in/check-out dates.");
      return;
    }
    if (!validInitialPayment) {
      toast.error("Initial payment must be between zero and the booking total.");
      return;
    }
    setBusy(true);
    try {
      await createStaffBooking({
        roomId,
        guest_name: name,
        guest_email: email,
        guest_phone: phone,
        check_in: checkIn,
        check_out: checkOut,
        guests,
        notes: notes.trim() || null,
        rate_currency: currency,
        rate_period: period,
        initial_payment: initialPaid,
        payment_method: paymentMethod,
      });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["bookings"] }),
        qc.invalidateQueries({ queryKey: ["reserved-room-ids"] }),
        qc.invalidateQueries({ queryKey: ["booked"] }),
      ]);
      toast.success("Booking created and room dates reserved.");
      setRoomId("");
      setName("");
      setEmail("");
      setPhone("");
      setCheckIn("");
      setCheckOut("");
      setNotes("");
      setInitialPayment("0");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create this booking.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-3xl">
      <div className="eyebrow">Hotel</div>
      <h1 className="mt-2 text-4xl">Create booking</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Staff-created bookings are confirmed immediately and reserve the selected room dates.
      </p>
      {isError && (
        <p role="alert" className="mt-4 text-destructive">
          Could not load available rooms.
        </p>
      )}
      <form onSubmit={submit} className="mt-6 grid gap-5 bg-card p-6 shadow-luxe sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label>Room</Label>
          <Select value={roomId} onValueChange={setRoomId} disabled={isLoading}>
            <SelectTrigger>
              <SelectValue placeholder={isLoading ? "Loading rooms…" : "Select an active room"} />
            </SelectTrigger>
            <SelectContent>
              {rooms.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.code} — {item.name} ·{" "}
                  {rateAmount(roomRate(item, currency, "night"), currency)} / night
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="staff-booking-name">Guest name</Label>
          <Input
            id="staff-booking-name"
            required
            maxLength={120}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="staff-booking-email">Guest email</Label>
          <Input
            id="staff-booking-email"
            type="email"
            maxLength={254}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="staff-booking-phone">Guest phone</Label>
          <Input
            id="staff-booking-phone"
            type="tel"
            required
            maxLength={40}
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="staff-booking-guests">Guests</Label>
          <Input
            id="staff-booking-guests"
            type="number"
            required
            min={1}
            max={room?.capacity ?? 20}
            value={guests}
            onChange={(event) => setGuests(Number(event.target.value))}
          />
        </div>
        <div>
          <Label htmlFor="staff-booking-check-in">Check-in</Label>
          <Input
            id="staff-booking-check-in"
            type="date"
            required
            min={hotelToday()}
            value={checkIn}
            onChange={(event) => setCheckIn(event.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="staff-booking-check-out">Check-out</Label>
          <Input
            id="staff-booking-check-out"
            type="date"
            required
            min={checkIn || hotelToday()}
            value={checkOut}
            onChange={(event) => setCheckOut(event.target.value)}
          />
        </div>
        <div>
          <Label>Rate currency</Label>
          <Select
            value={currency}
            onValueChange={(value) => {
              if (value === "LKR" || value === "USD") setCurrency(value);
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="LKR">Local · LKR</SelectItem>
              <SelectItem
                value="USD"
                disabled={
                  !room || (period === "night" ? !room.price_foreign : !room.day_rate_foreign)
                }
              >
                Foreign · USD
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Rate type</Label>
          <Select
            value={period}
            onValueChange={(value) => {
              if (value === "night" || value === "day") setPeriod(value);
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="night">Overnight</SelectItem>
              <SelectItem value="day" disabled={currency === "USD" && !room?.day_rate_foreign}>
                Day rate
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="staff-booking-initial-payment">Initial payment ({currency})</Label>
          <Input
            id="staff-booking-initial-payment"
            type="number"
            min="0"
            max={total}
            step="0.01"
            value={initialPayment}
            onChange={(event) => setInitialPayment(event.target.value)}
          />
        </div>
        <div>
          <Label>Payment method</Label>
          <Select
            value={paymentMethod}
            onValueChange={(value) => {
              if (
                value === "cash" ||
                value === "card" ||
                value === "bank_transfer" ||
                value === "online"
              )
                setPaymentMethod(value);
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="cash">Cash</SelectItem>
              <SelectItem value="card">Card</SelectItem>
              <SelectItem value="bank_transfer">Bank transfer</SelectItem>
              <SelectItem value="online">Online payment</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="staff-booking-notes">Notes</Label>
          <Textarea
            id="staff-booking-notes"
            maxLength={500}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </div>
        <div className="sm:col-span-2 flex flex-wrap items-center justify-between gap-4 border-t border-border pt-4">
          <div>
            <span className="text-sm text-muted-foreground">
              {nights} night(s) × {currency === "USD" ? "USD " : "LKR "}
              {rate.toLocaleString()}
            </span>
            <div className="font-display text-2xl text-primary">
              Total: {currency === "LKR" ? lkr(total) : `USD ${total.toLocaleString()}`}
            </div>
            <div className="text-sm text-muted-foreground">
              {currency === "LKR" ? lkr(initialPaid) : `USD ${initialPaid.toLocaleString()}`} paid ·{" "}
              {currency === "LKR"
                ? lkr(Math.max(0, total - initialPaid))
                : `USD ${Math.max(0, total - initialPaid).toLocaleString()}`}{" "}
              balance
            </div>
          </div>
          <Button
            type="submit"
            disabled={busy || !room || !nights || rate <= 0 || !validInitialPayment}
          >
            {busy ? "Saving…" : "Create and reserve"}
          </Button>
        </div>
        <div className="sm:col-span-2">
          <Button asChild type="button" variant="link">
            <Link to="/staff/calendar">View room calendar</Link>
          </Button>
        </div>
      </form>
    </div>
  );
}
