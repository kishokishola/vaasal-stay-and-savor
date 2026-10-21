import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  type Unsubscribe,
} from "firebase/firestore";
import { signInAnonymously } from "firebase/auth";
import { auth, db, requireFirebaseConfig } from "@/integrations/firebase/client";
import { useQuery } from "@tanstack/react-query";
import { useFirestoreRealtime } from "@/hooks/useFirestoreRealtime";

export type SiteService = { title: string; description: string; icon?: string };
export type SiteFaq = { question: string; answer: string };
export type SiteSettings = {
  name: string;
  tagline: string;
  phone: string;
  whatsapp: string;
  email: string;
  address: string;
  map_url: string;
  facebook: string;
  instagram: string;
  twitter: string;
  youtube: string;
  hero_title: string;
  hero_subtitle: string;
  about_title: string;
  about_body: string;
  about_image: string;
  services: SiteService[];
  faqs: SiteFaq[];
  terms: string;
  terms_pdf_url: string;
};

export const DEFAULT_SITE_SETTINGS: SiteSettings = {
  name: "Vaasal Villa",
  tagline: "A luxury villa hotel in the heart of Jaffna",
  phone: "+94 76 465 8567",
  whatsapp: "94764658567",
  email: "stay@vaasalvilla.lk",
  address: "Jaffna, Northern Province, Sri Lanka",
  map_url: "",
  facebook: "",
  instagram: "",
  twitter: "",
  youtube: "",
  hero_title: "Where Jaffna welcomes you home.",
  hero_subtitle: "A luxury villa hotel combining comfort, style and timeless northern hospitality.",
  about_title: "Quiet luxury in the heart of Jaffna",
  about_body:
    "Well-furnished rooms, a calm atmosphere and the essentials done beautifully — free high-speed WiFi, 24-hour check-in and dedicated guest support. Whether for business, family or leisure, we focus on cleanliness, comfort and personal care so you feel at home throughout your stay.",
  about_image: "/images/room-family.jpg",
  services: [
    { title: "Restaurant", description: "Authentic Jaffna cuisine, prepared fresh every day." },
    {
      title: "Room service",
      description: "Enjoy meals and refreshments in the comfort of your room.",
    },
    {
      title: "Airport transfers",
      description: "Arrange a comfortable transfer to or from the hotel.",
    },
    { title: "Free Wi-Fi", description: "Stay connected throughout your visit." },
    { title: "Laundry", description: "Convenient laundry support during your stay." },
    { title: "Guest assistance", description: "Our team is available around the clock to help." },
  ],
  faqs: [
    {
      question: "What time are check-in and check-out?",
      answer: "Please contact our team to arrange your arrival and departure.",
    },
    {
      question: "How can I confirm a booking?",
      answer: "Submit a booking request and our team will contact you to confirm availability.",
    },
    { question: "How can I pay?", answer: "Payment is handled directly with the hotel." },
  ],
  terms:
    "Booking requests are subject to confirmation by Vaasal Villa. Prices and availability may change until confirmed. Payment is made directly to the hotel. Guests are responsible for providing accurate contact and booking information.",
  terms_pdf_url: "",
};

function asText(value: unknown, fallback: string) {
  return typeof value === "string" ? value : fallback;
}

export function parseSiteSettings(value: Record<string, unknown> | undefined): SiteSettings {
  if (!value) return DEFAULT_SITE_SETTINGS;
  return {
    ...DEFAULT_SITE_SETTINGS,
    ...Object.fromEntries(
      Object.keys(DEFAULT_SITE_SETTINGS)
        .filter((key) => !["services", "faqs"].includes(key))
        .map((key) => [
          key,
          asText(value[key], DEFAULT_SITE_SETTINGS[key as keyof SiteSettings] as string),
        ]),
    ),
    services: Array.isArray(value["services"])
      ? value["services"].filter(
          (item): item is SiteService =>
            !!item &&
            typeof item === "object" &&
            typeof (item as SiteService).title === "string" &&
            typeof (item as SiteService).description === "string",
        )
      : DEFAULT_SITE_SETTINGS.services,
    faqs: Array.isArray(value["faqs"])
      ? value["faqs"].filter(
          (item): item is SiteFaq =>
            !!item &&
            typeof item === "object" &&
            typeof (item as SiteFaq).question === "string" &&
            typeof (item as SiteFaq).answer === "string",
        )
      : DEFAULT_SITE_SETTINGS.faqs,
  };
}

