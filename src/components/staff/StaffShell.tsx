import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { LayoutDashboard, BedDouble, CalendarCheck, UtensilsCrossed, Receipt, Users, LogOut, ShoppingCart } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export function StaffShell({ isAdmin, children }: { isAdmin: boolean; children: ReactNode }) {
  const qc = useQueryClient();
  const nav = useNavigate();
  const links = isAdmin
    ? [
        { to: "/staff", label: "Overview", icon: LayoutDashboard, exact: true },
        { to: "/staff/bookings", label: "Bookings", icon: CalendarCheck },
        { to: "/staff/rooms", label: "Rooms", icon: BedDouble },
        { to: "/staff/pos", label: "Restaurant POS", icon: ShoppingCart },
        { to: "/staff/orders", label: "Orders", icon: Receipt },
        { to: "/staff/menu", label: "Menu", icon: UtensilsCrossed },
        { to: "/staff/team", label: "Staff", icon: Users },
      ]
    : [
        { to: "/staff/pos", label: "Restaurant POS", icon: ShoppingCart },
        { to: "/staff/orders", label: "Orders", icon: Receipt },
      ];
  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    nav({ to: "/auth", replace: true });
  }
  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 shrink-0 flex-col bg-sidebar text-sidebar-foreground md:flex">
        <Link to="/" className="px-6 py-7">
          <div className="font-display text-2xl">Vaasal Villa</div>
          <div className="text-[0.6rem] uppercase tracking-[0.4em] text-sidebar-primary">{isAdmin ? "Admin" : "Staff"}</div>
        </Link>
        <nav className="flex-1 space-y-1 px-3">
          {links.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              activeOptions={{ exact: !!l.exact }}
              className="flex items-center gap-3 rounded-sm px-3 py-2.5 text-sm opacity-80 hover:bg-sidebar-accent hover:opacity-100"
              activeProps={{ className: "bg-sidebar-accent opacity-100 text-sidebar-primary" }}
            >
              <l.icon className="size-4" />{l.label}
            </Link>
          ))}
        </nav>
        <button onClick={signOut} className="m-3 flex items-center gap-3 px-3 py-2.5 text-sm opacity-70 hover:opacity-100">
          <LogOut className="size-4" /> Sign out
        </button>
      </aside>
      <div className="flex-1 overflow-x-hidden">
        <div className="flex gap-2 overflow-x-auto bg-sidebar p-3 text-sidebar-foreground md:hidden">
          {links.map((l) => (
            <Link key={l.to} to={l.to} className="whitespace-nowrap px-3 py-1 text-xs" activeProps={{ className: "text-sidebar-primary" }}>{l.label}</Link>
          ))}
          <button onClick={signOut} className="px-3 text-xs">Sign out</button>
        </div>
        <div className="p-6 md:p-10">{children}</div>
      </div>
    </div>
  );
}
