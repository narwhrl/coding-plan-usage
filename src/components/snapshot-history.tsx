"use client";

import { useState } from "react";
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
import { quotaTextClassName } from "@/components/quota-bar";
import { shortDateTime, windowName, windowPctText } from "@/lib/format";
import type { HistorySnapshot } from "@/lib/types";

const COLLAPSED_ROWS = 12;

/** 快照历史表：最新在上，默认只展示前 12 行，其余折叠。 */
export function SnapshotHistory({
  history,
  warnPct,
}: {
  history: HistorySnapshot[];
  warnPct: number;
}) {
  const t = useTranslations();
  const tDetail = useTranslations("detail");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const [expanded, setExpanded] = useState(false);

  const rows = history.slice().reverse();
  const visible = expanded ? rows : rows.slice(0, COLLAPSED_ROWS);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{tDetail("history")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{tDetail("historyEmpty")}</p>
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
                {visible.map((snap) => (
                  <TableRow key={snap.id}>
                    <TableCell className="align-top text-xs whitespace-nowrap text-muted-foreground">
                      <time dateTime={snap.fetchedAt}>{shortDateTime(snap.fetchedAt, locale)}</time>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1.5">
                        {(snap.windows ?? []).length === 0 ? (
                          <span className="text-xs text-muted-foreground">—</span>
                        ) : (
                          (snap.windows ?? []).map((w, index) => (
                            <Badge key={index} variant="outline" className="gap-1 font-normal">
                              <span className="text-muted-foreground">{windowName(w, t)}</span>
                              <span
                                className={quotaTextClassName(w.remainingPct, warnPct) || undefined}
                              >
                                {windowPctText(w) ?? "—"}
                              </span>
                            </Badge>
                          ))
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {rows.length > COLLAPSED_ROWS ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setExpanded((prev) => !prev)}
                data-testid="history-toggle"
              >
                {expanded ? tCommon("showLess") : tCommon("showAll", { count: rows.length })}
              </Button>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
