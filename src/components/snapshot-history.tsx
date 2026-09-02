"use client";

import { useTranslations } from "next-intl";
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
import { localDateTime, windowName } from "@/lib/format";
import type { HistorySnapshot } from "@/lib/types";

/** 快照历史表：最新的在最上，最多 50 行；骨架留在卡内，表头不跳动。 */
export function SnapshotHistory({ history }: { history: HistorySnapshot[] | null }) {
  const t = useTranslations();
  const tDetail = useTranslations("detail");
  const loading = history === null;
  const rows = (history ?? []).slice().reverse().slice(0, 50);

  return (
    <Card>
      <CardHeader>
        <CardTitle render={<h2 />} className="text-base">
          {tDetail("history")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2" aria-busy="true">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-8" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{tDetail("noSnapshots")}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                {/* 接口只返回 ok 快照，状态列没有信息量，两列就够。 */}
                <TableHead>{tDetail("time")}</TableHead>
                <TableHead>{tDetail("values")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="whitespace-nowrap text-xs tabular-nums">
                    {localDateTime(row.fetchedAt)}
                  </TableCell>
                  <TableCell className="text-xs tabular-nums text-muted-foreground">
                    {(row.windows ?? [])
                      .map((w) => {
                        const pct = w.remainingPct !== undefined ? `${w.remainingPct.toFixed(0)}%` : "—";
                        return `${windowName(w, t)}: ${pct}`;
                      })
                      .join(" · ")}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
