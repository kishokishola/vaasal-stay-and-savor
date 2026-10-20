import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  setDoc,
  updateDoc,
  where,
  type DocumentData,
  type Unsubscribe,
} from "firebase/firestore";
import { signInAnonymously } from "firebase/auth";
import type { Tables } from "@/integrations/supabase/types";
import { auth, db, requireFirebaseConfig } from "@/integrations/firebase/client";
import { hotelToday } from "@/lib/dates";

export type Room = Tables<"rooms">;
export type MenuItem = Tables<"menu_items"> & {
  deleted?: boolean;
  image_url?: string;
};
export type Booking = Tables<"bookings"> & { room_code: string; room_name: string };
export type Order = Omit<Tables<"orders">, "created_at"> & {
  created_at: string;
  order_items: Tables<"order_items">[];
  customer_name?: string;
  customer_phone?: string;
  payment_status?: "paid" | "unpaid";
  tax?: number;
};
export type StaffMember = {
  role_id: string;
  user_id: string;
  email: string;
  role: "admin" | "cashier";
};
export type CustomerOrderRequest = {
  id: string;
  customer_name: string;
  customer_phone: string;
  order_type: "dine_in" | "takeaway" | "room";
  order_reference: string | null;
  items_summary: string;
  subtotal_estimate: number;
  notes: string | null;
  status: "pending" | "confirmed" | "in_prep" | "ready" | "completed" | "cancelled";
  created_at: string;
  updated_at?: string;
};
type Role = "admin" | "cashier";

const coll = (name: string) => collection(db, name);
const refFor = (name: string, id: string) => doc(db, name, id);
const withId = <T extends DocumentData>(id: string, data: T) =>
  ({ ...data, id }) as T & { id: string };
const normalizedEmail = (email: string) => email.trim().toLowerCase();

function dateRange(checkIn: string, checkOut: string) {
  const dates: string[] = [];
  const cursor = new Date(`${checkIn}T00:00:00.000Z`);
  const end = new Date(`${checkOut}T00:00:00.000Z`);
  while (cursor < end && dates.length < 30) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  if (!dates.length || cursor < end)
    throw new Error("Booking dates must be between 1 and 30 nights.");
  return dates;
}

export async function getRooms(activeOnly = false) {
  requireFirebaseConfig();
  const result = await getDocs(coll("rooms"));
  return result.docs
    .map((item) => withId<Room>(item.id, item.data() as Room))
    .filter((room) => !activeOnly || room.active)
    .sort((a, b) => a.code.localeCompare(b.code));
}

export async function saveRoom(room: Room) {
  requireFirebaseConfig();
  if (!room.code.trim() || !room.name.trim()) throw new Error("Room number and name are required.");
  if (Number(room.price) <= 0 || Number(room.capacity) < 1)
    throw new Error("Room price and capacity must be positive.");
  const { id, ...data } = room;
  const duplicates = await getDocs(query(coll("rooms"), where("code", "==", room.code.trim())));
  if (duplicates.docs.some((existing) => existing.id !== id))
    throw new Error("That room number is already in use.");
  if (id) await setDoc(refFor("rooms", id), data);
  else await setDoc(doc(coll("rooms")), { ...data, created_at: new Date().toISOString() });
}

export async function deleteRoom(id: string) {
  requireFirebaseConfig();
  const bookings = await getDocs(query(coll("bookings"), where("room_id", "==", id)));
  if (!bookings.empty)
    throw new Error("This room has booking records and cannot be deleted. Hide it instead.");
  await deleteDoc(refFor("rooms", id));
}

export async function getRoomByCode(code: string) {
  requireFirebaseConfig();
  const rooms = await getDocs(query(coll("rooms"), where("code", "==", code)));
  const roomDoc = rooms.docs.find((item) => item.data()["active"] === true);
  return roomDoc ? withId<Room>(roomDoc.id, roomDoc.data() as Room) : null;
}

export async function getBookedRanges(roomId: string) {
  requireFirebaseConfig();
  const today = hotelToday();
  const result = await getDocs(query(coll("room_night_locks"), where("room_id", "==", roomId)));
  return result.docs
    .map((item) => item.data()["date"] as string)
    .filter((date) => date >= today)
    .sort()
    .map((date) => {
      const next = new Date(`${date}T00:00:00.000Z`);
      next.setUTCDate(next.getUTCDate() + 1);
      return { check_in: date, check_out: next.toISOString().slice(0, 10) };
    });
}

