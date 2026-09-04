"use client";

import type React from "react";
import { useTranslations } from "next-intl";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

/** error.tsx 共用：路由段渲染失败时的回退，不替代根布局。 */
export function RouteError({ retry }: { retry: () => void }): React.ReactElement {
  const t = useTranslations("common");
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <TriangleAlert />
          </EmptyMedia>
          <EmptyTitle>{t("error")}</EmptyTitle>
          <EmptyDescription>{t("errorHint")}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button onClick={() => retry()}>{t("retry")}</Button>
        </EmptyContent>
      </Empty>
    </div>
  );
}
