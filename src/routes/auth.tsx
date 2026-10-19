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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { publicAsset } from "@/lib/hotel";

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
  const configured = isFirebaseConfigured();

  useEffect(() => {
    return onAuthStateChanged(auth, (user) => {
      if (user?.emailVerified) nav({ to: "/staff", replace: true });
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
          await sendEmailVerification(credential.user);
          await signOut(auth);
          toast.error("Please verify your email. A new verification link has been sent.");
          return;
        }
        nav({ to: "/staff" });
      } else {
        const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
        await sendEmailVerification(credential.user, {
          url: window.location.origin + import.meta.env.BASE_URL + "staff",
        });
        await signOut(auth);
        toast.success(
          "Account created. Verify your email, then sign in. An admin must grant staff access.",
        );
        setMode("in");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not complete authentication.");
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
      await sendPasswordResetEmail(auth, email.trim(), {
        url: window.location.origin + import.meta.env.BASE_URL + "auth",
      });
      toast.success("Password reset email sent. Check your inbox.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not send a password reset email.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen md:grid-cols-2">
      <div className="relative hidden md:block">
        <img
          src={publicAsset("/images/hero.jpg")}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-hero-overlay" />
        <div className="absolute bottom-12 left-12 text-espresso-foreground">
          <div className="font-display text-5xl">Vaasal Villa</div>
          <div className="eyebrow mt-2 text-gold">Staff Portal</div>
        </div>
      </div>
      <div className="flex items-center justify-center p-8">
        <form onSubmit={submit} className="w-full max-w-sm space-y-5">
          <Link
            to="/"
            className="inline-block text-xs uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground"
          >
            ← Back to website
          </Link>
          <h1 className="text-4xl">{mode === "in" ? "Staff sign in" : "Create staff account"}</h1>
          <p className="text-sm text-muted-foreground">
            Verify your email, then ask an admin to grant staff access.
          </p>
          {!configured && (
            <p
              role="alert"
              className="rounded border border-destructive/40 p-3 text-sm text-destructive"
            >
              Firebase is not configured. Add the Firebase web app settings before signing in.
            </p>
          )}
          <div>
            <Label>Email</Label>
            <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <Label>Password</Label>
            <Input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <Button type="submit" variant="luxe" className="w-full" size="lg" disabled={busy}>
            {busy ? "Please wait…" : mode === "in" ? "Sign in" : "Sign up"}
          </Button>
          {mode === "in" && (
            <button
              type="button"
              className="block text-sm text-primary"
              onClick={() => void resetPassword()}
              disabled={busy}
            >
              Forgot password?
            </button>
          )}
          <button
            type="button"
            className="text-sm text-primary"
            onClick={() => setMode(mode === "in" ? "up" : "in")}
          >
            {mode === "in" ? "No account? Sign up" : "Have an account? Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
