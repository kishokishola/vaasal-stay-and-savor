import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import {
  LayoutDashboard,
  BedDouble,
  CalendarCheck,
  UtensilsCrossed,
  Receipt,
  Users,
  LogOut,
  ShoppingCart,
  ChefHat,
  Wallet,
} from "lucide-react";
import { signOut } from "firebase/auth";
import { auth } from "@/integrations/firebase/client";
import { BrandLogo } from "@/components/site/BrandLogo";

export function StaffShell({ isAdmin, children }: { isAdmin: boolean; children: ReactNode }) {
  const qc = useQueryClient();
  const nav = useNavigate();
  const links = isAdmin
    ? [
        { to: "/staff", label: "Overview", icon: LayoutDashboard, exact: true },
        { to: "/staff/bookings", label: "Bookings", icon: CalendarCheck },
        { to: "/staff/rooms", label: "Rooms", icon: BedDouble },
        { to: "/staff/pos", label: "Restaurant POS", icon: ShoppingCart },
        { to: "/staff/kitchen", label: "Kitchen Queue", icon: ChefHat },
        { to: "/staff/orders", label: "Orders", icon: Receipt },
        { to: "/staff/petty-cash", label: "Petty Cash", icon: Wallet },
        { to: "/staff/menu", label: "Menu", icon: UtensilsCrossed },
        { to: "/staff/team", label: "Staff", icon: Users },
      ]
    : [
        { to: "/staff/pos", label: "Restaurant POS", icon: ShoppingCart },
        { to: "/staff/orders", label: "Orders", icon: Receipt },
        { to: "/staff/kitchen", label: "Kitchen Queue", icon: ChefHat },
        { to: "/staff/petty-cash", label: "Petty Cash", icon: Wallet },
      ];
  async function logout() {
    await qc.cancelQueries();
    qc.clear();
    await signOut(auth);
    nav({ to: "/auth", replace: true });
  }
  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 shrink-0 flex-col bg-sidebar text-sidebar-foreground md:flex">
        <Link to="/" className="px-6 py-7">
          <BrandLogo size="staff" subtitle={isAdmin ? "Admin portal" : "Staff portal"} />
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
              <l.icon className="size-4" />
              {l.label}
            </Link>
          ))}
        </nav>
        <button
          onClick={logout}
          className="m-3 flex items-center gap-3 px-3 py-2.5 text-sm opacity-70 hover:opacity-100"
        >
          <LogOut className="size-4" /> Sign out
        </button>
      </aside>
      <div className="flex-1 overflow-x-hidden">
        <Link
          to="/"
          className="flex items-center border-b border-sidebar-border bg-sidebar px-4 py-3 text-sidebar-foreground md:hidden"
        >
          <BrandLogo size="staff" subtitle={isAdmin ? "Admin portal" : "Staff portal"} />
        </Link>
        <div className="flex gap-2 overflow-x-auto bg-sidebar p-3 text-sidebar-foreground md:hidden">
          {links.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className="whitespace-nowrap px-3 py-1 text-xs"
              activeProps={{ className: "text-sidebar-primary" }}
            >
              {l.label}
            </Link>
          ))}
          <button onClick={logout} className="px-3 text-xs">
            Sign out
          </button>
        </div>
        <div className="p-6 md:p-10">{children}</div>
      </div>
    </div>
  );
}
