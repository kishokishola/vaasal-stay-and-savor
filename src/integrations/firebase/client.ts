import { getApp, getApps, initializeApp } from "firebase/app";
import {
  createUserWithEmailAndPassword,
  getAuth,
  inMemoryPersistence,
  setPersistence,
  type User,
} from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const requiredConfig = {
  apiKey: import.meta.env["VITE_FIREBASE_API_KEY"],
  authDomain: import.meta.env["VITE_FIREBASE_AUTH_DOMAIN"],
  projectId: import.meta.env["VITE_FIREBASE_PROJECT_ID"],
  appId: import.meta.env["VITE_FIREBASE_APP_ID"],
};

export function isFirebaseConfigured() {
  return Object.values(requiredConfig).every(Boolean);
}

export const firebaseApp = getApps().length
  ? getApp()
  : initializeApp({
      apiKey: requiredConfig.apiKey || "firebase-not-configured",
      authDomain: requiredConfig.authDomain || "firebase-not-configured.invalid",
      projectId: requiredConfig.projectId || "firebase-not-configured",
      appId: requiredConfig.appId || "firebase-not-configured",
    });

export const auth = getAuth(firebaseApp);
export const db = getFirestore(firebaseApp);

const provisioningApp =
  getApps().find((app) => app.name === "staff-account-provisioning") ??
  initializeApp(firebaseApp.options, "staff-account-provisioning");
const provisioningAuth = getAuth(provisioningApp);

export async function createProvisionedStaffAccount(
  email: string,
  password: string,
): Promise<User> {
  await setPersistence(provisioningAuth, inMemoryPersistence);
  const credential = await createUserWithEmailAndPassword(
    provisioningAuth,
    email.trim().toLowerCase(),
    password,
  );
  return credential.user;
}

export async function waitForAuth() {
  await auth.authStateReady();
  return auth.currentUser;
}

export function requireFirebaseConfig() {
  if (!isFirebaseConfigured()) {
    throw new Error(
      "Firebase is not configured. Add the VITE_FIREBASE_* settings from your Firebase web app.",
    );
  }
}
