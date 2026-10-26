import {
  collection,
  addDoc,
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
import { collectedOrderAmount, menuItemRate, paymentStatusFor, roomRate } from "@/lib/hotel";
import { parseStaffRole, type StaffRole } from "@/lib/staff-roles";

export type Room = Tables<"rooms"> & {
  created_at?: string;
  price_local?: number;
  price_foreign?: number;
  day_rate_local?: number;
  day_rate_foreign?: number;
  gallery_urls?: string[];
};
export type MenuItem = Tables<"menu_items"> & {
  deleted?: boolean;
  image_url?: string;
  price_local?: number;
  price_foreign?: number;
  price_room_local?: number;
  price_room_foreign?: number;
};
export type Booking = Tables<"bookings"> & {
  room_code: string;
  room_name: string;
  rate_currency?: "LKR" | "USD";
  rate_period?: "night" | "day";
  paid_amount?: number;
  payment_status?: "paid" | "unpaid" | "partial";
  payment_history?: { amount: number; method: string; at: string; by: string }[];
  created_by_uid?: string;
};
export type Order = Omit<Tables<"orders">, "created_at"> & {
  created_at: string;
  order_items: Tables<"order_items">[];
  customer_name?: string;
  customer_phone?: string;
  payment_status?: "paid" | "unpaid" | "partial" | "refunded";
  price_currency?: "LKR" | "USD";
  tax?: number;
  booking_id?: string | null;
  paid_amount?: number;
  cash_received?: number;
  change_returned?: number;
  order_status_updated_at?: string;
  status_note?: string;
  is_closed?: boolean;
  customer_order_request_id?: string;
  status_history?: { status: string; at: string; by: string; note?: string }[];
  payment_history?: { amount: number; method: string; at: string; by: string }[];
};
export type StaffMember = {
  role_id: string;
  user_id: string;
  email: string;
  role: StaffRole;
};
export type StaffRegistration = {
  email: string;
  uid: string;
  created_at: string;
};
export type CustomerOrderRequest = {
  id: string;
  customer_name: string;
  customer_phone: string;
  order_type: "dine_in" | "takeaway" | "room";
  order_reference: string | null;
  items_summary: string;
  subtotal_estimate: number;
  price_currency?: "LKR" | "USD";
  notes: string | null;
  status: "pending" | "confirmed" | "in_prep" | "ready" | "completed" | "cancelled";
  created_at: string;
  updated_at?: string;
  items?: { menu_item_id: string; name: string; price: number; qty: number }[];
  created_by_uid?: string;
  converted_order_id?: string;
  converted_order_no?: number;
  converted_total?: number;
};
export type PettyCashEntry = {
  id: string;
  kind: "top_up" | "expense";
  amount: number;
  reason: string;
  category: string;
  created_at: string;
  created_by: string;
};
export type CashDeposit = {
  id: string;
  deposit_date: string;
  amount: number;
  deposited_by: string;
  notes: string;
  created_at: string;
};
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

export function validateRoomPhotoPayload(imageUrl: string, galleryUrls: string[]) {
  for (const url of [imageUrl, ...galleryUrls]) {
    if (url.startsWith("data:image/") && url.length > 750_000) {
      throw new Error("A room photo is too large to save. Choose a smaller image.");
    }
  }
}

const roomPhotoPrefix = "firestore-room-photo:";

export async function getRoomPhotoUrl(url: string) {
  if (!url.startsWith(roomPhotoPrefix)) return url;
  const photo = await getDoc(refFor("room_photos", url.slice(roomPhotoPrefix.length)));
  const dataUrl: unknown = photo.exists() ? photo.data()["data_url"] : undefined;
  if (typeof dataUrl !== "string") {
    throw new Error("This room photo could not be loaded.");
  }
  return dataUrl;
}

async function persistRoomPhotos(room: Room) {
  const createdPhotoIds: string[] = [];
  async function persist(url: string) {
    if (!url.startsWith("data:image/")) return url;
    const photo = await addDoc(coll("room_photos"), {
      data_url: url,
      created_at: new Date().toISOString(),
    });
    createdPhotoIds.push(photo.id);
    return `${roomPhotoPrefix}${photo.id}`;
  }

  try {
    const image_url = await persist(room.image_url ?? "");
    const gallery_urls: string[] = [];
    for (const url of room.gallery_urls ?? []) gallery_urls.push(await persist(url));
    return { room: { ...room, image_url, gallery_urls }, createdPhotoIds };
  } catch (error) {
    await Promise.all(createdPhotoIds.map((id) => deleteDoc(refFor("room_photos", id))));
    throw error;
  }
}

export async function saveRoom(room: Room) {
  requireFirebaseConfig();
  if (!room.code.trim() || !room.name.trim()) throw new Error("Room number and name are required.");
  if (Number(room.price) <= 0 || Number(room.capacity) < 1)
    throw new Error("Room price and capacity must be positive.");
  for (const rate of [
    room.price_local,
    room.price_foreign,
    room.day_rate_local,
    room.day_rate_foreign,
  ]) {
    if (rate !== undefined && rate !== 0 && (!Number.isFinite(rate) || rate < 0))
      throw new Error("Room rates must be valid non-negative amounts.");
  }
  if (room.gallery_urls && room.gallery_urls.length > 12)
    throw new Error("Add no more than 12 room gallery image URLs.");
  validateRoomPhotoPayload(room.image_url ?? "", room.gallery_urls ?? []);
  const duplicates = await getDocs(query(coll("rooms"), where("code", "==", room.code.trim())));
  if (duplicates.docs.some((existing) => existing.id !== room.id))
    throw new Error("That room number is already in use.");
  const { room: persistedRoom, createdPhotoIds } = await persistRoomPhotos(room);
  const { id: persistedId, ...persistedData } = persistedRoom;
  try {
    if (persistedId) await setDoc(refFor("rooms", persistedId), persistedData);
    else
      await setDoc(doc(coll("rooms")), {
        ...persistedData,
        created_at: new Date().toISOString(),
      });
  } catch (error) {
    await Promise.all(createdPhotoIds.map((photoId) => deleteDoc(refFor("room_photos", photoId))));
    throw error;
  }
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
export const subscribeToStaffRegistrations: ChangeListener = (onChange, onError) =>
  subscribeToCollection("staff_signup_requests", onChange, onError);

export function subscribeToCustomerOrderRequest(
  id: string,
  onChange: (request: CustomerOrderRequest | null) => void,
  onError: (error: Error) => void,
) {
  requireFirebaseConfig();
  return onSnapshot(
    refFor("customer_order_requests", id),
    (snapshot) =>
      onChange(
        snapshot.exists()
          ? withId<CustomerOrderRequest>(snapshot.id, snapshot.data() as CustomerOrderRequest)
          : null,
      ),
    onError,
  );
}

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
  rate_currency?: "LKR" | "USD";
  rate_period?: "night" | "day";
}) {
  requireFirebaseConfig();
  const bookingOwner = auth.currentUser ?? (await signInAnonymously(auth)).user;
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
    const currency = input.rate_currency ?? "LKR";
    const period = input.rate_period ?? "night";
    const unitPrice = Number(roomRate(room, currency, period));
    if (!Number.isFinite(unitPrice) || unitPrice <= 0)
      throw new Error("This room does not have a valid price for the selected rate.");
    transaction.set(bookingRef, {
      room_id: roomSnapshot.id,
      guest_name: input.guest_name.trim(),
      guest_email: input.guest_email.trim(),
      guest_phone: input.guest_phone.trim(),
      check_in: input.check_in,
      check_out: input.check_out,
      guests: input.guests,
      notes: input.notes,
      total: unitPrice * nights.length,
      rate_currency: currency,
      rate_period: period,
      paid_amount: 0,
      payment_status: "unpaid",
      payment_history: [],
      created_by_uid: bookingOwner.uid,
      status: "pending",
      created_at: new Date().toISOString(),
    });
  });
  return bookingRef.id;
}

