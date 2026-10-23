import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
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
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["petty-cash"],
    queryFn: getPettyCash,
  });
  useFirestoreRealtime(["petty-cash"], subscribeToPettyCash);
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
      toast.error(error instanceof Error ? error.message : "Could not update petty cash.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="eyebrow">Restaurant</div>
      <h1 className="mt-2 text-4xl">Petty cash</h1>
      <div className="mt-6 bg-card p-6 shadow-luxe">
        <div className="text-xs uppercase tracking-widest text-muted-foreground">
          Current balance
        </div>
        <div className="mt-2 font-display text-3xl text-primary">{lkr(data?.balance ?? 0)}</div>
        <p className="mt-1 text-xs text-muted-foreground">
          Realtime balance from the audited top-up and expense ledger.
        </p>
      </div>
      <section className="mt-6 bg-card p-6 shadow-luxe">
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
              step="0.01"
              value={amount}
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
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </div>
        </div>
        <Button
          className="mt-4"
          disabled={busy || !amount || !reason.trim()}
          onClick={() => void submit()}
        >
          {kind === "top_up" ? <ArrowDownToLine /> : <ArrowUpFromLine />}
          {busy ? "Saving…" : kind === "top_up" ? "Add funds" : "Record expense"}
        </Button>
      </section>
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
        <div className="mt-4 overflow-x-auto bg-card shadow-luxe">
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
