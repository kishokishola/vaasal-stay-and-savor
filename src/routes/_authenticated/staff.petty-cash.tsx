import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowDownToLine, ArrowUpFromLine, Download } from "lucide-react";
import {
  recordPettyCashTransaction,
  getPettyCash,
  subscribeToPettyCash,
} from "@/lib/firebase-data";
import { useFirestoreRealtime } from "@/hooks/useFirestoreRealtime";
import { hotelToday } from "@/lib/dates";
import { lkr } from "@/lib/hotel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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

export const Route = createFileRoute("/_authenticated/staff/petty-cash")({
  component: PettyCash,
});

function PettyCash() {
  const qc = useQueryClient();
  const [kind, setKind] = useState<"top_up" | "expense">("expense");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [category, setCategory] = useState("Other");
  const [historySearch, setHistorySearch] = useState("");
  const [historyCategory, setHistoryCategory] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [liveError, setLiveError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["petty-cash"],
    queryFn: getPettyCash,
  });
  useFirestoreRealtime(["petty-cash"], subscribeToPettyCash, true, (nextError) =>
    setLiveError(nextError.message),
  );
  useEffect(() => {
    if (data) setLiveError("");
  }, [data]);
  const balance = Number(data?.balance ?? 0);
  const enteredAmount = Number(amount);
  const amountIsValid = Number.isFinite(enteredAmount) && enteredAmount > 0;
  const insufficientBalance = kind === "expense" && amountIsValid && enteredAmount > balance;
  const visibleEntries = (data?.entries ?? []).filter((entry) => {
    const date = hotelToday(new Date(entry.created_at));
    const term = historySearch.trim().toLowerCase();
    return (
      (!term ||
        [entry.reason, entry.category, entry.created_by].some((value) =>
          value.toLowerCase().includes(term),
        )) &&
      (historyCategory === "all" || entry.category === historyCategory) &&
      (!dateFrom || date >= dateFrom) &&
      (!dateTo || date <= dateTo)
    );
  });

  function exportHistory() {
    const rows = [
      ["Date/time", "Type", "Category", "Reason", "Recorded by", "Amount (LKR)"],
      ...visibleEntries.map((entry) => [
        new Date(entry.created_at).toLocaleString(),
        entry.kind,
        entry.category,
        entry.reason,
        entry.created_by,
        entry.amount.toFixed(2),
      ]),
    ];
    const csv = rows
      .map((row) => row.map((value) => `"${value.replaceAll('"', '""')}"`).join(","))
      .join("\r\n");
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "vaasal-petty-cash.csv";
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function submit() {
    setSubmitError("");
    setBusy(true);
    try {
      await recordPettyCashTransaction({
        kind,
        amount: Number(amount),
        reason,
        category,
      });
      setAmount("");
      setReason("");
      await qc.invalidateQueries({ queryKey: ["petty-cash"] });
      toast.success(kind === "top_up" ? "Petty cash replenished." : "Expense recorded.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not update petty cash.";
      setSubmitError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="eyebrow">Restaurant</div>
      <h1 className="mt-2 text-4xl">Petty cash</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        Add funds before recording expenses. Each entry updates the balance and the live ledger
        together; balances cannot go below zero.
      </p>
      {liveError && (
        <div role="alert" className="mt-4 rounded border border-destructive/40 p-4 text-sm">
          Live petty-cash updates stopped: {liveError}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="ml-3"
            onClick={() => void refetch()}
          >
            Reload balance
          </Button>
        </div>
      )}
      {isError && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          Petty cash could not be loaded: {error.message}
        </p>
      )}
      {!isLoading && !isError && balance === 0 && (
        <p
          role="status"
          className="mt-4 rounded-sm border border-primary/30 bg-primary/5 p-4 text-sm"
        >
          Petty-cash balance is LKR 0.00. Select “Add funds” to record the opening cash amount
          before you enter expenses.
        </p>
      )}
      <div className="mt-6 bg-card p-6 shadow-luxe">
        <div className="text-xs uppercase tracking-widest text-muted-foreground">
          Current balance
        </div>
        <div className="mt-2 font-display text-3xl text-primary">
          {isLoading ? "Loading…" : lkr(balance)}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Realtime balance from the audited top-up and expense ledger.
        </p>
      </div>
      <form
        className="mt-6 bg-card p-6 shadow-luxe"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <h2 className="font-display text-2xl">Record a transaction</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div>
            <Label>Transaction type</Label>
            <Select
              value={kind}
              onValueChange={(value) => {
                if (value === "top_up" || value === "expense") setKind(value);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="expense">Expense</SelectItem>
                <SelectItem value="top_up">Add funds</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="petty-cash-amount">Amount (LKR)</Label>
            <Input
              id="petty-cash-amount"
              type="number"
              min="0.01"
              max="10000000"
              step="0.01"
              value={amount}
              required
              onChange={(event) => setAmount(event.target.value)}
            />
          </div>
          <div>
            <Label>Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["Food supplies", "Cleaning", "Transport", "Maintenance", "Office", "Other"].map(
                  (item) => (
                    <SelectItem key={item} value={item}>
                      {item}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="petty-cash-reason">Reason / note</Label>
            <Input
              id="petty-cash-reason"
              maxLength={255}
              required
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </div>
        </div>
        {insufficientBalance && (
          <p role="alert" className="mt-3 text-sm text-destructive">
            This expense is above the current balance of {lkr(balance)}. Change the type to “Add
            funds” first, or enter a smaller expense.
          </p>
        )}
        {submitError && (
          <p role="alert" className="mt-3 text-sm text-destructive">
            Transaction was not saved: {submitError}
          </p>
        )}
        <Button
          type="submit"
          className="mt-4"
          disabled={busy || !amountIsValid || !reason.trim() || insufficientBalance}
        >
          {kind === "top_up" ? <ArrowDownToLine /> : <ArrowUpFromLine />}
          {busy ? "Saving…" : kind === "top_up" ? "Add funds" : "Record expense"}
        </Button>
      </form>
      <section className="mt-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="font-display text-2xl">Transaction history</h2>
          <Button variant="outline" onClick={exportHistory}>
            <Download /> Export CSV
          </Button>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Input
            aria-label="Search petty cash history"
            placeholder="Search note, category or staff"
            value={historySearch}
            onChange={(event) => setHistorySearch(event.target.value)}
          />
          <Select value={historyCategory} onValueChange={setHistoryCategory}>
            <SelectTrigger aria-label="Filter petty cash by category">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {[...new Set(data?.entries.map((entry) => entry.category) ?? [])]
                .sort((a, b) => a.localeCompare(b))
                .map((item) => (
                  <SelectItem key={item} value={item}>
                    {item}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <Input
            aria-label="Petty cash from date"
            type="date"
            value={dateFrom}
            onChange={(event) => setDateFrom(event.target.value)}
          />
          <Input
            aria-label="Petty cash to date"
            type="date"
            value={dateTo}
            onChange={(event) => setDateTo(event.target.value)}
          />
        </div>
        <div className="mt-4 grid gap-3 md:hidden">
          {isLoading && (
            <p className="bg-card p-4 text-sm text-muted-foreground">Loading ledger…</p>
          )}
          {isError && (
            <p role="alert" className="bg-card p-4 text-sm text-destructive">
              {error instanceof Error ? error.message : "Could not load petty cash history."}
            </p>
          )}
          {!isLoading && !isError && !visibleEntries.length && (
            <p className="bg-card p-4 text-sm text-muted-foreground">
              No petty cash entries match these filters.
            </p>
          )}
          {visibleEntries.map((entry) => (
            <article key={entry.id} className="rounded-sm bg-card p-4 shadow-luxe">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-medium">{entry.category}</div>
                  <time className="mt-1 block text-xs text-muted-foreground">
                    {new Date(entry.created_at).toLocaleString()}
                  </time>
                </div>
                <Badge variant={entry.kind === "expense" ? "destructive" : "secondary"}>
                  {entry.kind.replace("_", " ")}
                </Badge>
              </div>
              <p className="mt-3 break-words text-sm">{entry.reason}</p>
              <div className="mt-3 flex items-center justify-between gap-3 border-t border-border pt-3">
                <span className="min-w-0 break-all text-xs text-muted-foreground">
                  {entry.created_by}
                </span>
                <span className="shrink-0 font-medium">
                  {entry.kind === "expense" ? "− " : "+ "}
                  {lkr(entry.amount)}
                </span>
              </div>
            </article>
          ))}
        </div>
        <div className="mt-4 hidden overflow-x-auto bg-card shadow-luxe md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date / time</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Recorded by</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={6}>Loading ledger…</TableCell>
                </TableRow>
              )}
              {isError && (
                <TableRow>
                  <TableCell colSpan={6} role="alert" className="text-destructive">
                    {error instanceof Error ? error.message : "Could not load petty cash history."}
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && !isError && !visibleEntries.length && (
                <TableRow>
                  <TableCell colSpan={6} className="text-muted-foreground">
                    No petty cash entries match these filters.
                  </TableCell>
                </TableRow>
              )}
              {visibleEntries.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="text-sm">
                    {new Date(entry.created_at).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <Badge variant={entry.kind === "expense" ? "destructive" : "secondary"}>
                      {entry.kind.replace("_", " ")}
                    </Badge>
                  </TableCell>
                  <TableCell>{entry.category}</TableCell>
                  <TableCell>{entry.reason}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {entry.created_by}
                  </TableCell>
                  <TableCell className="text-right">
                    {entry.kind === "expense" ? "− " : "+ "}
                    {lkr(entry.amount)}
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