export function subscribeToBooking(
  id: string,
  onChange: (booking: Booking | null) => void,
  onError: (error: Error) => void,
) {
  requireFirebaseConfig();
  return onSnapshot(
    refFor("bookings", id),
    (snapshot) =>
      onChange(snapshot.exists() ? withId<Booking>(snapshot.id, snapshot.data() as Booking) : null),
    onError,
  );
}

export async function createStaffBooking(input: {
  roomId: string;
  guest_name: string;
  guest_email: string;
  guest_phone: string;
  check_in: string;
  check_out: string;
  guests: number;
  notes: string | null;
  rate_currency: "LKR" | "USD";
  rate_period: "night" | "day";
  initial_payment?: number;
  payment_method?: "cash" | "card" | "bank_transfer" | "online";
}) {
  requireFirebaseConfig();
  const nights = dateRange(input.check_in, input.check_out);
  if (!input.guest_name.trim() || !input.guest_phone.trim())
    throw new Error("Guest name and phone are required.");
  if (input.guests < 1 || !Number.isSafeInteger(input.guests))
    throw new Error("Guest count must be a positive whole number.");
  const bookingRef = doc(coll("bookings"));
  await runTransaction(db, async (transaction) => {
    const roomRef = refFor("rooms", input.roomId);
    const roomSnapshot = await transaction.get(roomRef);
    if (!roomSnapshot.exists() || roomSnapshot.data()["active"] !== true)
      throw new Error("This room is no longer available.");
    const room = roomSnapshot.data() as Room;
    if (input.guests > room.capacity) throw new Error("Guest count exceeds room capacity.");
    const locks = await Promise.all(
      nights.map((date) => transaction.get(refFor("room_night_locks", `${input.roomId}_${date}`))),
    );
    if (locks.some((lock) => lock.exists()))
      throw new Error("Those dates are already reserved for this room.");
    const unitPrice = Number(roomRate(room, input.rate_currency, input.rate_period));
    if (!Number.isFinite(unitPrice) || unitPrice <= 0)
      throw new Error("This room does not have a valid price for the selected rate.");
    const now = new Date().toISOString();
    const total = unitPrice * nights.length;
    const initialPaidCents = Math.round(Number(input.initial_payment ?? 0) * 100);
    const totalCents = Math.round(total * 100);
    if (!Number.isSafeInteger(initialPaidCents) || initialPaidCents < 0)
      throw new Error("Initial payment must be a valid non-negative amount.");
    if (initialPaidCents > totalCents)
      throw new Error("Initial payment cannot exceed the booking total.");
    const initialPaymentMethod = input.payment_method ?? "cash";
    if (
      initialPaidCents > 0 &&
      !["cash", "card", "bank_transfer", "online"].includes(initialPaymentMethod)
    )
      throw new Error("Choose a valid payment method for the initial payment.");
    const initialPaid = initialPaidCents / 100;
    transaction.set(bookingRef, {
      room_id: input.roomId,
      guest_name: input.guest_name.trim(),
      guest_email: input.guest_email.trim(),
      guest_phone: input.guest_phone.trim(),
      check_in: input.check_in,
      check_out: input.check_out,
      guests: input.guests,
      notes: input.notes?.trim() || null,
      total,
      rate_currency: input.rate_currency,
      rate_period: input.rate_period,
      paid_amount: initialPaid,
      payment_status: paymentStatusFor(total, initialPaid),
      payment_history:
        initialPaidCents > 0
          ? [
              {
                amount: initialPaid,
                method: initialPaymentMethod,
                at: now,
                by: auth.currentUser?.email ?? "staff",
              },
            ]
          : [],
      status: "confirmed",
      created_at: now,
    });
    nights.forEach((date) =>
      transaction.set(refFor("room_night_locks", `${input.roomId}_${date}`), {
        room_id: input.roomId,
        date,
        booking_id: bookingRef.id,
      }),
    );
  });
  return bookingRef.id;
}