export async function getReservedRoomIds(date: string) {
  requireFirebaseConfig();
  const result = await getDocs(query(coll("room_night_locks"), where("date", "==", date)));
  return [...new Set(result.docs.map((item) => item.data()["room_id"] as string))];
}

type ChangeListener = (onChange: () => void, onError: (error: Error) => void) => Unsubscribe;

function subscribeToCollection(
  name: string,
  onChange: () => void,
  onError: (error: Error) => void,
) {
  requireFirebaseConfig();
  let isInitialSnapshot = true;
  return onSnapshot(
    coll(name),
    () => {
      if (isInitialSnapshot) {
        isInitialSnapshot = false;
        return;
      }
      onChange();
    },
    onError,
  );
}

export const subscribeToRooms: ChangeListener = (onChange, onError) =>
  subscribeToCollection("rooms", onChange, onError);
export const subscribeToMenuItems: ChangeListener = (onChange, onError) =>
  subscribeToCollection("menu_items", onChange, onError);
export const subscribeToBookings: ChangeListener = (onChange, onError) =>
  subscribeToCollection("bookings", onChange, onError);
export const subscribeToOrders: ChangeListener = (onChange, onError) =>
  subscribeToCollection("orders", onChange, onError);
export const subscribeToCustomerOrderRequests: ChangeListener = (onChange, onError) =>
  subscribeToCollection("customer_order_requests", onChange, onError);

export function subscribeToRoomLocks(
  roomId: string,
  onChange: () => void,
  onError: (error: Error) => void,
) {
  requireFirebaseConfig();
  let isInitialSnapshot = true;
  return onSnapshot(
    query(coll("room_night_locks"), where("room_id", "==", roomId)),
    () => {
      if (isInitialSnapshot) {
        isInitialSnapshot = false;
        return;
      }
      onChange();
    },
    onError,
  );
}

export function subscribeToDateLocks(
  date: string,
  onChange: () => void,
  onError: (error: Error) => void,
) {
  requireFirebaseConfig();
  let isInitialSnapshot = true;
  return onSnapshot(
    query(coll("room_night_locks"), where("date", "==", date)),
    () => {
      if (isInitialSnapshot) {
        isInitialSnapshot = false;
        return;
      }
      onChange();
    },
    onError,
  );
}

export async function createBooking(input: {
  room: Room;
  guest_name: string;
  guest_email: string;
  guest_phone: string;
  check_in: string;
  check_out: string;
  guests: number;
  notes: string | null;
}) {
  requireFirebaseConfig();
  const nights = dateRange(input.check_in, input.check_out);
  if (input.guests < 1 || input.guests > input.room.capacity)
    throw new Error("Guest count exceeds room capacity.");
  const bookingRef = doc(coll("bookings"));
  const matchingRooms = await getDocs(query(coll("rooms"), where("code", "==", input.room.code)));
  const roomReference = matchingRooms.docs.find((room) => room.data()["active"] === true)?.ref;
  if (!roomReference && matchingRooms.empty)
    throw new Error("This room is not set up for online booking yet. Please contact the hotel.");
  if (!roomReference) throw new Error("This room is no longer available.");
  await runTransaction(db, async (transaction) => {
    const roomSnapshot = await transaction.get(roomReference);
    if (!roomSnapshot.exists() || roomSnapshot.data()["active"] !== true)
      throw new Error("This room is no longer available.");
    const locks = await Promise.all(
      nights.map((date) =>
        transaction.get(refFor("room_night_locks", `${roomSnapshot.id}_${date}`)),
      ),
    );
    if (locks.some((lock) => lock.exists())) throw new Error("Those dates are already booked.");
    const room = roomSnapshot.data() as Room;
    transaction.set(bookingRef, {
      room_id: roomSnapshot.id,
      guest_name: input.guest_name.trim(),
      guest_email: input.guest_email.trim(),
      guest_phone: input.guest_phone.trim(),
      check_in: input.check_in,
      check_out: input.check_out,
      guests: input.guests,
      notes: input.notes,
      total: Number(room.price) * nights.length,
      status: "pending",
      created_at: new Date().toISOString(),
    });
  });
}

export async function getMenuItems(availableOnly = false) {
  requireFirebaseConfig();
  const result = await getDocs(coll("menu_items"));
  return result.docs
    .map((item) => withId<MenuItem>(item.id, item.data() as MenuItem))
    .filter((item) => !availableOnly || item.available)
    .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
}