export async function getSiteSettings() {
  requireFirebaseConfig();
  const snapshot = await getDoc(doc(db, "site_settings", "public"));
  return parseSiteSettings(snapshot.exists() ? snapshot.data() : undefined);
}

export function useSiteSettings() {
  const queryKey = ["site-settings"];
  const query = useQuery({ queryKey, queryFn: getSiteSettings });
  useFirestoreRealtime(queryKey, subscribeToSiteSettings);
  return query;
}

export function subscribeToSiteSettings(
  onChange: () => void,
  onError: (error: Error) => void,
): Unsubscribe {
  requireFirebaseConfig();
  let initial = true;
  return onSnapshot(
    doc(db, "site_settings", "public"),
    () => {
      if (initial) initial = false;
      else onChange();
    },
    onError,
  );
}

export async function saveSiteSettings(settings: SiteSettings) {
  requireFirebaseConfig();
  if (
    !settings.name.trim() ||
    !settings.phone.trim() ||
    !settings.email.trim() ||
    !settings.address.trim()
  )
    throw new Error("Hotel name, phone, email and address are required.");
  if (settings.services.length > 20 || settings.faqs.length > 30)
    throw new Error("The website supports up to 20 services and 30 FAQs.");
  await setDoc(doc(db, "site_settings", "public"), {
    ...settings,
    name: settings.name.trim(),
    phone: settings.phone.trim(),
    email: settings.email.trim(),
    address: settings.address.trim(),
    updated_at: new Date().toISOString(),
  });
}

export type ContactMessage = {
  id: string;
  name: string;
  email: string;
  phone: string;
  message: string;
  created_at: string;
  status: "new" | "read";
};

export async function sendContactMessage(input: {
  name: string;
  email: string;
  phone: string;
  message: string;
}) {
  requireFirebaseConfig();
  if (!input.name.trim() || !input.email.trim() || !input.message.trim())
    throw new Error("Name, email and message are required.");
  if (
    input.name.length > 120 ||
    input.email.length > 254 ||
    input.phone.length > 40 ||
    input.message.length > 4000
  )
    throw new Error("Please shorten your contact details or message.");
  const user = auth.currentUser ?? (await signInAnonymously(auth)).user;
  await addDoc(collection(db, "contact_messages"), {
    ...input,
    name: input.name.trim(),
    email: input.email.trim(),
    phone: input.phone.trim(),
    message: input.message.trim(),
    status: "new",
    created_by_uid: user.uid,
    created_at: new Date().toISOString(),
  });
}

export async function getContactMessages() {
  requireFirebaseConfig();
  const snapshot = await getDocs(
    query(collection(db, "contact_messages"), orderBy("created_at", "desc")),
  );
  return snapshot.docs.map((item) => ({ ...item.data(), id: item.id }) as ContactMessage);
}

export function subscribeToContactMessages(onChange: () => void, onError: (error: Error) => void) {
  requireFirebaseConfig();
  let initial = true;
  return onSnapshot(
    query(collection(db, "contact_messages"), orderBy("created_at", "desc")),
    () => {
      if (initial) initial = false;
      else onChange();
    },
    onError,
  );
}

export async function markContactMessageRead(id: string) {
  requireFirebaseConfig();
  await updateDoc(doc(db, "contact_messages", id), { status: "read" });
}