export async function recordBookingPayment(
  id: string,
  amount: number,
  method: "cash" | "card" | "bank_transfer" | "online",
) {
  requireFirebaseConfig();
  if (!["cash", "card", "bank_transfer", "online"].includes(method))
    throw new Error("Choose a valid booking payment method.");
  if (!Number.isFinite(amount) || Math.round(amount * 100) <= 0)
    throw new Error("Enter a payment amount greater than zero.");
  const bookingRef = refFor("bookings", id);
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(bookingRef);
    if (!snapshot.exists()) throw new Error("This booking no longer exists.");
    const booking = snapshot.data() as Tables<"bookings"> & {
      paid_amount?: number;
      payment_history?: { amount: number; method: string; at: string; by: string }[];
    };
    if (booking.status === "cancelled")
      throw new Error("Cancelled bookings cannot receive payments.");
    const totalCents = Math.round(Number(booking.total) * 100);
    const paidCents = Math.round(Number(booking.paid_amount ?? 0) * 100);
    const amountCents = Math.round(amount * 100);
    if (!Number.isSafeInteger(totalCents) || totalCents < 0 || amountCents > totalCents - paidCents)
      throw new Error("Payment exceeds the valid outstanding booking balance.");
    const now = new Date().toISOString();
    const paidAmount = (paidCents + amountCents) / 100;
    transaction.update(bookingRef, {
      paid_amount: paidAmount,
      payment_status: paymentStatusFor(totalCents / 100, paidAmount),
      payment_history: [
        ...(booking.payment_history ?? []).slice(-99),
        { amount: amountCents / 100, method, at: now, by: auth.currentUser?.email ?? "staff" },
      ],
      updated_at: now,
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
  price_local: number;
  price_foreign: number;
  price_room_local: number;
  price_room_foreign: number;
  description: string;
  image_url?: string;
}) {
  requireFirebaseConfig();
  if (!input.name.trim() || !input.category.trim())
    throw new Error("Food name and category are required.");
  if (!Number.isFinite(input.price) || input.price <= 0)
    throw new Error("Food price must be greater than zero.");
  if (!Number.isFinite(input.price_local) || input.price_local <= 0)
    throw new Error("Local dining food price must be greater than zero.");
  if (!Number.isFinite(input.price_foreign) || input.price_foreign <= 0)
    throw new Error("Foreign dining food price must be greater than zero.");
  if (!Number.isFinite(input.price_room_local) || input.price_room_local <= 0)
    throw new Error("Room-service local food price must be greater than zero.");
  if (!Number.isFinite(input.price_room_foreign) || input.price_room_foreign <= 0)
    throw new Error("Room-service foreign food price must be greater than zero.");
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
  if (
    changes.price_local !== undefined &&
    (!Number.isFinite(Number(changes.price_local)) || Number(changes.price_local) <= 0)
  )
    throw new Error("Local food price must be greater than zero.");
  if (
    changes.price_foreign !== undefined &&
    (!Number.isFinite(Number(changes.price_foreign)) || Number(changes.price_foreign) <= 0)
  )
    throw new Error("Foreign food price must be greater than zero.");
  if (
    changes.price_room_local !== undefined &&
    (!Number.isFinite(Number(changes.price_room_local)) || Number(changes.price_room_local) <= 0)
  )
    throw new Error("Room-service local food price must be greater than zero.");
  if (
    changes.price_room_foreign !== undefined &&
    (!Number.isFinite(Number(changes.price_room_foreign)) ||
      Number(changes.price_room_foreign) <= 0)
  )
    throw new Error("Room-service foreign food price must be greater than zero.");
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
  order_type: "dine_in" | "takeaway" | "room";
  table_no: string | null;
  room_code: string | null;
  booking_id?: string | null;
  customer_name?: string;
  customer_phone?: string;
  discount_pct: number;
  service_pct: number;
  tax_pct: number;
  price_currency?: "LKR" | "USD";
  payment_method: string;
  payment_status?: "paid" | "unpaid" | "partial";
  paid_amount?: number;
  cash_received?: number;
  status: "placed";
  items: { menu_item_id: string; qty: number }[];
}) {
  requireFirebaseConfig();
  if (
    !input.items.length ||
    input.items.length > 30 ||
    input.items.some(
      (item) => !item.menu_item_id || !Number.isSafeInteger(item.qty) || item.qty < 1,
    )
  )
    throw new Error("Add valid menu items before completing the order.");
  if (!["cash", "card", "online", "room_bill", "no_pay"].includes(input.payment_method))
    throw new Error("Choose a valid payment method.");
  const priceCurrency = input.price_currency ?? "LKR";
  if (input.payment_method === "room_bill" && input.order_type !== "room")
    throw new Error("Room charges are only available for room-service orders.");
  if (input.order_type === "room" && (!input.room_code || !input.booking_id))
    throw new Error("Choose an active room booking before placing a room-service order.");
  const order = doc(coll("orders"));
  const counter = refFor("counters", "orders");
  const menuRefs = input.items.map((item) => refFor("menu_items", item.menu_item_id));
  let orderNo = 0;
  let finalTotals = { subtotal: 0, discount: 0, service_charge: 0, tax: 0, total: 0 };
  let finalPayment = { payment_status: "unpaid" as "paid" | "unpaid" | "partial", paid_amount: 0 };
  let finalItems: {
    menu_item_id: string;
    name: string;
    price: number;
    qty: number;
    id: string;
    order_id: string;
  }[] = [];
  await runTransaction(db, async (transaction) => {
    const [current, ...menuSnapshots] = await Promise.all([
      transaction.get(counter),
      ...menuRefs.map((menuRef) => transaction.get(menuRef)),
    ]);
    if (input.order_type === "room" && input.booking_id) {
      const bookingSnapshot = await transaction.get(refFor("bookings", input.booking_id));
      if (
        !bookingSnapshot.exists() ||
        bookingSnapshot.data()["status"] !== "checked_in" ||
        typeof bookingSnapshot.data()["room_id"] !== "string"
      )
        throw new Error("The guest is no longer checked in to that room.");
      const roomSnapshot = await transaction.get(
        refFor("rooms", bookingSnapshot.data()["room_id"] as string),
      );
      if (
        !roomSnapshot.exists() ||
        roomSnapshot.data()["active"] !== true ||
        roomSnapshot.data()["code"] !== input.room_code
      )
        throw new Error("The guest is no longer checked in to that room.");
    }
    const items = input.items.map((item, index) => {
      const snapshot = menuSnapshots[index];
      if (
        !snapshot?.exists() ||
        snapshot.data()["available"] !== true ||
        snapshot.data()["deleted"]
      )
        throw new Error("A menu item is no longer available. Refresh the menu and try again.");
      const data = snapshot.data();
      if (
        typeof data["name"] !== "string" ||
        !Number.isFinite(menuItemRate(data as MenuItem, priceCurrency, input.order_type)) ||
        menuItemRate(data as MenuItem, priceCurrency, input.order_type) <= 0
      )
        throw new Error("A menu item has invalid pricing. Update the menu before ordering.");
      return {
        menu_item_id: snapshot.id,
        name: data["name"] as string,
        price: menuItemRate(data as MenuItem, priceCurrency, input.order_type),
        qty: item.qty,
        id: crypto.randomUUID(),
        order_id: order.id,
      };
    });
    const subtotal = items.reduce((sum, item) => sum + item.price * item.qty, 0);
    if (!Number.isFinite(subtotal) || subtotal > 99_999_999.99)
      throw new Error("The order exceeds the maximum billable amount.");
    if (
      !Number.isFinite(input.discount_pct) ||
      input.discount_pct < 0 ||
      input.discount_pct > 100 ||
      !Number.isFinite(input.service_pct) ||
      input.service_pct < 0 ||
      input.service_pct > 100 ||
      !Number.isFinite(input.tax_pct) ||
      input.tax_pct < 0 ||
      input.tax_pct > 100
    )
      throw new Error("The order totals are invalid.");
    const discount = Math.round(subtotal * input.discount_pct) / 100;
    const base = Math.max(0, subtotal - discount);
    const serviceCharge = Math.round(base * input.service_pct) / 100;
    const tax = Math.round(base * input.tax_pct) / 100;
    const total = base + serviceCharge + tax;
    const paidAmount = Math.min(
      total,
      Math.max(
        0,
        input.payment_method === "room_bill" || input.payment_method === "no_pay"
          ? 0
          : (input.paid_amount ?? (input.payment_status === "unpaid" ? 0 : total)),
      ),
    );
    if (!Number.isFinite(total) || !Number.isFinite(paidAmount))
      throw new Error("The order total is invalid.");
    const paymentStatus = paymentStatusFor(total, paidAmount);
    const cashReceived = input.payment_method === "cash" ? (input.cash_received ?? 0) : 0;
    if (
      !Number.isFinite(cashReceived) ||
      cashReceived < 0 ||
      (input.payment_method === "cash" && cashReceived < paidAmount)
    )
      throw new Error("Cash received must cover the amount paid.");
    const changeReturned = input.payment_method === "cash" ? cashReceived - paidAmount : 0;
    const now = new Date().toISOString();
    const actor = auth.currentUser?.email ?? auth.currentUser?.uid ?? "staff";
    finalItems = items;
    finalTotals = { subtotal, discount, service_charge: serviceCharge, tax, total };
    finalPayment = { payment_status: paymentStatus, paid_amount: paidAmount };
    orderNo = (current.data()?.["value"] ?? 0) + 1;
    transaction.set(counter, { value: orderNo });
    transaction.set(order, {
      order_no: orderNo,
      order_type: input.order_type,
      table_no: input.table_no,
      room_code: input.room_code,
      booking_id: input.booking_id ?? null,
      customer_name: input.customer_name?.trim() ?? "",
      customer_phone: input.customer_phone?.trim() ?? "",
      subtotal,
      discount,
      service_charge: serviceCharge,
      tax,
      total,
      payment_method: input.payment_method,
      price_currency: priceCurrency,
      payment_status: paymentStatus,
      paid_amount: paidAmount,
      cash_received: cashReceived,
      change_returned: changeReturned,
      status: input.status,
      cashier_id: auth.currentUser?.uid ?? null,
      created_at: now,
      order_status_updated_at: now,
      status_note: "",
      is_closed: false,
      status_history: [{ status: input.status, at: now, by: actor, note: "Order created" }],
      payment_history:
        paidAmount > 0
          ? [{ amount: paidAmount, method: input.payment_method, at: now, by: actor }]
          : [],
      order_items: items,
    });
  });
  return { id: order.id, order_no: orderNo, ...finalTotals, ...finalPayment, items: finalItems };
}

