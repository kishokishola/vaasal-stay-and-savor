import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useFirestoreRealtime } from "@/hooks/useFirestoreRealtime";
import {
  getBookings,
  getCashDeposits,
  getOrders,
  getPettyCash,
  recordCashDeposit,
  subscribeToBookings,
  subscribeToCashDeposits,
  subscribeToOrders,
  subscribeToPettyCash,
  type Booking,
  type Order,
} from "@/lib/firebase-data";
import { hotelToday } from "@/lib/dates";
import { collectedOrderAmount, lkr, rateAmount } from "@/lib/hotel";

export const Route = createFileRoute("/_authenticated/staff/funds")({
  component: Funds,
});

type PaymentRow = {
  at: string;
  method: string;
  source: "Room booking" | "Restaurant";
  currency: "LKR" | "USD";
  amount: number;
};

function bookingPayments(booking: Booking): PaymentRow[] {
  const history = booking.payment_history ?? [];
  if (history.length) {
    return history.map((payment) => ({
      at: payment.at,
      method: payment.method,
      source: "Room booking",
      currency: booking.rate_currency === "USD" ? "USD" : "LKR",
      amount: Number(payment.amount),
    }));
  }
  const paid = Number(booking.paid_amount ?? 0);
  if (!paid || !booking.created_at) return [];
  return [
    {
      at: booking.created_at,
      method: "recorded",
      source: "Room booking",
      currency: booking.rate_currency === "USD" ? "USD" : "LKR",
      amount: paid,
    },
  ];
}

function orderPayments(order: Order): PaymentRow[] {
  if (order.status === "cancelled" || order.payment_status === "refunded") return [];
  const history = order.payment_history ?? [];
  if (history.length) {
    return history.map((payment) => ({
      at: payment.at,
      method: payment.method,
      source: "Restaurant",
      currency: order.price_currency ?? "LKR",
      amount: Number(payment.amount),
    }));
  }
  const paid = collectedOrderAmount(order);
  if (!paid) return [];
  return [
    {
      at: order.created_at,
      method: order.payment_method || "recorded",
      source: "Restaurant",
      currency: order.price_currency ?? "LKR",
      amount: paid,
    },
  ];
}

