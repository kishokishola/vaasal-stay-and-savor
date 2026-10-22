import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
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
  CreditCard,
  Settings,
  Plus,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { signOut } from "firebase/auth";
import { auth } from "@/integrations/firebase/client";
import { BrandLogo } from "@/components/site/BrandLogo";
import {
  getBookings,
  getOrders,
  subscribeToBookings,
  subscribeToOrders,
} from "@/lib/firebase-data";
import { useFirestoreRealtime } from "@/hooks/useFirestoreRealtime";
import { staffRoleLabel, type StaffRole } from "@/lib/staff-roles";

export function StaffShell({ role, children }: { role: StaffRole; children: ReactNode }) {
  const qc = useQueryClient();
  const nav = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const isAdmin = role === "admin";
  const isHotelCashier = role === "cashier";
  const canSeeBookings = isAdmin || isHotelCashier;
  const canSeeOrderHistory = role !== "kitchen";
  const { data: bookings = [] } = useQuery({
    queryKey: ["bookings"],
    queryFn: () => getBookings(),
    enabled: canSeeBookings,
  });
  const { data: orders = [] } = useQuery({
    queryKey: ["orders"],
    queryFn: getOrders,
    enabled: canSeeOrderHistory,
  });
  useFirestoreRealtime(["bookings"], subscribeToBookings, canSeeBookings);
  useFirestoreRealtime(["orders"], subscribeToOrders, canSeeOrderHistory);
  const pendingBookings = bookings.filter((booking) => booking.status === "pending").length;
  const unpaidOrders = orders.filter(
    (order) =>
      order.status !== "cancelled" &&
      (order.payment_status === "unpaid" ||
        order.payment_status === "partial" ||
        (!order.payment_status && order.status === "pending")),
  ).length;
  const pendingPayments =
    bookings.filter(
      (booking) =>
        booking.status !== "cancelled" &&
        booking.status !== "checked_out" &&
        Number(booking.paid_amount ?? 0) < Number(booking.total),
    ).length + unpaidOrders;
  const links = isAdmin
    ? [
        { to: "/staff", label: "Overview", icon: LayoutDashboard, exact: true },
        { to: "/staff/rooms", label: "Manage Rooms", icon: BedDouble },
        { to: "/staff/menu", label: "Food Menu", icon: UtensilsCrossed },
        { to: "/staff/calendar", label: "Room Calendar", icon: CalendarCheck },
        { to: "/staff/petty-cash", label: "Petty Cash", icon: Wallet },
        { to: "/staff/payments", label: "Track Payments", icon: CreditCard },
        { to: "/staff/bookings", label: "Booking History", icon: CalendarCheck },
        {
          to: "/staff/payments",
          label: "Pending Payments",
          icon: CreditCard,
          badge: pendingPayments,
        },
        { to: "/staff/orders", label: "Order History", icon: Receipt },
        { to: "/staff/settings", label: "Settings", icon: Settings },
        { to: "/staff/pos", label: "Restaurant POS", icon: ShoppingCart },
        { to: "/staff/kitchen", label: "Kitchen Queue", icon: ChefHat },
        { to: "/staff/team", label: "Staff", icon: Users },
      ]
    : isHotelCashier
      ? [
          { to: "/staff", label: "Dashboard", icon: LayoutDashboard, exact: true },
          { to: "/staff/create-booking", label: "Create Booking", icon: Plus },
          {
            to: "/staff/bookings",
            label: "Website Bookings",
            icon: CalendarCheck,
            badge: pendingBookings,
          },
          { to: "/staff/calendar", label: "Room Calendar", icon: CalendarCheck },
          { to: "/staff/payments", label: "Payments", icon: CreditCard },
          { to: "/staff/pos", label: "Restaurant POS", icon: ShoppingCart },
          { to: "/staff/orders", label: "Order History", icon: Receipt, badge: unpaidOrders },
          { to: "/staff/kitchen", label: "Kitchen Queue", icon: ChefHat },
          { to: "/staff/petty-cash", label: "Petty Cash", icon: Wallet },
        ]
      : role === "cashier_restaurant"
        ? [
            { to: "/staff/pos", label: "Restaurant POS", icon: ShoppingCart },
            { to: "/staff/orders", label: "Order History", icon: Receipt, badge: unpaidOrders },
          ]
        : [{ to: "/staff/kitchen", label: "Kitchen Queue", icon: ChefHat }];
  const portalSubtitle = isAdmin
    ? "Admin portal"
    : role === "kitchen"
      ? "Kitchen portal"
      : role === "cashier_restaurant"
        ? "Restaurant portal"
        : "Staff portal";
  async function logout() {
    await qc.cancelQueries();
    qc.clear();
    await signOut(auth);
    nav({ to: "/auth", replace: true });
  }
  return (
    <div className="flex min-h-screen">
      <aside
        className={`hidden shrink-0 flex-col bg-sidebar text-sidebar-foreground transition-[width] md:flex ${
          isAdmin ? (collapsed ? "w-[4.5rem]" : "w-60") : "w-[4.5rem]"
        }`}
      >
        <div
          className={`flex items-center ${collapsed && isAdmin ? "justify-center" : "justify-between"} px-3 py-5`}
        >
          {(!collapsed || !isAdmin) && (
            <Link to="/" className={isAdmin && !collapsed ? "px-2" : ""}>
              <BrandLogo size="staff" subtitle={portalSubtitle} />
            </Link>
          )}
          {isAdmin && (
            <button
              type="button"
              onClick={() => setCollapsed((value) => !value)}
              aria-label={collapsed ? "Expand admin navigation" : "Collapse admin navigation"}
              className="rounded p-2 hover:bg-sidebar-accent"
            >
              {collapsed ? (
                <PanelLeftOpen className="size-4" />
              ) : (
                <PanelLeftClose className="size-4" />
              )}
            </button>
          )}
          {!isAdmin && <span className="sr-only">Staff portal</span>}
        </div>
        <nav className="flex-1 space-y-1 px-2">
          {links.map((link) => {
            const Icon = link.icon;
            const iconOnly = !isAdmin || collapsed;
            return (
              <Link
                key={link.label}
                to={link.to}
                activeOptions={{ exact: !!link.exact }}
                title={iconOnly ? link.label : undefined}
                aria-label={link.label}
                className={`flex items-center rounded-sm py-2.5 text-sm opacity-80 hover:bg-sidebar-accent hover:opacity-100 ${
                  iconOnly ? "justify-center px-2" : "gap-3 px-3"
                }`}
                activeProps={{ className: "bg-sidebar-accent opacity-100 text-sidebar-primary" }}
              >
                <span className="relative">
                  <Icon className="size-4" />
                  {!!link.badge && (
                    <span className="absolute -right-3 -top-3 min-w-4 rounded-full bg-destructive px-1 text-center text-[10px] leading-4 text-destructive-foreground">
                      {link.badge > 99 ? "99+" : link.badge}
                    </span>
                  )}
                </span>
                {!iconOnly && <span className="flex-1">{link.label}</span>}
              </Link>
            );
          })}
        </nav>
        <button
          onClick={logout}
          title={isAdmin && collapsed ? "Sign out" : undefined}
          className={`m-2 flex items-center rounded-sm py-2.5 text-sm opacity-70 hover:bg-sidebar-accent hover:opacity-100 ${
            !isAdmin || collapsed ? "justify-center px-2" : "gap-3 px-3"
          }`}
        >
          <LogOut className="size-4" />
          {isAdmin && !collapsed && "Sign out"}
        </button>
      </aside>
      <div className="flex-1 overflow-x-hidden">
        <Link
          to="/"
          className="flex items-center border-b border-sidebar-border bg-sidebar px-4 py-3 text-sidebar-foreground md:hidden"
        >
          <BrandLogo size="staff" subtitle={portalSubtitle} />
        </Link>
        <div className="flex gap-2 overflow-x-auto bg-sidebar p-3 text-sidebar-foreground md:hidden">
          {links.map((l) => (
            <Link
              key={l.label}
              to={l.to}
              className="whitespace-nowrap px-3 py-1 text-xs"
              activeProps={{ className: "text-sidebar-primary" }}
            >
              {l.label}
              {!!l.badge && <span className="ml-1 text-destructive">({l.badge})</span>}
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