export async function createCustomerOrderRequest(input: {
  customer_name: string;
  customer_phone: string;
  order_type: CustomerOrderRequest["order_type"];
  order_reference: string | null;
  items_summary: string;
  items: { menu_item_id: string; name: string; price: number; qty: number }[];
  subtotal_estimate: number;
  price_currency?: "LKR" | "USD";
  notes: string | null;
}) {
  requireFirebaseConfig();
  if (!input.customer_name.trim() || !input.customer_phone.trim())
    throw new Error("Enter your name and phone number.");
  if (!["dine_in", "takeaway", "room"].includes(input.order_type))
    throw new Error("Choose a valid order type.");
  const priceCurrency = input.price_currency ?? "LKR";
  if (!input.items_summary.trim() || input.items_summary.length > 4000)
    throw new Error("Your order contains too many items.");
  if (
    !input.items.length ||
    input.items.length > 30 ||
    input.items.some(
      (item) =>
        !item.menu_item_id ||
        !Number.isSafeInteger(item.qty) ||
        item.qty < 1 ||
        !Number.isFinite(item.price) ||
        item.price <= 0,
    )
  )
    throw new Error("The order contains invalid menu items.");
  if (
    !Number.isFinite(input.subtotal_estimate) ||
    input.subtotal_estimate < 0 ||
    input.subtotal_estimate > 10_000_000
  )
    throw new Error("The order subtotal is invalid.");
  const customerUser = auth.currentUser ?? (await signInAnonymously(auth)).user;
  if (!customerUser) throw new Error("Could not establish a secure order-tracking session.");
  const request = doc(coll("customer_order_requests"));
  await setDoc(request, {
    ...input,
    price_currency: priceCurrency,
    customer_name: input.customer_name.trim(),
    customer_phone: input.customer_phone.trim(),
    status: "pending",
    created_by_uid: customerUser.uid,
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

export async function convertCustomerOrderRequestToOrder(id: string) {
  requireFirebaseConfig();
  const requestRef = refFor("customer_order_requests", id);
  const counterRef = refFor("counters", "orders");
  const orderRef = doc(coll("orders"));
  const requestInitial = await getDoc(requestRef);
  if (!requestInitial.exists()) throw new Error("This customer request no longer exists.");
  const initialData = requestInitial.data() as CustomerOrderRequest;
  if (initialData.converted_order_id)
    return { id: initialData.converted_order_id, order_no: initialData.converted_order_no ?? 0 };
  let checkedInBookingId: string | null = null;
  let checkedInRoomId: string | null = null;
  if (initialData.order_type === "room") {
    if (!initialData.order_reference)
      throw new Error("Choose a room number for this room-service request before accepting it.");
    const rooms = await getDocs(
      query(coll("rooms"), where("code", "==", initialData.order_reference)),
    );
    const room = rooms.docs.find((item) => item.data()["active"] === true);
    if (!room) throw new Error("The requested room is not available for room service.");
    const bookings = await getDocs(coll("bookings"));
    const checkedInBooking = bookings.docs.find(
      (item) => item.data()["room_id"] === room.id && item.data()["status"] === "checked_in",
    );
    if (!checkedInBooking) throw new Error("No checked-in guest is assigned to that room.");
    checkedInBookingId = checkedInBooking.id;
    checkedInRoomId = room.id;
  }
  let orderNo = 0;
  let finalOrderId = orderRef.id;
  await runTransaction(db, async (transaction) => {
    const requestSnapshot = await transaction.get(requestRef);
    if (!requestSnapshot.exists()) throw new Error("This customer request no longer exists.");
    const request = requestSnapshot.data() as CustomerOrderRequest;
    if (request.converted_order_id) {
      finalOrderId = request.converted_order_id;
      orderNo = request.converted_order_no ?? 0;
      return;
    }
    if (request.status === "cancelled") throw new Error("This customer request was cancelled.");
    if (!request.items?.length || request.items.length > 30)
      throw new Error("This request has no valid itemized menu data.");
    const [counterSnapshot, ...menuSnapshots] = await Promise.all([
      transaction.get(counterRef),
      ...request.items.map((item) => transaction.get(refFor("menu_items", item.menu_item_id))),
    ]);
    if (checkedInBookingId && checkedInRoomId) {
      const [bookingSnapshot, roomSnapshot] = await Promise.all([
        transaction.get(refFor("bookings", checkedInBookingId)),
        transaction.get(refFor("rooms", checkedInRoomId)),
      ]);
      if (
        !bookingSnapshot.exists() ||
        bookingSnapshot.data()["status"] !== "checked_in" ||
        bookingSnapshot.data()["room_id"] !== checkedInRoomId ||
        !roomSnapshot.exists() ||
        roomSnapshot.data()["active"] !== true ||
        roomSnapshot.data()["code"] !== request.order_reference
      )
        throw new Error("The guest is no longer checked in to that room.");
    }
    const orderItems = request.items.map((item, index) => {
      if (typeof item.menu_item_id !== "string" || !Number.isSafeInteger(item.qty) || item.qty < 1)
        throw new Error("This request contains invalid item quantities.");
      const menuSnapshot = menuSnapshots[index];
      if (
        !menuSnapshot?.exists() ||
        menuSnapshot.data()["available"] !== true ||
        menuSnapshot.data()["deleted"]
      )
        throw new Error("A requested item is no longer available. Contact the customer.");
      const menu = menuSnapshot.data();
      const currency = request.price_currency ?? "LKR";
      const currentPrice = menuItemRate(menu as MenuItem, currency, request.order_type);
      if (typeof menu["name"] !== "string" || !Number.isFinite(currentPrice) || currentPrice <= 0)
        throw new Error("A requested menu item has invalid pricing. Contact the customer.");
      if (Math.round(currentPrice * 100) !== Math.round(Number(item.price) * 100))
        throw new Error(
          "A menu price changed after this request. Ask the customer to submit it again.",
        );
      return {
        menu_item_id: menuSnapshot.id,
        name: menu["name"] as string,
        price: currentPrice,
        qty: item.qty,
        id: crypto.randomUUID(),
        order_id: orderRef.id,
      };
    });
    const subtotal = orderItems.reduce((sum, item) => sum + item.price * item.qty, 0);
    if (!Number.isFinite(subtotal) || subtotal > 99_999_999.99)
      throw new Error("The order exceeds the maximum billable amount.");
    const now = new Date().toISOString();
    const actor = auth.currentUser?.email ?? auth.currentUser?.uid ?? "staff";
    orderNo = (counterSnapshot.data()?.["value"] ?? 0) + 1;
    transaction.set(counterRef, { value: orderNo });
    transaction.set(orderRef, {
      order_no: orderNo,
      order_type: request.order_type,
      table_no: request.order_type === "dine_in" ? request.order_reference : null,
      room_code: request.order_type === "room" ? request.order_reference : null,
      booking_id: checkedInBookingId,
      customer_name: request.customer_name,
      customer_phone: request.customer_phone,
      subtotal,
      discount: 0,
      service_charge: 0,
      tax: 0,
      total: subtotal,
      payment_method: "cash",
      price_currency: request.price_currency ?? "LKR",
      payment_status: "unpaid",
      paid_amount: 0,
      cash_received: 0,
      change_returned: 0,
      status: "placed",
      cashier_id: auth.currentUser?.uid ?? null,
      customer_order_request_id: id,
      created_at: now,
      order_status_updated_at: now,
      status_note: request.notes ?? "",
      is_closed: false,
      status_history: [{ status: "placed", at: now, by: actor, note: "Accepted website order" }],
      payment_history: [],
      order_items: orderItems,
    });
    transaction.update(requestRef, {
      status: "confirmed",
      converted_order_id: orderRef.id,
      converted_order_no: orderNo,
      converted_total: subtotal,
      updated_at: now,
    });
  });
  return { id: finalOrderId, order_no: orderNo };
}

export async function updateOrderStatus(id: string, status: string, note = "") {
  requireFirebaseConfig();
  if (!["placed", "in_prep", "ready", "delivered", "cancelled"].includes(status))
    throw new Error("Choose a valid order status.");
  const orderRef = refFor("orders", id);
  await runTransaction(db, async (transaction) => {
    const orderSnapshot = await transaction.get(orderRef);
    if (!orderSnapshot.exists()) throw new Error("This order no longer exists.");
    const order = orderSnapshot.data() as Order;
    const requestRef = order.customer_order_request_id
      ? refFor("customer_order_requests", order.customer_order_request_id)
      : null;
    const requestSnapshot = requestRef ? await transaction.get(requestRef) : null;
    if (order.status === "cancelled" && status !== "cancelled")
      throw new Error("Cancelled orders cannot be reopened.");
    const now = new Date().toISOString();
    const actor = auth.currentUser?.email ?? auth.currentUser?.uid ?? "staff";
    const history = (order.status_history ?? []).slice(-99);
    const collected = collectedOrderAmount(order);
    transaction.update(orderRef, {
      status,
      status_note: note.trim(),
      order_status_updated_at: now,
      updated_at: now,
      status_history: [...history, { status, at: now, by: actor, note: note.trim() }],
      ...(status === "cancelled" && collected > 0
        ? { payment_status: "refunded", refunded_amount: collected }
        : {}),
    });
    if (requestRef && requestSnapshot?.exists()) {
      const requestStatus =
        status === "placed"
          ? "confirmed"
          : status === "delivered"
            ? "completed"
            : status === "cancelled"
              ? "cancelled"
              : status;
      transaction.update(requestRef, { status: requestStatus, updated_at: now });
    }
  });
}

export async function recordOrderPayment(
  id: string,
  amount: number,
  method: "cash" | "card" | "online",
) {
  requireFirebaseConfig();
  if (method !== "cash" && method !== "card" && method !== "online")
    throw new Error("Choose a valid payment method.");
  if (!Number.isFinite(amount) || amount <= 0)
    throw new Error("Enter a payment amount greater than zero.");
  const orderRef = refFor("orders", id);
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(orderRef);
    if (!snapshot.exists()) throw new Error("This order no longer exists.");
    const order = snapshot.data() as Order;
    if (order.status === "cancelled") throw new Error("Cancelled orders cannot receive payments.");
    const totalCents = Math.round(Number(order.total) * 100);
    const paidCents = Math.round(collectedOrderAmount(order) * 100);
    const amountCents = Math.round(amount * 100);
    if (!Number.isSafeInteger(totalCents) || totalCents < 0)
      throw new Error("This order has an invalid total and cannot receive payments.");
    if (!Number.isSafeInteger(amountCents) || amountCents <= 0)
      throw new Error("Enter a payment of at least LKR 0.01.");
    if (amountCents > totalCents - paidCents)
      throw new Error("Payment cannot exceed the outstanding balance.");
    const now = new Date().toISOString();
    const actor = auth.currentUser?.email ?? auth.currentUser?.uid ?? "staff";
    const nextPaid = (paidCents + amountCents) / 100;
    transaction.update(orderRef, {
      paid_amount: nextPaid,
      payment_status: paymentStatusFor(totalCents / 100, nextPaid),
      payment_method: order.payment_method === method ? method : "split",
      payment_history: [
        ...(order.payment_history ?? []).slice(-99),
        { amount: amountCents / 100, method, at: now, by: actor },
      ],
      updated_at: now,
    });
  });
}

export async function closeKitchenOrder(id: string) {
  requireFirebaseConfig();
  await updateDoc(refFor("orders", id), {
    is_closed: true,
    updated_at: new Date().toISOString(),
  });
}

export async function getOrders() {
  requireFirebaseConfig();
  const result = await getDocs(query(coll("orders"), orderBy("created_at", "desc")));
  return result.docs.map((item) => withId<Order>(item.id, item.data() as Order));
}

export async function getPettyCash() {
  requireFirebaseConfig();
  const [account, entries] = await Promise.all([
    getDoc(refFor("petty_cash_accounts", "current")),
    getDocs(query(coll("petty_cash_entries"), orderBy("created_at", "desc"))),
  ]);
  return {
    balance: Number(account.data()?.["balance"] ?? 0),
    entries: entries.docs.map((item) =>
      withId<PettyCashEntry>(item.id, item.data() as PettyCashEntry),
    ),
  };
}

export const subscribeToPettyCash: ChangeListener = (onChange, onError) => {
  requireFirebaseConfig();
  let accountInitial = true;
  let entriesInitial = true;
  const stopAccount = onSnapshot(
    refFor("petty_cash_accounts", "current"),
    () => {
      if (accountInitial) accountInitial = false;
      else onChange();
    },
    onError,
  );
  const stopEntries = onSnapshot(
    coll("petty_cash_entries"),
    () => {
      if (entriesInitial) entriesInitial = false;
      else onChange();
    },
    onError,
  );
  return () => {
    stopAccount();
    stopEntries();
  };
};

export async function getCashDeposits(): Promise<CashDeposit[]> {
  requireFirebaseConfig();
  const result = await getDocs(query(coll("cash_deposits"), orderBy("deposit_date", "desc")));
  return result.docs.map((item) => withId<CashDeposit>(item.id, item.data() as CashDeposit));
}

export const subscribeToCashDeposits: ChangeListener = (onChange, onError) =>
  subscribeToCollection("cash_deposits", onChange, onError);

export async function recordCashDeposit(input: {
  deposit_date: string;
  amount: number;
  notes: string;
}) {
  requireFirebaseConfig();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.deposit_date))
    throw new Error("Choose a valid deposit date.");
  if (!Number.isFinite(input.amount) || Math.round(input.amount * 100) <= 0)
    throw new Error("Enter a deposit amount greater than zero.");
  if (input.amount > 10_000_000) throw new Error("Cash deposits cannot exceed LKR 10,000,000.");
  if (input.notes.trim().length > 255)
    throw new Error("Deposit notes must be 255 characters or fewer.");
  const actor = auth.currentUser?.email ?? auth.currentUser?.uid;
  if (!actor) throw new Error("Sign in again before recording a cash deposit.");
  await setDoc(doc(coll("cash_deposits")), {
    deposit_date: input.deposit_date,
    amount: Math.round(input.amount * 100) / 100,
    deposited_by: actor,
    notes: input.notes.trim(),
    created_at: new Date().toISOString(),
  });
}

