"use client";

import type React from "react";
import { useTranslations } from "next-intl";
import { CircleCheck, PauseCircle, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { AccountView } from "@/lib/types";

/**
 * 账户状态徽标（采集失败 / 余量偏低 / 已停用），概览卡、详情页头、设置列表共用一处。
 * showOk：三者都不成立时补一个「正常」成功态，用于详情页头这种需要明确状态的地方。
 */
export function AccountStatusBadges({
  account,
  showOk = false,
}: {
  account: AccountView;
  showOk?: boolean;
}): React.ReactElement | null {
  const t = useTranslations("overview");
  const isError = account.latestSnapshot?.status === "error";
  const items: React.ReactNode[] = [];

  if (isError) {
    items.push(
      <Badge key="error" variant="error" data-testid="error-badge">
        <TriangleAlert />
        {t("error")}
      </Badge>,
    );
  }
  if (account.warn) {
    items.push(
      <Badge key="warn" variant="warning" data-testid="warn-badge">
        {t("lowQuota")}
      </Badge>,
    );
  }
  if (!account.enabled) {
    items.push(
      <Badge key="disabled" variant="secondary" data-testid="disabled-badge">
        <PauseCircle />
        {t("disabled")}
      </Badge>,
    );
  }
  if (items.length === 0) {
    if (!showOk) return null;
    items.push(
      <Badge key="ok" variant="success" data-testid="ok-badge">
        <CircleCheck />
        {t("ok")}
      </Badge>,
    );
  }

  return <>{items}</>;
}
