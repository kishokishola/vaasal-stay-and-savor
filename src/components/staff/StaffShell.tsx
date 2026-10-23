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
  BarChart3,
  ClipboardList,
  PanelLeftClose,
  PanelLeftOpen,
  Menu,
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
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

export function StaffShell({ role, children }: { role: StaffRole; children: ReactNode }) {
  const qc = useQueryClient();
  const nav = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const isAdmin = role === "admin";
  const isHotelCashier = role === "cashier";
  const canSeeBookings = isAdmin || isHotelCashier;
  const canSeeOrderHistory = true;
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
        { to: "/staff", label: "Dashboard", icon: LayoutDashboard, exact: true },
        { to: "/staff/rooms", label: "Manage Rooms", icon: BedDouble },
        { to: "/staff/menu", label: "Food Menu", icon: UtensilsCrossed },
        { to: "/staff/calendar", label: "Room Calendar", icon: CalendarCheck },
        { to: "/staff/petty-cash", label: "Petty Cash", icon: Wallet },
        { to: "/staff/funds", label: "Track Payments", icon: CreditCard },
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
          { to: "/staff/cashier", label: "Dashboard", icon: LayoutDashboard, exact: true },
          { to: "/staff/create-booking", label: "Create Booking", icon: Plus },
          {
            to: "/staff/bookings",
            label: "Website Bookings",
            icon: CalendarCheck,
            badge: pendingBookings,
          },
          { to: "/staff/calendar", label: "Room Calendar", icon: CalendarCheck },
          { to: "/staff/payments", label: "Payments", icon: CreditCard },
          { to: "/staff/pos", label: "Food Orders", icon: ShoppingCart },
          { to: "/staff/orders", label: "Order History", icon: Receipt, badge: unpaidOrders },
          {
            to: "/staff/orders",
            hash: () => "order-queue",
            label: "Order Queue",
            icon: ClipboardList,
            badge: unpaidOrders,
          },
          {
            to: "/staff/orders",
            hash: () => "restaurant-reports",
            label: "Sales Reports",
            icon: BarChart3,
          },
          { to: "/staff/petty-cash", label: "Petty Cash", icon: Wallet },
        ]
      : [];
  const portalSubtitle = isAdmin ? "Admin portal" : "Cashier portal";
  async function logout() {
    await qc.cancelQueries();
    qc.clear();
    await signOut(auth);
    nav({ to: "/auth", replace: true });
  }
  return (
    <div className="flex min-h-screen">
      <aside
        className={`hidden shrink-0 flex-col border-r border-sidebar-border/60 bg-sidebar/90 text-sidebar-foreground shadow-luxe backdrop-blur-xl transition-[width] md:flex ${
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
            const hashOption = "hash" in link ? { hash: link.hash } : {};
            return (
              <Link
                key={link.label}
                to={link.to}
                {...hashOption}
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
        <div className="flex items-center justify-between border-b border-sidebar-border/60 bg-sidebar/90 px-4 py-3 text-sidebar-foreground shadow-luxe backdrop-blur-xl md:hidden">
          <Link to="/" aria-label="Vaasal Villa home">
            <BrandLogo size="staff" subtitle={portalSubtitle} />
          </Link>
          <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Open staff navigation">
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent
              side="left"
              className="w-[min(88vw,20rem)] overflow-y-auto bg-sidebar text-sidebar-foreground"
            >
              <SheetTitle className="mb-6 pr-8 text-left text-sidebar-primary">
                {portalSubtitle}
              </SheetTitle>
              <nav aria-label="Staff navigation" className="space-y-1">
                {links.map((link) => {
                  const Icon = link.icon;
                  const hashOption = "hash" in link ? { hash: link.hash } : {};
                  return (
                    <SheetClose asChild key={link.label}>
                      <Link
                        to={link.to}
                        {...hashOption}
                        activeOptions={{ exact: !!link.exact }}
                        className="flex min-h-11 items-center gap-3 rounded-sm px-3 py-2.5 text-sm opacity-85 hover:bg-sidebar-accent hover:opacity-100"
                        activeProps={{
                          className: "bg-sidebar-accent text-sidebar-primary opacity-100",
                        }}
                      >
                        <span className="relative">
                          <Icon className="size-4" />
                          {!!link.badge && (
                            <span className="absolute -right-3 -top-3 min-w-4 rounded-full bg-destructive px-1 text-center text-[10px] leading-4 text-destructive-foreground">
                              {link.badge > 99 ? "99+" : link.badge}
                            </span>
                          )}
                        </span>
                        <span className="flex-1">{link.label}</span>
                      </Link>
                    </SheetClose>
                  );
                })}
              </nav>
              <Button
                variant="ghost"
                className="mt-5 w-full justify-start gap-3 px-3"
                onClick={() => {
                  setMobileNavOpen(false);
                  void logout();
                }}
              >
                <LogOut className="size-4" />
                Sign out
              </Button>
            </SheetContent>
          </Sheet>
        </div>
        <div className="p-6 md:p-10">{children}</div>
      </div>
    </div>
  );
}