export async function recordPettyCashTransaction(input: {
  kind: "top_up" | "expense";
  amount: number;
  reason: string;
  category: string;
}) {
  requireFirebaseConfig();
  if (!Number.isFinite(input.amount) || Math.round(input.amount * 100) <= 0)
    throw new Error("Enter an amount of at least LKR 0.01.");
  if (input.amount > 10_000_000)
    throw new Error("Petty cash transactions cannot exceed LKR 10,000,000.");
  if (!input.reason.trim() || !input.category.trim())
    throw new Error("Enter a reason and category.");
  if (input.reason.trim().length > 255 || input.category.trim().length > 50)
    throw new Error("Reason and category must stay within their field limits.");
  if (input.kind !== "top_up" && input.kind !== "expense")
    throw new Error("Choose a valid petty-cash transaction type.");
  const accountRef = refFor("petty_cash_accounts", "current");
  const entryRef = doc(coll("petty_cash_entries"));
  await runTransaction(db, async (transaction) => {
    const account = await transaction.get(accountRef);
    const balanceCents = Math.round(Number(account.data()?.["balance"] ?? 0) * 100);
    const amountCents = Math.round(input.amount * 100);
    const nextBalanceCents =
      input.kind === "top_up" ? balanceCents + amountCents : balanceCents - amountCents;
    if (nextBalanceCents < 0)
      throw new Error("Petty cash balance is not sufficient for this expense.");
    const now = new Date().toISOString();
    transaction.set(accountRef, {
      balance: nextBalanceCents / 100,
      updated_at: now,
      updated_by: auth.currentUser?.email ?? auth.currentUser?.uid ?? "staff",
    });
    transaction.set(entryRef, {
      kind: input.kind,
      amount: amountCents / 100,
      reason: input.reason.trim(),
      category: input.category.trim(),
      created_at: now,
      created_by: auth.currentUser?.email ?? auth.currentUser?.uid ?? "staff",
    });
  });
}

