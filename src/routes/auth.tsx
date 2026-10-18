import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { publicAsset } from "@/lib/hotel";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Staff Login — Vaasal Villa Hotel" },
      { name: "description", content: "Staff sign-in for Vaasal Villa admin and restaurant billing." },
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
  const [showResend, setShowResend] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        nav({ to: "/staff", replace: true });
      }
    });
  }, [nav]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setShowResend(false);

    if (mode === "in") {
      const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      setBusy(false);
      if (error) {
        if (error.message.toLowerCase().includes("email not confirmed")) {
          setShowResend(true);
        }
        toast.error(error.message);
        return;
      }
      if (data.session) {
        nav({ to: "/staff" });
      }
    } else {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { emailRedirectTo: window.location.origin + import.meta.env.BASE_URL + "staff" },
      });
      setBusy(false);
      if (error) {
        toast.error(error.message);
        return;
      }
      if (data.session) {
        toast.success("Account created successfully!");
        nav({ to: "/staff" });
        return;
      }
      if (data.user && data.user.identities && data.user.identities.length === 0) {
        toast.error("This email is already registered. Please sign in instead.");
        setMode("in");
        return;
      }
      toast.success("Account created! Check your email to confirm your account, then sign in.");
      setShowResend(true);
      setMode("in");
    }
  }

  async function handleResend() {
    if (!email) {
      toast.error("Please enter your email address first.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin + import.meta.env.BASE_URL + "staff" },
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Confirmation email resent. Please check your inbox / spam folder.");
    }
  }

  return (
    <div className="grid min-h-screen md:grid-cols-2">
      <div className="relative hidden md:block">
        <img src={publicAsset("/images/hero.jpg")} alt="" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-hero-overlay" />
        <div className="absolute bottom-12 left-12 text-espresso-foreground">
          <div className="font-display text-5xl">Vaasal Villa</div>
          <div className="eyebrow mt-2 text-gold">Staff Portal</div>
        </div>
      </div>
      <div className="flex items-center justify-center p-8">
        <form onSubmit={submit} className="w-full max-w-sm space-y-5">
          <Link to="/" className="inline-block text-xs uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground">
            ← Back to website
          </Link>
          <h1 className="text-4xl">{mode === "in" ? "Staff sign in" : "Create staff account"}</h1>
          <p className="text-sm text-muted-foreground">
            The first account becomes the owner (admin). After that, an admin must grant staff access to new accounts.
          </p>
          <div><Label>Email</Label><Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div><Label>Password</Label><Input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} /></div>
          {showResend && (
            <div className="rounded-md border border-gold/40 bg-gold/5 p-3 text-sm">
              <p className="text-muted-foreground text-xs">Didn't receive or confirm your email?</p>
              <button
                type="button"
                disabled={busy}
                onClick={handleResend}
                className="mt-1 text-xs text-gold underline hover:text-gold/80"
              >
                Resend confirmation email
              </button>
            </div>
          )}
          <Button type="submit" variant="luxe" className="w-full" size="lg" disabled={busy}>
            {busy ? "Please wait…" : mode === "in" ? "Sign in" : "Sign up"}
          </Button>
          <button type="button" className="text-sm text-primary" onClick={() => { setMode(mode === "in" ? "up" : "in"); setShowResend(false); }}>
            {mode === "in" ? "No account? Sign up" : "Have an account? Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