export async function addMenuItem(input: {
  name: string;
  category: string;
  price: number;
  description: string;
  image_url?: string;
}) {
  requireFirebaseConfig();
  if (!input.name.trim() || !input.category.trim())
    throw new Error("Food name and category are required.");
  if (!Number.isFinite(input.price) || input.price <= 0)
    throw new Error("Food price must be greater than zero.");
  const item = doc(coll("menu_items"));
  await setDoc(item, {
    ...input,
    name: input.name.trim(),
    category: input.category.trim(),
    description: input.description.trim(),
    available: true,
    deleted: false,
    created_at: new Date().toISOString(),
  });
}

export async function seedMenuItems(items: MenuItem[]) {
  requireFirebaseConfig();
  const existing = await getDocs(coll("menu_items"));
  if (!existing.empty || !items.length) return;
  await Promise.all(
    items.map(({ id, ...item }) => setDoc(refFor("menu_items", id), { ...item, deleted: false })),
  );
}

export async function updateMenuItem(id: string, changes: Partial<MenuItem>) {
  requireFirebaseConfig();
  if (
    changes.price !== undefined &&
    (!Number.isFinite(Number(changes.price)) || changes.price <= 0)
  )
    throw new Error("Food price must be greater than zero.");
  if (changes.name !== undefined && !changes.name.trim()) throw new Error("Food name is required.");
  if (changes.category !== undefined && !changes.category.trim())
    throw new Error("Food category is required.");
  await updateDoc(refFor("menu_items", id), changes);
}

export async function deleteMenuItem(id: string) {
  requireFirebaseConfig();
  await updateDoc(refFor("menu_items", id), { available: false, deleted: true });
}

export async function placeOrder(input: {
  order_type: string;
  table_no: string | null;
  room_code: string | null;
  customer_name?: string;
  customer_phone?: string;
  subtotal: number;
  discount: number;
  service_charge: number;
  tax?: number;
  total: number;
  payment_method: string;
  payment_status?: "paid" | "unpaid";
  status: string;
  items: { menu_item_id: string; name: string; price: number; qty: number }[];
}) {
  requireFirebaseConfig();
  const order = doc(coll("orders"));
  const counter = refFor("counters", "orders");
  let orderNo = 0;
  await runTransaction(db, async (transaction) => {
    const current = await transaction.get(counter);
    orderNo = (current.data()?.["value"] ?? 0) + 1;
    transaction.set(counter, { value: orderNo });
    transaction.set(order, {
      order_no: orderNo,
      order_type: input.order_type,
      table_no: input.table_no,
      room_code: input.room_code,
      customer_name: input.customer_name?.trim() ?? "",
      customer_phone: input.customer_phone?.trim() ?? "",
      subtotal: input.subtotal,
      discount: input.discount,
      service_charge: input.service_charge,
      tax: input.tax ?? 0,
      total: input.total,
      payment_method: input.payment_method,
      payment_status: input.payment_status ?? "paid",
      status: input.status,
      cashier_id: auth.currentUser?.uid ?? null,
      created_at: new Date().toISOString(),
      order_items: input.items.map((item) => ({
        ...item,
        id: crypto.randomUUID(),
        order_id: order.id,
      })),
    });
  });
  return { id: order.id, order_no: orderNo };
}

export async function createCustomerOrderRequest(input: {
  customer_name: string;
  customer_phone: string;
  order_type: CustomerOrderRequest["order_type"];
  order_reference: string | null;
  items_summary: string;
  subtotal_estimate: number;
  notes: string | null;
}) {
  requireFirebaseConfig();
  if (!input.customer_name.trim() || !input.customer_phone.trim())
    throw new Error("Enter your name and phone number.");
  if (!["dine_in", "takeaway", "room"].includes(input.order_type))
    throw new Error("Choose a valid order type.");
  if (!input.items_summary.trim() || input.items_summary.length > 4000)
    throw new Error("Your order contains too many items.");
  if (!Number.isFinite(input.subtotal_estimate) || input.subtotal_estimate < 0)
    throw new Error("The order subtotal is invalid.");
  if (!auth.currentUser) await signInAnonymously(auth);
  const request = doc(coll("customer_order_requests"));
  await setDoc(request, {
    ...input,
    customer_name: input.customer_name.trim(),
    customer_phone: input.customer_phone.trim(),
    status: "pending",
    created_at: new Date().toISOString(),
  });
  return request.id;
}

export async function getCustomerOrderRequests() {
  requireFirebaseConfig();
  const result = await getDocs(
    query(coll("customer_order_requests"), orderBy("created_at", "desc")),
  );
  return result.docs.map((item) =>
    withId<CustomerOrderRequest>(item.id, item.data() as CustomerOrderRequest),
  );
}

