"use client";

import { useEffect, useMemo, useReducer, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertDialog,
  AlertDialogBackdrop,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogPortal,
  AlertDialogTitle,
  AlertDialogTrigger,
  AlertDialogViewport,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogBackdrop,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogPortal,
  DialogTitle,
  DialogViewport,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress, ProgressIndicator, ProgressTrack } from "@/components/ui/progress";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import type { AccountView, CredentialFieldView, HistorySnapshot, ProviderView } from "@/lib/types";
import { compactNumber, localDateTime, monogram, windowValueText } from "@/lib/format";
import {
  dailySeries,
  latestDaySeries,
  parseModelUsage,
  peakHour,
  type ModelUsage,
  type UsagePoint,
} from "@/lib/model-usage";

/** Recharts Tooltip 共用样式：走 tokens，亮暗自动适配。 */
const tooltipStyle = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-md)",
  color: "var(--popover-foreground)",
} as const;

export default function AccountDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const t = useTranslations();
  const router = useRouter();
  const [account, setAccount] = useState<AccountView | null>(null);
  const [history, setHistory] = useState<HistorySnapshot[] | null>(null);
  const [providers, setProviders] = useState<ProviderView[]>([]);
  const [editOpen, setEditOpen] = useState(false);
  const [refreshVersion, requestRefresh] = useReducer((version: number) => version + 1, 0);

  useEffect(() => {
    let ignore = false;

    async function load() {
      const [accountsRes, historyRes, providersRes] = await Promise.all([
        fetch("/api/accounts"),
        fetch(`/api/accounts/${id}/snapshots`),
        fetch("/api/providers"),
      ]);
      if (accountsRes.ok) {
        const data = (await accountsRes.json()) as { accounts: AccountView[] };
        if (!ignore) setAccount(data.accounts.find((item) => item.id === id) ?? null);
      }
      if (historyRes.ok) {
        const data = (await historyRes.json()) as { snapshots: HistorySnapshot[] };
        if (!ignore) setHistory(data.snapshots);
      }
      if (providersRes.ok) {
        const data = (await providersRes.json()) as { providers: ProviderView[] };
        if (!ignore) setProviders(data.providers);
      }
    }

    void load();
    return () => {
      ignore = true;
    };
  }, [id, refreshVersion]);

  const remove = async () => {
    await fetch(`/api/accounts/${id}`, { method: "DELETE" });
    router.push("/");
    router.refresh();
  };

  // 图表序列：每窗口 kind 一条 remainingPct 折线 + 余额折线
  const chartData = useMemo(() => {
    if (!history) return [];
    return history.map((snap) => {
      const point: Record<string, string | number | null> = {
        time: snap.fetchedAt,
        timeLabel: new Date(snap.fetchedAt).toLocaleString(),
      };
      for (const w of snap.windows ?? []) {
        point[seriesKey(w.kind, w.label)] = w.remainingPct ?? null;
      }
      if (snap.balance) point.__balance = snap.balance.amount;
      return point;
    });
  }, [history]);

  if (!account) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  const display = account.lastOkSnapshot ?? account.latestSnapshot;
  // raw 列形状：{ meta: 适配器 meta, responses: 调试切片 }（见 schema.ts 注释）
  const raw = display?.meta as { meta?: { modelUsage?: unknown } } | null | undefined;
  const usage = parseModelUsage(raw?.meta?.modelUsage);
  const seriesNames = collectSeriesNames(history ?? []);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" render={<Link href="/" />}>
          ← {t("detail.back")}
        </Button>
        <span className="flex size-9 items-center justify-center rounded-lg bg-muted font-heading text-sm font-semibold text-muted-foreground">
          {monogram(account.providerName)}
        </span>
        <div className="min-w-0">
          <h1 className="truncate font-heading text-xl font-semibold tracking-tight">{account.providerName}</h1>
          <p className="truncate text-xs text-muted-foreground">{account.label}</p>
        </div>
        <div className="ms-auto flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            {t("detail.edit")}
          </Button>
          <AlertDialog>
            <AlertDialogTrigger render={<Button variant="destructive" size="sm" />}>
              {t("detail.delete")}
            </AlertDialogTrigger>
            <AlertDialogPortal>
              <AlertDialogBackdrop />
              <AlertDialogViewport>
                <AlertDialogPopup>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t("detail.deleteConfirmTitle")}</AlertDialogTitle>
                    <AlertDialogDescription>{t("detail.deleteConfirmBody")}</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogClose>{t("detail.cancel")}</AlertDialogClose>
                    <AlertDialogClose
                      className="bg-destructive text-white hover:bg-destructive/90"
                      onClick={remove}
                    >
                      {t("detail.deleteConfirmOk")}
                    </AlertDialogClose>
                  </AlertDialogFooter>
                </AlertDialogPopup>
              </AlertDialogViewport>
            </AlertDialogPortal>
          </AlertDialog>
        </div>
      </div>

      {account.latestSnapshot?.status === "error" ? (
        <Card className="border-destructive/60">
          <CardContent className="space-y-1 py-4">
            <Badge variant="error">{t("detail.statusError")}</Badge>
            <p className="break-words text-sm">{account.latestSnapshot.error}</p>
          </CardContent>
        </Card>
      ) : null}

      {/* 窗口详情 */}
      {display && display.windows.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("detail.windows")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {display.windows.map((w, index) => {
              const unitLabel = t(`unit.${w.unit}`, { defaultValue: w.unit });
              return (
                <div key={index} className="rounded-lg border border-border p-3">
                  <p className="text-sm font-medium">
                    {w.label ?? t(`window.${w.kind}`, { defaultValue: w.kind })}
                  </p>
                  <p className="mt-1 text-lg tabular-nums">
                    {w.remainingPct !== undefined ? `${w.remainingPct.toFixed(1)}%` : ""}{" "}
                    <span className="text-sm text-muted-foreground">{windowValueText(w, unitLabel)}</span>
                  </p>
                  {w.resetAt ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t("overview.windowReset")}: {localDateTime(w.resetAt)}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </CardContent>
        </Card>
      ) : null}

      {usage ? <UsageCard usage={usage} /> : null}

      {/* 趋势图 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("detail.chart")}</CardTitle>
        </CardHeader>
        <CardContent>
          {history && history.length > 1 ? (
            <>
              <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1">
                {seriesNames.map((name, index) => (
                  <span key={name} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span
                      className="size-2 rounded-full"
                      style={{ background: `var(--chart-${(index % 5) + 1})` }}
                    />
                    {name}
                  </span>
                ))}
              </div>
              <div className="h-64" data-testid="trend-chart">
                <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis
                    dataKey="timeLabel"
                    tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
                    tickLine={false}
                    axisLine={{ stroke: "var(--border)" }}
                    minTickGap={32}
                  />
                  <YAxis
                    width={40}
                    domain={[0, 100]}
                    tickFormatter={(v: number) => `${v}%`}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
                  />
                  <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: "var(--border)" }} />
                  {seriesNames.map((name, index) => (
                    <Line
                      key={name}
                      type="monotone"
                      dataKey={name}
                      stroke={`var(--chart-${(index % 5) + 1})`}
                      strokeWidth={2}
                      dot={false}
                      connectNulls
                    />
                  ))}
                </LineChart>
                </ResponsiveContainer>
              </div>
            </>
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">{t("detail.noSnapshots")}</p>
          )}
        </CardContent>
      </Card>

      {/* 快照历史 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("detail.history")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("detail.time")}</TableHead>
                <TableHead>{t("detail.values")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(history ?? [])
                .slice()
                .reverse()
                .slice(0, 50)
                .map((snap) => (
                  <TableRow key={snap.id}>
                    <TableCell className="whitespace-nowrap text-xs">{localDateTime(snap.fetchedAt)}</TableCell>
                    <TableCell className="text-xs">
                      {(snap.windows ?? [])
                        .map((w) => {
                          const label = w.label ?? w.kind;
                          const pct = w.remainingPct !== undefined ? `${w.remainingPct.toFixed(0)}%` : "—";
                          return `${label}: ${pct}`;
                        })
                        .join(" · ")}
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <EditAccountDialog account={account} fields={providerFields(account, providers)} open={editOpen} onOpenChange={setEditOpen} onSaved={requestRefresh} />
    </div>
  );
}
function UsageBarChart({ data, metric }: { data: UsagePoint[]; metric: "tokens" | "calls" }) {
  const t = useTranslations();
  return (
    <div className="h-48">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            width={48}
            tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) => compactNumber(v)}
          />
          <Tooltip
            contentStyle={tooltipStyle}
            cursor={{ stroke: "var(--border)" }}
            formatter={(value) => compactNumber(Number(value))}
          />
          <Bar dataKey={metric} fill={metric === "tokens" ? "var(--chart-1)" : "var(--chart-2)"} name={t(`detail.usage.${metric}`)} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function UsageCard({ usage }: { usage: ModelUsage }) {
  const t = useTranslations();
  const [metric, setMetric] = useState<"tokens" | "calls">("tokens");
  const peak = peakHour(usage);
  const modelsTotal = usage.models.reduce((acc, m) => acc + m.totalTokens, 0);
  return (
    <Card data-testid="usage-card">
      <CardHeader>
        <CardTitle className="text-base">{t("detail.usage.title")}</CardTitle>
        <CardAction>
          <ToggleGroup
            value={[metric]}
            onValueChange={(value) => {
              const next = value[0];
              if (next === "tokens" || next === "calls") setMetric(next);
            }}
          >
            <ToggleGroupItem value="tokens" variant="outline" size="sm">
              {t("detail.usage.tokens")}
            </ToggleGroupItem>
            <ToggleGroupItem value="calls" variant="outline" size="sm">
              {t("detail.usage.calls")}
            </ToggleGroupItem>
          </ToggleGroup>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-border p-3">
            <p className="text-xs text-muted-foreground">{t("detail.usage.totalTokens")}</p>
            <p className="mt-1 text-lg font-semibold tabular-nums">{compactNumber(usage.totalTokens)}</p>
          </div>
          <div className="rounded-lg border border-border p-3">
            <p className="text-xs text-muted-foreground">{t("detail.usage.totalCalls")}</p>
            <p className="mt-1 text-lg font-semibold tabular-nums">{compactNumber(usage.totalCalls)}</p>
          </div>
          {peak ? (
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground">{t("detail.usage.peak")}</p>
              <p className="mt-1 text-lg font-semibold tabular-nums">
                {compactNumber(peak.tokens)}{" "}
                <span className="text-sm font-normal text-muted-foreground">@ {peak.label.slice(6)}</span>
              </p>
            </div>
          ) : null}
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">{t("detail.usage.hourly")}</p>
          <UsageBarChart data={latestDaySeries(usage)} metric={metric} />
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">{t("detail.usage.daily")}</p>
          <UsageBarChart data={dailySeries(usage)} metric={metric} />
        </div>

        {usage.models.length > 0 ? (
          <div className="space-y-3">
            <p className="text-sm font-medium">{t("detail.usage.byModel")}</p>
            {usage.models.map((m) => {
              const share = modelsTotal > 0 ? (m.totalTokens / modelsTotal) * 100 : 0;
              return (
                <div key={m.name} className="space-y-1.5">
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="truncate font-medium">{m.name}</span>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {compactNumber(m.totalTokens)} · {share.toFixed(1)}%
                    </span>
                  </div>
                  {modelsTotal > 0 ? (
                    <Progress value={share}>
                      <ProgressTrack>
                        <ProgressIndicator />
                      </ProgressTrack>
                    </Progress>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}

        <p className="text-xs text-muted-foreground">
          {t("detail.usage.window", { from: usage.xTime[0], to: usage.xTime[usage.xTime.length - 1] })}
        </p>
      </CardContent>
    </Card>
  );
}

function providerFields(account: AccountView, providers: ProviderView[]): CredentialFieldView[] {
  return providers.find((p) => p.id === account.providerId)?.fields ?? [];
}

function seriesKey(kind: string, label?: string): string {
  return label ?? kind;
}

function collectSeriesNames(history: HistorySnapshot[]): string[] {
  const names = new Set<string>();
  for (const snap of history) {
    for (const w of snap.windows ?? []) names.add(seriesKey(w.kind, w.label));
  }
  return Array.from(names);
}


function EditAccountDialog({
  account,
  fields,
  open,
  onOpenChange,
  onSaved,
}: {
  account: AccountView;
  fields: CredentialFieldView[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const t = useTranslations("detail");
  const [label, setLabel] = useState(account.label);
  const [interval, setIntervalValue] = useState(account.config.intervalMinutes?.toString() ?? "");
  const [warnPct, setWarnPct] = useState(account.config.warnPct?.toString() ?? "");
  const [baseUrl, setBaseUrl] = useState(account.config.baseUrl ?? "");
  const [enabled, setEnabled] = useState(account.enabled);
  const [credentialValues, setCredentialValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      const body: Record<string, unknown> = {
        label,
        enabled,
        config: {
          ...(interval.trim() ? { intervalMinutes: Number(interval) } : {}),
          ...(warnPct.trim() ? { warnPct: Number(warnPct) } : {}),
          ...(baseUrl.trim() ? { baseUrl: baseUrl.trim() } : {}),
        },
      };
      const filled = Object.fromEntries(
        Object.entries(credentialValues).filter(([, value]) => value.trim().length > 0),
      );
      if (Object.keys(filled).length > 0) {
        body.credentials = filled;
      }
      await fetch(`/api/accounts/${account.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      onOpenChange(false);
      onSaved();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogBackdrop />
        <DialogViewport>
          <DialogPopup>
            <DialogHeader>
              <DialogTitle>{t("edit")}</DialogTitle>
              <DialogDescription>{account.providerName}</DialogDescription>
            </DialogHeader>
            <DialogPanel className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-label">{t("label")}</Label>
                <Input id="edit-label" value={label} onValueChange={setLabel} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="edit-interval">{t("interval")}</Label>
                  <Input id="edit-interval" inputMode="numeric" value={interval} onValueChange={setIntervalValue} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="edit-warn">{t("warnPct")}</Label>
                  <Input id="edit-warn" inputMode="numeric" value={warnPct} onValueChange={setWarnPct} />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-baseurl">{t("baseUrl")}</Label>
                <Input id="edit-baseurl" value={baseUrl} onValueChange={setBaseUrl} placeholder="https://" />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="edit-enabled">{t("enabled")}</Label>
                <Switch id="edit-enabled" checked={enabled} onCheckedChange={setEnabled} />
              </div>
              {fields.map((field) => (
                <div key={field.key} className="grid gap-2">
                  <Label htmlFor={`edit-cred-${field.key}`}>{field.label}</Label>
                  {field.kind === "json" ? (
                    <Textarea
                      id={`edit-cred-${field.key}`}
                      value={credentialValues[field.key] ?? ""}
                      onChange={(e) =>
                        setCredentialValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                      }
                      rows={3}
                      placeholder={field.placeholder ?? "JSON"}
                    />
                  ) : (
                    <Input
                      id={`edit-cred-${field.key}`}
                      type="password"
                      value={credentialValues[field.key] ?? ""}
                      onValueChange={(value) =>
                        setCredentialValues((prev) => ({ ...prev, [field.key]: value }))
                      }
                      placeholder="—"
                    />
                  )}
                </div>
              ))}
            </DialogPanel>
            <DialogFooter>
              <DialogClose>{t("cancel")}</DialogClose>
              <Button onClick={save} disabled={busy}>
                {t("save")}
              </Button>
            </DialogFooter>
          </DialogPopup>
        </DialogViewport>
      </DialogPortal>
    </Dialog>
  );
}
