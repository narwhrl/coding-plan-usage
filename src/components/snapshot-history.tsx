"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { shortDateTime, windowName, windowPctText } from "@/lib/format";
import type { HistorySnapshot } from "@/lib/types";

const PREVIEW_ROWS = 12;

export function SnapshotHistory({ history }: { history: HistorySnapshot[] | null }) {
  const t = useTranslations();
  const tDetail = useTranslations("detail");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const [expanded, setExpanded] = useState(false);

  const rows = (history ?? []).slice().reverse();
  const visible = expanded ? rows : rows.slice(0, PREVIEW_ROWS);

  return (
    <Card>
      <CardHeader>
        <CardTitle render={<h2 />} className="text-base">
          {tDetail("history")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {history === null ? (
          <div className="space-y-2" aria-busy="true">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-8 rounded-md" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{tDetail("historyEmpty")}</p>
        ) : (
          <div className="space-y-3">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{tDetail("time")}</TableHead>
                  <TableHead>{tDetail("values")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((snap) => (
                  <TableRow key={snap.id}>
                    <TableCell className="whitespace-nowrap text-xs">
                      {shortDateTime(snap.fetchedAt, locale)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {(snap.windows ?? [])
                        .map((w) => `${windowName(w, t)}: ${windowPctText(w) ?? "—"}`)
                        .join(" · ")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {rows.length > PREVIEW_ROWS ? (
              <Button variant="ghost" size="sm" onClick={() => setExpanded((v) => !v)}>
                {expanded ? tCommon("showLess") : tCommon("showAll", { count: rows.length })}
              </Button>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
