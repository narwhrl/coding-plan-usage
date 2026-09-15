"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { quotaTextClassName } from "@/components/quota-bar";
import { compactNumber, shortDateTime, windowName } from "@/lib/format";
import {
  buildChangeLog,
  formatSigned,
  type WindowChange,
} from "@/lib/snapshot-changelog";
import type { HistorySnapshot } from "@/lib/types";

const COLLAPSED_ROWS = 12;

function metricText(change: WindowChange, value: number | null): string {
  if (value === null) return "—";
  return change.metric === "percent" ? `${Math.round(value)}%` : compactNumber(value);
}

function changeValueText(
  change: WindowChange,
  tDetail: ReturnType<typeof useTranslations>,
): string {
  if (change.change === "appeared") {
    return tDetail("historyAppeared", { value: metricText(change, change.to) });
  }
  if (change.change === "disappeared") {
    return tDetail("historyDisappeared", { value: metricText(change, change.from) });
  }
  const from = metricText(change, change.from);
  const to = metricText(change, change.to);
  if (change.delta === null || change.from === null || change.to === null) {
    return tDetail("historyFromTo", { from, to });
  }
  const signed =
    change.metric === "percent" ? formatSigned(Math.round(change.delta)) : formatSigned(change.delta);
  const delta = change.metric === "percent" ? tDetail("historyDeltaPct", { delta: signed }) : signed;
  return tDetail("historyChange", { from, to, delta });
}

/** 变化记录：只列出相对上一快照有额度变化的窗口，最新在上，默认 12 行。 */
export function SnapshotHistory({
  history,
  warnPct,
}: {
  history: HistorySnapshot[] | null;
  warnPct: number;
}) {
  const t = useTranslations();
  const tDetail = useTranslations("detail");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const [expanded, setExpanded] = useState(false);
  const events = useMemo(() => buildChangeLog(history), [history]);
  const visible = expanded ? events : events.slice(0, COLLAPSED_ROWS);

  return (
    <Card>
      <CardHeader>
        <CardTitle render={<h2 />} className="text-base">
          {tDetail("history")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {history === null ? (
          <div className="space-y-2" aria-busy="true">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="h-8" />
            ))}
          </div>
        ) : events.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {history.length === 0 ? tDetail("historyEmpty") : tDetail("historyUnchanged")}
          </p>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-40">{tDetail("time")}</TableHead>
                  <TableHead>{tDetail("values")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((event) => (
                  <TableRow key={event.snapshotId}>
                    <TableCell className="align-top text-xs whitespace-nowrap text-muted-foreground">
                      <time dateTime={event.fetchedAt}>{shortDateTime(event.fetchedAt, locale)}</time>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1.5">
                        {event.changes.map((change) => (
                          <Badge
                            key={change.key}
                            variant="outline"
                            className="gap-1 font-normal"
                            data-testid="history-change"
                          >
                            <span className="text-muted-foreground">{windowName(change.window, t)}</span>
                            <span
                              className={
                                quotaTextClassName(
                                  change.metric === "percent" ? (change.to ?? undefined) : undefined,
                                  warnPct,
                                ) || undefined
                              }
                            >
                              {changeValueText(change, tDetail)}
                            </span>
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {events.length > COLLAPSED_ROWS ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setExpanded((prev) => !prev)}
                data-testid="history-toggle"
              >
                {expanded ? tCommon("showLess") : tCommon("showAll", { count: events.length })}
              </Button>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