export async function getBookings(status?: string): Promise<Booking[]> {
  requireFirebaseConfig();
  const result = await getDocs(query(coll("bookings"), orderBy("check_in", "desc")));
  const bookings = await Promise.all(
    result.docs.map(async (item) => {
      const booking = item.data() as Booking;
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
  return parseStaffRole(snapshot.data()["role"]);
}

export async function listStaff() {
  requireFirebaseConfig();
  const result = await getDocs(query(coll("staff_access"), orderBy("email")));
  return result.docs.flatMap((item) => {
    const { email, role } = item.data();
    const parsedRole = parseStaffRole(role);
    if (typeof email !== "string" || !parsedRole) return [];
    return [{ role_id: item.id, user_id: item.id, email, role: parsedRole }];
  });
}

export async function submitStaffRegistration(email: string, uid: string) {
  requireFirebaseConfig();
  const normalized = normalizedEmail(email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized))
    throw new Error("Enter a valid email address.");
  if (!uid) throw new Error("Could not verify the Firebase account.");
  const requestRef = refFor("staff_signup_requests", normalized);
  const existingRequest = await getDoc(requestRef);
  if (existingRequest.exists()) {
    if (existingRequest.data()["uid"] === uid) return;
    throw new Error("A staff access request already exists for this email.");
  }
  await setDoc(requestRef, {
    email: normalized,
    uid,
    created_at: new Date().toISOString(),
  });
}

export async function listStaffRegistrations(): Promise<StaffRegistration[]> {
  requireFirebaseConfig();
  const result = await getDocs(query(coll("staff_signup_requests"), orderBy("created_at", "asc")));
  return result.docs.flatMap((item) => {
    const { email, uid, created_at } = item.data();
    if (
      typeof email !== "string" ||
      typeof uid !== "string" ||
      typeof created_at !== "string" ||
      item.id !== normalizedEmail(email)
    )
      return [];
    return [{ email, uid, created_at }];
  });
}

export async function approveStaffRegistration(email: string, role: StaffRole) {
  const normalized = normalizedEmail(email);
  await assignStaff(normalized, role);
  await deleteDoc(refFor("staff_signup_requests", normalized));
}

export async function dismissStaffRegistration(email: string) {
  requireFirebaseConfig();
  await deleteDoc(refFor("staff_signup_requests", normalizedEmail(email)));
}

export async function assignStaff(email: string, role: StaffRole) {
  requireFirebaseConfig();
  const normalized = normalizedEmail(email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized))
    throw new Error("Enter a valid email address.");
  if (!parseStaffRole(role)) throw new Error("Choose a valid staff role.");
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
