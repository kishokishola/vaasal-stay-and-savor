import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { auth, isFirebaseConfigured } from "@/integrations/firebase/client";
import { getStaffAccess } from "@/lib/firebase-data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { publicAsset } from "@/lib/hotel";
import { BrandLogo } from "@/components/site/BrandLogo";

function authErrorMessage(error: unknown) {
  const code =
    error && typeof error === "object" && "code" in error && typeof error.code === "string"
      ? error.code
      : "";
  if (code === "auth/invalid-credential" || code === "auth/user-not-found") {
    return "Email or password is incorrect. If this is an old Supabase staff account, create or reset its Firebase password first.";
  }
  if (code === "auth/operation-not-allowed") {
    return "Email/password sign-in is disabled. Enable it in Firebase Authentication settings.";
  }
  if (code === "auth/unauthorized-domain" || code === "auth/unauthorized-continue-uri") {
    return "Firebase rejected the email action link. In Firebase Console → Authentication → Settings → Authorized domains, make sure vaasal-villa.firebaseapp.com is listed.";
  }
  if (code === "auth/email-already-in-use") {
    return "An account with this email already exists. Sign in or use Forgot password.";
  }
  if (code === "auth/too-many-requests") {
    return "Too many attempts. Wait a few minutes, then try again.";
  }
  return error instanceof Error ? error.message : "Could not complete authentication.";
}

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
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [accessMessage, setAccessMessage] = useState("");
  const configured = isFirebaseConfigured();

  useEffect(() => {
    return onAuthStateChanged(auth, async (user) => {
      if (!user?.emailVerified || !user.email) return;
      try {
        const role = await getStaffAccess(user.email);
        if (role) nav({ to: "/staff", replace: true });
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
    if (!configured) {
      toast.error(
        "Firebase is not configured yet. Ask the site administrator to finish Firebase setup.",
      );
      return;
    }
    setBusy(true);

    try {
      if (mode === "in") {
        const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
        if (!credential.user.emailVerified) {
          try {
            await sendEmailVerification(credential.user);
          } finally {
            await signOut(auth);
          }
          toast.error("Please verify your email. A new verification link has been sent.");
          return;
        }
        let role: "admin" | "cashier" | null;
        try {
          role = await getStaffAccess(credential.user.email ?? "");
        } catch (error) {
          console.error("Could not check staff access after sign-in.", error);
          await signOut(auth);
          setAccessMessage(
            "Sign-in worked, but staff access could not be checked. Ask the site owner to publish Firestore rules.",
          );
          return;
        }
        if (!role) {
          await signOut(auth);
          setAccessMessage(
            "This account is not assigned to hotel staff yet. Ask the project owner to add your email as an admin or cashier.",
          );
          return;
        }
        setAccessMessage("");
        nav({ to: "/staff" });
      } else {
        const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
        await sendEmailVerification(credential.user);
        await signOut(auth);
        toast.success(
          "Account created. Verify your email, then sign in. An admin must grant staff access.",
        );
        setMode("in");
      }
    } catch (error) {
      toast.error(authErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword() {
    if (!email.trim()) {
      toast.error("Enter your email address first.");
      return;
    }
    setBusy(true);
    try {
      await sendPasswordResetEmail(auth, email.trim());
      toast.success("Password reset email sent. Check your inbox.");
    } catch (error) {
      toast.error(authErrorMessage(error));
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
            className="space-y-6 rounded-sm border border-border/80 bg-card p-6 shadow-luxe sm:p-8 md:border-0 md:bg-transparent md:p-0 md:shadow-none"
          >
            <div>
              <p className="eyebrow">Secure staff portal</p>
              <h1 className="mt-2 text-4xl">
                {mode === "in" ? "Welcome back" : "Create your account"}
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {mode === "in"
                  ? "Sign in with your verified Firebase staff account."
                  : "Create a Firebase account. An admin must grant staff access before you can enter the portal."}
              </p>
            </div>
            {accessMessage && (
              <p
                role="alert"
                className="rounded-sm border border-destructive/40 bg-destructive/5 p-3 text-sm leading-relaxed text-destructive"
              >
                {accessMessage}
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
              <Label htmlFor="staff-email">Email address</Label>
              <Input
                id="staff-email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={busy}
                className="h-12 bg-background"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="staff-password">Password</Label>
              <Input
                id="staff-password"
                type="password"
                autoComplete={mode === "in" ? "current-password" : "new-password"}
                placeholder="At least 6 characters"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={busy}
                className="h-12 bg-background"
              />
            </div>
            <Button
              type="submit"
              variant="luxe"
              className="h-12 w-full"
              size="lg"
              disabled={busy || !configured}
            >
              {busy ? "Please wait…" : mode === "in" ? "Sign in to staff portal" : "Create account"}
            </Button>
            <div className="flex flex-col items-start gap-2 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              {mode === "in" && (
                <button
                  type="button"
                  className="inline-flex min-h-11 cursor-pointer items-center rounded px-2 text-sm text-primary transition-colors hover:bg-secondary hover:text-foreground hover:underline hover:underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={() => void resetPassword()}
                  disabled={busy || !configured}
                >
                  Forgot password?
                </button>
              )}
              <button
                type="button"
                className="inline-flex min-h-11 cursor-pointer items-center rounded px-2 text-sm font-medium text-primary transition-colors hover:bg-secondary hover:underline hover:underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => setMode(mode === "in" ? "up" : "in")}
                disabled={busy || !configured}
              >
                {mode === "in" ? "No account? Sign up" : "Have an account? Sign in"}
              </button>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Admin access is assigned by the project owner using the verified email address.
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