function csvCell(value: string | number) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function exportCsv(filename: string, rows: (string | number)[][]) {
  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Funds() {
  const today = hotelToday();
  const qc = useQueryClient();
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [methodFilter, setMethodFilter] = useState("all");
  const [depositDate, setDepositDate] = useState(today);
  const [depositAmount, setDepositAmount] = useState("");
  const [depositNotes, setDepositNotes] = useState("");
  const [depositBusy, setDepositBusy] = useState(false);
  const {
    data: bookings,
    isLoading: bookingsLoading,
    isError: bookingsError,
    error: bookingError,
  } = useQuery({ queryKey: ["bookings"], queryFn: () => getBookings() });
  const {
    data: orders,
    isLoading: ordersLoading,
    isError: ordersError,
    error: orderError,
  } = useQuery({ queryKey: ["orders"], queryFn: getOrders });
  const {
    data: pettyCash,
    isLoading: pettyCashLoading,
    isError: pettyCashError,
    error: pettyCashLoadError,
  } = useQuery({ queryKey: ["petty-cash"], queryFn: getPettyCash });
  const {
    data: deposits,
    isLoading: depositsLoading,
    isError: depositsError,
    error: depositsLoadError,
  } = useQuery({ queryKey: ["cash-deposits"], queryFn: getCashDeposits });
  useFirestoreRealtime(["bookings"], subscribeToBookings);
  useFirestoreRealtime(["orders"], subscribeToOrders);
  useFirestoreRealtime(["petty-cash"], subscribeToPettyCash);
  useFirestoreRealtime(["cash-deposits"], subscribeToCashDeposits);

  const invalidRange = from > to;
  const report = useMemo(() => {
    if (invalidRange) return null;
    const start = new Date(`${from}T00:00:00+05:30`).getTime();
    const end = new Date(`${to}T00:00:00+05:30`).getTime() + 24 * 60 * 60 * 1000;
    const allPayments = [
      ...(bookings ?? [])
        .filter((booking) => booking.status !== "cancelled")
        .flatMap(bookingPayments),
      ...(orders ?? []).flatMap(orderPayments),
    ];
    const isInRange = (payment: PaymentRow, rangeStart: number, rangeEnd: number) => {
      const timestamp = Date.parse(payment.at);
      return Number.isFinite(timestamp) && timestamp >= rangeStart && timestamp < rangeEnd;
    };
    const inRange = (payment: PaymentRow, rangeStart: number, rangeEnd: number) =>
      isInRange(payment, rangeStart, rangeEnd) &&
      (methodFilter === "all" || payment.method === methodFilter);
    const payments = allPayments.filter((payment) => inRange(payment, start, end));
    const duration = end - start;
    const previousStart = start - duration;
    const previousPayments = allPayments.filter((payment) =>
      inRange(payment, previousStart, start),
    );
    const expenseRows = (pettyCash?.entries ?? []).filter((entry) => {
      const timestamp = Date.parse(entry.created_at);
      return entry.kind === "expense" && Number.isFinite(timestamp);
    });
    const expenses = expenseRows.filter((entry) => {
      const timestamp = Date.parse(entry.created_at);
      return timestamp >= start && timestamp < end;
    });
    const previousExpenses = expenseRows.filter((entry) => {
      const timestamp = Date.parse(entry.created_at);
      return timestamp >= previousStart && timestamp < start;
    });
    const cashReceivedLkr = allPayments
      .filter(
        (payment) =>
          payment.currency === "LKR" && payment.method === "cash" && isInRange(payment, start, end),
      )
      .reduce((sum, payment) => sum + payment.amount, 0);
    const depositRows = deposits ?? [];
    const depositsInRange = depositRows.filter(
      (deposit) => deposit.deposit_date >= from && deposit.deposit_date <= to,
    );
    const previousDeposits = depositRows.filter((deposit) => {
      const date = new Date(`${deposit.deposit_date}T00:00:00+05:30`).getTime();
      return date >= previousStart && date < start;
    });
    const depositedLkr = depositsInRange.reduce((sum, deposit) => sum + Number(deposit.amount), 0);
    const previousDepositedLkr = previousDeposits.reduce(
      (sum, deposit) => sum + Number(deposit.amount),
      0,
    );
    const roomLkr = payments
      .filter((payment) => payment.source === "Room booking" && payment.currency === "LKR")
      .reduce((sum, payment) => sum + payment.amount, 0);
    const roomUsd = payments
      .filter((payment) => payment.source === "Room booking" && payment.currency === "USD")
      .reduce((sum, payment) => sum + payment.amount, 0);
    const restaurantLkr = payments
      .filter((payment) => payment.source === "Restaurant" && payment.currency === "LKR")
      .reduce((sum, payment) => sum + payment.amount, 0);
    const restaurantUsd = payments
      .filter((payment) => payment.source === "Restaurant" && payment.currency === "USD")
      .reduce((sum, payment) => sum + payment.amount, 0);
    const expensesLkr = expenses.reduce((sum, entry) => sum + Number(entry.amount), 0);
    const previousRoomLkr = previousPayments
      .filter((payment) => payment.source === "Room booking" && payment.currency === "LKR")
      .reduce((sum, payment) => sum + payment.amount, 0);
    const previousRestaurantLkr = previousPayments
      .filter((payment) => payment.source === "Restaurant" && payment.currency === "LKR")
      .reduce((sum, payment) => sum + payment.amount, 0);
    const previousExpensesLkr = previousExpenses.reduce(
      (sum, entry) => sum + Number(entry.amount),
      0,
    );
    const daily = new Map<
      string,
      {
        room: number;
        restaurant: number;
        cashReceived: number;
        expenses: number;
        deposited: number;
      }
    >();
    for (const payment of payments) {
      if (payment.currency !== "LKR") continue;
      const date = hotelToday(new Date(payment.at));
      const day = daily.get(date) ?? {
        room: 0,
        restaurant: 0,
        cashReceived: 0,
        expenses: 0,
        deposited: 0,
      };
      if (payment.source === "Room booking") day.room += payment.amount;
      else day.restaurant += payment.amount;
      daily.set(date, day);
    }
    for (const payment of allPayments) {
      if (
        payment.currency !== "LKR" ||
        payment.method !== "cash" ||
        !isInRange(payment, start, end)
      )
        continue;
      const date = hotelToday(new Date(payment.at));
      const day = daily.get(date) ?? {
        room: 0,
        restaurant: 0,
        cashReceived: 0,
        expenses: 0,
        deposited: 0,
      };
      day.cashReceived += payment.amount;
      daily.set(date, day);
    }
    for (const entry of expenses) {
      const date = hotelToday(new Date(entry.created_at));
      const day = daily.get(date) ?? {
        room: 0,
        restaurant: 0,
        cashReceived: 0,
        expenses: 0,
        deposited: 0,
      };
      day.expenses += Number(entry.amount);
      daily.set(date, day);
    }
    for (const deposit of depositsInRange) {
      const day = daily.get(deposit.deposit_date) ?? {
        room: 0,
        restaurant: 0,
        cashReceived: 0,
        expenses: 0,
        deposited: 0,
      };
      day.deposited += Number(deposit.amount);
      daily.set(deposit.deposit_date, day);
    }
    const paymentMix = new Map<string, number>();
    for (const payment of payments) {
      const key = `${payment.method} · ${payment.source}${payment.currency === "USD" ? " (USD)" : ""}`;
      paymentMix.set(key, (paymentMix.get(key) ?? 0) + payment.amount);
    }
    const categoryTotals = new Map<string, number>();
    for (const entry of expenses) {
      categoryTotals.set(
        entry.category,
        (categoryTotals.get(entry.category) ?? 0) + Number(entry.amount),
      );
    }
    return {
      payments,
      roomLkr,
      roomUsd,
      restaurantLkr,
      restaurantUsd,
      expensesLkr,
      netLkr: roomLkr + restaurantLkr - expensesLkr,
      netUsd: roomUsd + restaurantUsd,
      cashReceivedLkr,
      depositedLkr,
      cashInHandLkr: cashReceivedLkr - depositedLkr,
      previousNetLkr: previousRoomLkr + previousRestaurantLkr - previousExpensesLkr,
      previousDepositedLkr,
      daily: [...daily.entries()].sort(([a], [b]) => a.localeCompare(b)),
      paymentMix: [...paymentMix.entries()].sort((a, b) => b[1] - a[1]),
      categoryTotals: [...categoryTotals.entries()].sort((a, b) => b[1] - a[1]),
    };
  }, [bookings, deposits, from, invalidRange, methodFilter, orders, pettyCash?.entries, to]);
  const loading = bookingsLoading || ordersLoading || pettyCashLoading || depositsLoading;
  const loadError = bookingsError
    ? bookingError
    : ordersError
      ? orderError
      : pettyCashError
        ? pettyCashLoadError
        : depositsError
          ? depositsLoadError
          : null;
  const availableMethods = [
    ...new Set(
      [
        ...(bookings ?? []).flatMap((booking) => bookingPayments(booking).map((row) => row.method)),
        ...(orders ?? []).flatMap((order) => orderPayments(order).map((row) => row.method)),
      ].filter(Boolean),
    ),
  ].sort();

  async function submitDeposit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setDepositBusy(true);
    try {
      await recordCashDeposit({
        deposit_date: depositDate,
        amount: Number(depositAmount),
        notes: depositNotes,
      });
      setDepositAmount("");
      setDepositNotes("");
      await qc.invalidateQueries({ queryKey: ["cash-deposits"] });
      toast.success("Cash deposit recorded.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not record cash deposit.");
    } finally {
      setDepositBusy(false);
    }
  }

  return (
    <div>
      <div className="eyebrow">Accounts</div>
      <h1 className="mt-2 text-4xl">Manage funds</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Realtime collections and recorded petty-cash expenses. Room and restaurant payments remain
        separated by currency.
      </p>
      <div className="mt-6 flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="funds-from" className="text-xs text-muted-foreground">
            From
          </label>
          <Input
            id="funds-from"
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
          />
        </div>
        <div>
          <label htmlFor="funds-to" className="text-xs text-muted-foreground">
            To
          </label>
          <Input
            id="funds-to"
            type="date"
            value={to}
            onChange={(event) => setTo(event.target.value)}
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Payment method</label>
          <Select value={methodFilter} onValueChange={setMethodFilter}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All methods</SelectItem>
              {availableMethods.map((method) => (
                <SelectItem key={method} value={method}>
                  {method.replaceAll("_", " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          variant="outline"
          disabled={!report}
          onClick={() =>
            report &&
            exportCsv("vaasal-fund-report.csv", [
              [
                "Date",
                "Room collections (LKR)",
                "Restaurant collections (LKR)",
                "Cash received (LKR)",
                "Expenses (LKR)",
                "Deposited (LKR)",
                "Cash in hand (LKR)",
              ],
              ...report.daily.map(([date, totals]) => [
                date,
                totals.room.toFixed(2),
                totals.restaurant.toFixed(2),
                totals.cashReceived.toFixed(2),
                totals.expenses.toFixed(2),
                totals.deposited.toFixed(2),
                (totals.cashReceived - totals.deposited).toFixed(2),
              ]),
              [],
              ["Payment method and source", "Collected"],
              ...report.paymentMix.map(([name, amount]) => [name, amount.toFixed(2)]),
              [],
              ["Expense category", "Spent (LKR)"],
              ...report.categoryTotals.map(([name, amount]) => [name, amount.toFixed(2)]),
            ])
          }
        >
          <Download />
          Export CSV
        </Button>
      </div>
      {invalidRange && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          The start date must be on or before the end date.
        </p>
      )}
      {loadError && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          Fund data could not be loaded: {loadError.message}
        </p>
      )}
      {loading && <p className="mt-4 text-sm text-muted-foreground">Loading live fund data…</p>}
      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {[
          ["Room collections · LKR", report ? lkr(report.roomLkr) : "–"],
          ["Room collections · USD", report ? rateAmount(report.roomUsd, "USD") : "–"],
          ["Restaurant collections · LKR", report ? lkr(report.restaurantLkr) : "–"],
          ["Restaurant collections · USD", report ? rateAmount(report.restaurantUsd, "USD") : "–"],
          ["Petty-cash expenses", report ? lkr(report.expensesLkr) : "–"],
          ["Net collections · LKR", report ? lkr(report.netLkr) : "–"],
          ["Net collections · USD", report ? rateAmount(report.netUsd, "USD") : "–"],
          ["Cash deposited", report ? lkr(report.depositedLkr) : "–"],
          ["Balance in hand", report ? lkr(report.cashInHandLkr) : "–"],
        ].map(([label, value]) => (
          <div key={label} className="bg-card p-5 shadow-luxe">
            <div className="text-xs uppercase tracking-widest text-muted-foreground">{label}</div>
            <div className="mt-2 font-display text-2xl text-primary">{value}</div>
          </div>
        ))}
      </div>
      <section className="mt-8 grid gap-6 xl:grid-cols-2">
        <div className="overflow-x-auto bg-card p-5 shadow-luxe">
          <h2 className="font-display text-xl">Daily fund movement</h2>
          <Table className="mobile-card-table">
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Rooms</TableHead>
                <TableHead>Restaurant</TableHead>
                <TableHead>Cash received</TableHead>
                <TableHead>Expenses</TableHead>
                <TableHead>Deposited</TableHead>
                <TableHead>In hand</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!loading && report?.daily.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7}>No LKR transactions in this period.</TableCell>
                </TableRow>
              )}
              {report?.daily.map(([date, totals]) => (
                <TableRow key={date}>
                  <TableCell data-label="Date">{date}</TableCell>
                  <TableCell data-label="Rooms">{lkr(totals.room)}</TableCell>
                  <TableCell data-label="Restaurant">{lkr(totals.restaurant)}</TableCell>
                  <TableCell data-label="Cash received">{lkr(totals.cashReceived)}</TableCell>
                  <TableCell data-label="Expenses">{lkr(totals.expenses)}</TableCell>
                  <TableCell data-label="Deposited">{lkr(totals.deposited)}</TableCell>
                  <TableCell data-label="In hand">
                    {lkr(totals.cashReceived - totals.deposited)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div className="overflow-x-auto bg-card p-5 shadow-luxe">
          <h2 className="font-display text-xl">Collections by payment method</h2>
          <Table className="mobile-card-table">
            <TableHeader>
              <TableRow>
                <TableHead>Method · source</TableHead>
                <TableHead className="text-right">Collected</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!loading && report?.paymentMix.length === 0 && (
                <TableRow>
                  <TableCell colSpan={2}>No collections in this period.</TableCell>
                </TableRow>
              )}
              {report?.paymentMix.map(([method, amount]) => (
                <TableRow key={method}>
                  <TableCell data-label="Method · source" className="capitalize">
                    {method.replaceAll("_", " ")}
                  </TableCell>
                  <TableCell data-label="Collected" className="text-right">
                    {method.endsWith("(USD)") ? rateAmount(amount, "USD") : lkr(amount)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div className="overflow-x-auto bg-card p-5 shadow-luxe">
          <h2 className="font-display text-xl">Petty cash by category</h2>
          <Table className="mobile-card-table">
            <TableHeader>
              <TableRow>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Spent</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!loading && report?.categoryTotals.length === 0 && (
                <TableRow>
                  <TableCell colSpan={2}>No expenses in this period.</TableCell>
                </TableRow>
              )}
              {report?.categoryTotals.map(([category, amount]) => (
                <TableRow key={category}>
                  <TableCell data-label="Category">{category}</TableCell>
                  <TableCell data-label="Spent" className="text-right">
                    {lkr(amount)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>
      <section className="mt-8 grid gap-6 xl:grid-cols-2">
        <div className="bg-card p-5 shadow-luxe">
          <h2 className="font-display text-xl">Cash deposits</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Deposits are cash movements, not additional income. The in-hand total compares cash
            receipts with recorded deposits.
          </p>
          <form onSubmit={submitDeposit} className="mt-4 grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="cash-deposit-date" className="text-xs text-muted-foreground">
                Deposit date
              </label>
              <Input
                id="cash-deposit-date"
                type="date"
                required
                value={depositDate}
                onChange={(event) => setDepositDate(event.target.value)}
              />
            </div>
            <div>
              <label htmlFor="cash-deposit-amount" className="text-xs text-muted-foreground">
                Amount (LKR)
              </label>
              <Input
                id="cash-deposit-amount"
                type="number"
                min="0.01"
                max="10000000"
                step="0.01"
                required
                value={depositAmount}
                onChange={(event) => setDepositAmount(event.target.value)}
              />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="cash-deposit-notes" className="text-xs text-muted-foreground">
                Notes
              </label>
              <Input
                id="cash-deposit-notes"
                maxLength={255}
                value={depositNotes}
                onChange={(event) => setDepositNotes(event.target.value)}
              />
            </div>
            <Button type="submit" disabled={depositBusy} className="sm:col-span-2 sm:w-fit">
              {depositBusy ? "Saving…" : "Record deposit"}
            </Button>
          </form>
        </div>
        <div className="overflow-x-auto bg-card p-5 shadow-luxe">
          <h2 className="font-display text-xl">Previous-period comparison</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Compares the selected period with the immediately preceding period of equal length.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <div className="text-xs uppercase tracking-widest text-muted-foreground">
                Selected-period net
              </div>
              <div className="mt-2 font-display text-2xl text-primary">
                {report ? lkr(report.netLkr) : "–"}
              </div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-widest text-muted-foreground">
                Previous-period net
              </div>
              <div className="mt-2 font-display text-2xl">
                {report ? lkr(report.previousNetLkr) : "–"}
              </div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-widest text-muted-foreground">
                Cash deposited · previous period
              </div>
              <div className="mt-2 font-display text-xl">
                {report ? lkr(report.previousDepositedLkr) : "–"}
              </div>
            </div>
          </div>
        </div>
        <div className="overflow-x-auto bg-card p-5 shadow-luxe xl:col-span-2">
          <h2 className="font-display text-xl">Deposit history</h2>
          <Table className="mobile-card-table">
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Recorded by</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {depositsLoading && (
                <TableRow>
                  <TableCell colSpan={4}>Loading deposits…</TableCell>
                </TableRow>
              )}
              {!depositsLoading && !depositsError && !deposits?.length && (
                <TableRow>
                  <TableCell colSpan={4}>No deposits recorded yet.</TableCell>
                </TableRow>
              )}
              {deposits?.map((deposit) => (
                <TableRow key={deposit.id}>
                  <TableCell data-label="Date">{deposit.deposit_date}</TableCell>
                  <TableCell data-label="Recorded by">{deposit.deposited_by}</TableCell>
                  <TableCell data-label="Notes">{deposit.notes || "—"}</TableCell>
                  <TableCell data-label="Amount" className="text-right">
                    {lkr(deposit.amount)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
}