export async function updateCustomerOrderRequestStatus(id: string, status: string) {
  requireFirebaseConfig();
  if (!["pending", "confirmed", "in_prep", "ready", "completed", "cancelled"].includes(status))
    throw new Error("Choose a valid customer order status.");
  await updateDoc(refFor("customer_order_requests", id), {
    status,
    updated_at: new Date().toISOString(),
  });
}

export async function updateOrderStatus(id: string, status: string) {
  requireFirebaseConfig();
  if (!["placed", "in_prep", "ready", "delivered", "cancelled"].includes(status))
    throw new Error("Choose a valid order status.");
  await updateDoc(refFor("orders", id), { status, updated_at: new Date().toISOString() });
}

export async function getOrders() {
  requireFirebaseConfig();
  const result = await getDocs(query(coll("orders"), orderBy("created_at", "desc")));
  return result.docs.map((item) => withId<Order>(item.id, item.data() as Order));
}

export async function getBookings(status?: string) {
  requireFirebaseConfig();
  const result = await getDocs(query(coll("bookings"), orderBy("check_in", "desc")));
  const bookings = await Promise.all(
    result.docs.map(async (item) => {
      const booking = item.data() as Tables<"bookings">;
      const roomSnapshot = await getDoc(refFor("rooms", booking.room_id));
      const room = roomSnapshot.exists() ? (roomSnapshot.data() as Room) : undefined;
      return {
        ...booking,
        id: item.id,
        room_code: room?.code ?? "—",
        room_name: room?.name ?? "Room unavailable",
      };
    }),
  );
  return status ? bookings.filter((booking) => booking.status === status) : bookings;
}

export async function updateBookingStatus(id: string, status: string) {
  requireFirebaseConfig();
  const bookingRef = refFor("bookings", id);
  await runTransaction(db, async (transaction) => {
    const bookingSnapshot = await transaction.get(bookingRef);
    if (!bookingSnapshot.exists()) throw new Error("Booking no longer exists.");
    const booking = bookingSnapshot.data() as Tables<"bookings">;
    const nights = dateRange(booking.check_in, booking.check_out);
    const lockRefs = nights.map((date) => refFor("room_night_locks", `${booking.room_id}_${date}`));
    const locks = await Promise.all(lockRefs.map((lock) => transaction.get(lock)));
    if (status === "confirmed") {
      const roomSnapshot = await transaction.get(refFor("rooms", booking.room_id));
      if (!roomSnapshot.exists() || roomSnapshot.data()["active"] !== true)
        throw new Error("This room is no longer available.");
      if (locks.some((lock) => lock.exists() && lock.data()?.["booking_id"] !== id)) {
        throw new Error("These dates overlap another confirmed booking.");
      }
      lockRefs.forEach((lock, index) =>
        transaction.set(lock, { room_id: booking.room_id, date: nights[index], booking_id: id }),
      );
    } else if (status === "cancelled" || status === "checked_out") {
      locks.forEach((lock, index) => {
        const lockRef = lockRefs[index];
        if (lock.exists() && lock.data()?.["booking_id"] === id && lockRef) {
          transaction.delete(lockRef);
        }
      });
    }
    transaction.update(bookingRef, { status });
  });
}

export async function getStaffAccess(email: string) {
  requireFirebaseConfig();
  const normalized = normalizedEmail(email);
  const snapshot = await getDoc(refFor("staff_access", normalized));
  if (!snapshot.exists()) return null;
  const role = snapshot.data()["role"];
  return role === "admin" || role === "cashier" ? role : null;
}

export async function listStaff() {
  requireFirebaseConfig();
  const result = await getDocs(query(coll("staff_access"), orderBy("email")));
  return result.docs.flatMap((item) => {
    const { email, role } = item.data();
    if (typeof email !== "string" || (role !== "admin" && role !== "cashier")) return [];
    return [{ role_id: item.id, user_id: item.id, email, role }];
  });
}

export async function assignStaff(email: string, role: Role) {
  requireFirebaseConfig();
  const normalized = normalizedEmail(email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized))
    throw new Error("Enter a valid email address.");
  if (role !== "admin" && role !== "cashier") throw new Error("Choose a valid staff role.");
  await setDoc(refFor("staff_access", normalized), {
    email: normalized,
    role,
    updated_at: new Date().toISOString(),
  });
}

export async function removeStaff(email: string) {
  requireFirebaseConfig();
  await deleteDoc(refFor("staff_access", normalizedEmail(email)));
}
