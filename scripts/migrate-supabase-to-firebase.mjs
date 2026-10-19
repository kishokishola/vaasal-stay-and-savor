import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { createClient } from "@supabase/supabase-js";

const requiredEnv = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "FIREBASE_PROJECT_ID"];
const missing = requiredEnv.filter((key) => !process.env[key]);
if (missing.length) throw new Error(`Missing environment variables: ${missing.join(", ")}`);

const dryRun = !process.argv.includes("--apply");
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const firebase = initializeApp({
  credential: applicationDefault(),
  projectId: process.env.FIREBASE_PROJECT_ID,
});
const firestore = getFirestore(firebase);
const auth = getAuth(firebase);

async function readAll(table) {
  const rows = [];
  for (let start = 0; ; start += 1000) {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .range(start, start + 999);
    if (error) throw new Error(`Could not read Supabase table ${table}: ${error.message}`);
    rows.push(...data);
    if (data.length < 1000) return rows;
  }
}

async function readUsers() {
  const users = [];
  for (let page = 1; ; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`Could not read Supabase Auth users: ${error.message}`);
    users.push(...data.users);
    if (data.users.length < 1000) return users;
  }
}

function dateKeys(booking) {
  const start = new Date(`${booking.check_in}T00:00:00.000Z`);
  const end = new Date(`${booking.check_out}T00:00:00.000Z`);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start >= end) {
    throw new Error(`Invalid stay dates in booking ${booking.id}`);
  }
  const result = [];
  const cursor = new Date(start);
  while (cursor < end) {
    result.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return result;
}

const [rooms, bookings, menuItems, orders, orderItems, roles, users] = await Promise.all([
  readAll("rooms"),
  readAll("bookings"),
  readAll("menu_items"),
  readAll("orders"),
  readAll("order_items"),
  readAll("user_roles"),
  readUsers(),
]);

const roleByEmail = new Map();
const emailByUserId = new Map(
  users.filter((user) => user.email).map((user) => [user.id, user.email.toLowerCase()]),
);
for (const role of roles) {
  const email = emailByUserId.get(role.user_id);
  if (email) roleByEmail.set(email, role.role);
  else console.warn(`Skipping role ${role.id}: its Supabase user has no email.`);
}

const itemGroups = new Map();
for (const item of orderItems) {
  const group = itemGroups.get(item.order_id) ?? [];
  group.push(item);
  itemGroups.set(item.order_id, group);
}
const activeLocks = new Map();
const today = new Date().toISOString().slice(0, 10);
for (const booking of bookings) {
  if (!["confirmed", "checked_in"].includes(booking.status)) continue;
  for (const date of dateKeys(booking).filter((day) => day >= today)) {
    const lockId = `${booking.room_id}_${date}`;
    const existing = activeLocks.get(lockId);
    if (existing && existing !== booking.id) {
      throw new Error(
        `Overlapping confirmed bookings ${existing} and ${booking.id} on ${date}. Resolve before migration.`,
      );
    }
    activeLocks.set(lockId, booking.id);
  }
}

console.info(
  `Found ${rooms.length} rooms, ${bookings.length} bookings, ${menuItems.length} menu items, ` +
    `${orders.length} orders, ${users.length} Auth users and ${roleByEmail.size} staff roles.`,
);
if (dryRun) {
  console.info("Dry run only; no Firebase data was changed. Add --apply to perform the migration.");
  process.exit(0);
}

for (const user of users) {
  if (!user.email) continue;
  try {
    await auth.getUserByEmail(user.email);
  } catch (error) {
    if (error.code !== "auth/user-not-found") throw error;
    await auth.createUser({
      email: user.email,
      emailVerified: false,
      displayName: user.user_metadata?.full_name,
    });
  }
}

const writer = firestore.bulkWriter();
function writeRows(collectionName, rows, extras = () => ({})) {
  for (const row of rows) {
    const { id, ...fields } = row;
    writer.set(firestore.collection(collectionName).doc(id), {
      ...fields,
      ...extras(row),
    });
  }
}

writeRows("rooms", rooms);
writeRows("bookings", bookings);
writeRows("menu_items", menuItems);
writeRows("orders", orders, (order) => ({ order_items: itemGroups.get(order.id) ?? [] }));
for (const [lockId, bookingId] of activeLocks) {
  const [roomId, ...dateParts] = lockId.split("_");
  const date = dateParts.join("_");
  writer.set(firestore.collection("room_night_locks").doc(lockId), {
    room_id: roomId,
    date,
    booking_id: bookingId,
  });
}
for (const [email, role] of roleByEmail) {
  if (role !== "admin" && role !== "cashier") {
    console.warn(`Skipping unsupported role "${role}" for ${email}.`);
    continue;
  }
  writer.set(firestore.collection("staff_access").doc(email), {
    email,
    role,
    updated_at: new Date().toISOString(),
  });
}
await writer.close();
console.info(
  "Firebase data migration completed. Users must use Forgot password to set Firebase passwords.",
);
