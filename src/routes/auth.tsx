import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { auth, isFirebaseConfigured } from "@/integrations/firebase/client";
import { getStaffAccess } from "@/lib/firebase-data";
import { STAFF_ROLES, staffHomeRoute, staffRoleLabel, type StaffRole } from "@/lib/staff-roles";
import { staffAuthErrorMessage, staffPasswordResetActionSettings } from "@/lib/staff-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { publicAsset } from "@/lib/hotel";
import { BrandLogo } from "@/components/site/BrandLogo";
import { ChefHat, ShieldCheck, UtensilsCrossed, UserRound, type LucideIcon } from "lucide-react";

const staffRoleIcons: Record<StaffRole, LucideIcon> = {
  admin: ShieldCheck,
  cashier: UserRound,
  cashier_restaurant: UtensilsCrossed,
  kitchen: ChefHat,
};

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Staff Login — Vaasal Villa Hotel" },
      {
        name: "description",
        content: "Staff sign-in for Vaasal Villa admin and restaurant billing.",
      },
      { property: "og:title", content: "Staff Login — Vaasal Villa Hotel" },
      { property: "og:description", content: "Staff sign-in for Vaasal Villa." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const nav = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [selectedRole, setSelectedRole] = useState<StaffRole | null>(null);
  const [busy, setBusy] = useState(false);
  const [accessMessage, setAccessMessage] = useState("");
  const [resetMessage, setResetMessage] = useState("");
  const [signupMessage, setSignupMessage] = useState("");
  const [passwordResetComplete, setPasswordResetComplete] = useState(false);
  const submitting = useRef(false);
  const configured = isFirebaseConfigured();

  useEffect(() => {
    const search = new URLSearchParams(window.location.search);
    setPasswordResetComplete(search.get("passwordReset") === "complete");
    return onAuthStateChanged(auth, async (user) => {
      if (!user?.email || submitting.current) return;
      try {
        const role = await getStaffAccess(user.email);
        if (role) nav({ to: staffHomeRoute(role), replace: true });
      } catch (error) {
        console.error("Could not check staff access after sign-in.", error);
        setAccessMessage(
          "Sign-in worked, but staff access could not be checked. Ask the site owner to publish Firestore rules.",
        );
      }
    });
  }, [nav]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (mode === "signup") {
      await createAccount();
      return;
    }
    if (!selectedRole) {
      setAccessMessage("Choose the staff portal assigned to your account before signing in.");
      return;
    }
    if (!configured) {
      toast.error(
        "Firebase is not configured yet. Ask the site administrator to finish Firebase setup.",
      );
      return;
    }
    submitting.current = true;
    setBusy(true);

    try {
      const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
      let role: StaffRole | null;
      try {
        role = await getStaffAccess(credential.user.email ?? "");
      } catch (error) {
        console.error("Could not check staff access after sign-in.", error);
        await signOut(auth);
        const code =
          error && typeof error === "object" && "code" in error && typeof error.code === "string"
            ? error.code
            : "";
        setAccessMessage(
          code === "unavailable" || code.endsWith("/unavailable")
            ? "Firebase sign-in worked, but the staff-role database could not be reached. Check your network and try again."
            : "Sign-in worked, but staff access could not be checked. Ask the site owner to verify Firestore rules and staff access.",
        );
        return;
      }
      if (!role) {
        await signOut(auth);
        setAccessMessage(
          "This account is not assigned a staff role yet. Ask the administrator to add you as admin, hotel cashier, restaurant cashier, or kitchen staff.",
        );
        return;
      }
      if (role !== selectedRole) {
        await signOut(auth);
        setAccessMessage(
          `This account is assigned to ${staffRoleLabel(role)}. Select that portal and sign in again.`,
        );
        return;
      }
      setAccessMessage("");
      nav({ to: staffHomeRoute(role), replace: true });
    } catch (error) {
      toast.error(staffAuthErrorMessage(error, window.location.hostname));
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  async function createAccount() {
    const address = email.trim().toLowerCase();
    if (password.length < 6) {
      setAccessMessage("Choose a password with at least 6 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setAccessMessage("The passwords do not match.");
      return;
    }
    if (!configured) {
      setAccessMessage("Staff account creation is unavailable because Firebase is not configured.");
      return;
    }

    setBusy(true);
    setAccessMessage("");
    setSignupMessage("");
    try {
      await createUserWithEmailAndPassword(auth, address, password);
      await signOut(auth);
      setPassword("");
      setConfirmPassword("");
      setMode("signin");
      setSignupMessage(
        "Your staff login has been created. For security, an administrator must assign your staff role before you can enter a dashboard. Use your email as your username; you can reset your password from this page.",
      );
    } catch (error) {
      setAccessMessage(staffAuthErrorMessage(error, window.location.hostname));
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword() {
    const address = email.trim();
    if (!address) {
      toast.error("Enter your staff email address first.");
      return;
    }
    setResetMessage("");
    setBusy(true);
    try {
      await sendPasswordResetEmail(
        auth,
        address,
        staffPasswordResetActionSettings(window.location.origin, import.meta.env.BASE_URL),
      );
      setResetMessage(
        "Firebase accepted the request. If this is a Firebase staff account, check the inbox and spam folder for a reset email, then open its link to set a new password. If no email arrives, ask the administrator to create the Firebase account in Staff → Create staff account. A reset request does not create an account.",
      );
    } catch (error) {
      toast.error(staffAuthErrorMessage(error, window.location.hostname));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen bg-background md:grid-cols-2">
      <div className="relative hidden min-h-screen overflow-hidden md:block">
        <img
          src={publicAsset("/images/hero.jpg")}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-hero-overlay" />
        <div className="absolute left-8 top-8 lg:left-12 lg:top-12">
          <BrandLogo size="auth" subtitle="Staff portal" />
        </div>
        <div className="absolute bottom-12 left-8 right-8 text-espresso-foreground lg:left-12">
          <p className="eyebrow text-gold">Vaasal Villa · Jaffna</p>
          <p className="mt-3 max-w-lg font-display text-3xl leading-snug lg:text-4xl">
            Warm hospitality, thoughtfully managed.
          </p>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-espresso-foreground/80">
            Secure staff access for hotel operations and restaurant billing.
          </p>
        </div>
      </div>
      <div className="flex min-h-screen items-center justify-center px-5 py-8 sm:px-8 md:px-10 lg:px-16">
        <div className="w-full max-w-md">
          <div className="mb-7 flex items-center justify-between gap-4">
            <div className="md:hidden">
              <BrandLogo size="auth" />
            </div>
            <Link
              to="/"
              className="ml-auto inline-flex min-h-11 items-center rounded px-3 text-xs uppercase tracking-[0.16em] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              ← Back to website
            </Link>
          </div>
          <form
            onSubmit={submit}
            className="glass-panel space-y-6 rounded-sm p-6 shadow-luxe sm:p-8 md:p-8"
          >
            <div>
              <p className="eyebrow">Secure staff portal</p>
              <h1 className="mt-2 text-4xl">
                {mode === "signin" ? "Welcome back" : "Create staff login"}
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {mode === "signin"
                  ? "Choose your assigned staff portal, then sign in with your email and password."
                  : "Create a login with your email as username and a password you choose."}
              </p>
            </div>
            <div className="grid grid-cols-2 border-b border-border text-sm">
              <button
                type="button"
                className={`min-h-11 border-b-2 px-3 ${mode === "signin" ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}
                onClick={() => {
                  setMode("signin");
                  setAccessMessage("");
                }}
                disabled={busy}
              >
                Sign in
              </button>
              <button
                type="button"
                className={`min-h-11 border-b-2 px-3 ${mode === "signup" ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}
                onClick={() => {
                  setMode("signup");
                  setAccessMessage("");
                }}
                disabled={busy}
              >
                Create account
              </button>
            </div>
            {passwordResetComplete && (
              <p
                role="status"
                className="rounded-sm border border-primary/30 bg-primary/5 p-3 text-sm leading-relaxed text-foreground"
              >
                Your password has been updated. Sign in with your new password.
              </p>
            )}
            {signupMessage && (
              <p
                role="status"
                className="rounded-sm border border-primary/30 bg-primary/5 p-3 text-sm leading-relaxed text-foreground"
              >
                {signupMessage}
              </p>
            )}
            {mode === "signin" && (
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">Staff portal</legend>
                <div className="grid grid-cols-2 gap-2">
                  {STAFF_ROLES.map((role) => {
                    const Icon = staffRoleIcons[role];
                    const selected = selectedRole === role;
                    return (
                      <label
                        key={role}
                        className={`flex min-h-12 cursor-pointer items-center gap-2 rounded-sm border px-3 py-2 text-left text-sm transition ${
                          selected
                            ? "border-primary bg-primary/10 text-primary ring-1 ring-primary/40"
                            : "border-border/70 bg-white/30 text-foreground hover:border-primary/50 hover:bg-white/50"
                        }`}
                      >
                        <input
                          type="radio"
                          name="staff-role"
                          value={role}
                          checked={selected}
                          disabled={busy}
                          onChange={() => {
                            setSelectedRole(role);
                            setAccessMessage("");
                          }}
                          className="size-4 shrink-0 accent-primary"
                        />
                        <Icon className="size-4 shrink-0" />
                        <span>{staffRoleLabel(role)}</span>
                      </label>
                    );
                  })}
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Your role is checked against your staff account after sign-in. Choosing a portal
                  does not grant access.
                </p>
              </fieldset>
            )}
            {accessMessage && (
              <p
                role="alert"
                className="rounded-sm border border-destructive/40 bg-destructive/5 p-3 text-sm leading-relaxed text-destructive"
              >
                {accessMessage}
              </p>
            )}
            {resetMessage && (
              <p
                role="status"
                className="rounded-sm border border-primary/30 bg-primary/5 p-3 text-sm leading-relaxed text-foreground"
              >
                {resetMessage}
              </p>
            )}
            {!configured && (
              <p
                role="alert"
                className="rounded-sm border border-destructive/40 bg-destructive/5 p-3 text-sm leading-relaxed text-destructive"
              >
                Firebase is not configured. Add the Firebase web app settings before signing in.
              </p>
            )}
            <div className="space-y-2">
              <Label htmlFor="staff-email">Email address (username)</Label>
              <Input
                id="staff-email"
                type="email"
                autoComplete={mode === "signup" ? "username" : "email"}
                placeholder="you@example.com"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={busy}
                className="h-12 bg-background"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="staff-password">
                {mode === "signup" ? "Choose password" : "Password"}
              </Label>
              <Input
                id="staff-password"
                type="password"
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                placeholder={mode === "signup" ? "At least 6 characters" : "Enter your password"}
                required
                minLength={mode === "signup" ? 6 : undefined}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={busy}
                className="h-12 bg-background"
              />
            </div>
            {mode === "signup" && (
              <div className="space-y-2">
                <Label htmlFor="staff-confirm-password">Confirm password</Label>
                <Input
                  id="staff-confirm-password"
                  type="password"
                  autoComplete="new-password"
                  placeholder="Enter the same password again"
                  required
                  minLength={6}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={busy}
                  className="h-12 bg-background"
                />
              </div>
            )}
            <Button
              type="submit"
              variant="luxe"
              className="h-12 w-full"
              size="lg"
              disabled={busy || !configured}
            >
              {busy
                ? "Please wait…"
                : mode === "signin"
                  ? "Sign in to staff portal"
                  : "Create staff login"}
            </Button>
            {mode === "signin" && (
              <button
                type="button"
                className="min-h-11 cursor-pointer rounded px-2 text-sm text-primary transition-colors hover:bg-secondary hover:underline hover:underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => void resetPassword()}
                disabled={busy || !configured}
              >
                Forgot password? Send a reset link
              </button>
            )}
            <div className="border-t border-border pt-4">
              <p className="text-xs leading-relaxed text-muted-foreground">
                {mode === "signup"
                  ? "Creating a login does not grant dashboard access. The administrator must assign your staff role. Use your email as your username so password recovery can reach you."
                  : "Use Create account for a new Firebase login. The administrator must assign your role before dashboard access. Legacy Supabase passwords cannot be reused."}
              </p>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Admin access is assigned by the project owner to your Firebase sign-in email.
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
