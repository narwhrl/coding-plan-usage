import type React from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { TriangleAlert } from "lucide-react";
import type { AccountView } from "@/lib/types";

/**
 * 账户状态徽标组：采集失败 / 余量偏低 / 已停用 / 正常。
 * 停用、失败这类语义交给徽标说明，容器本身不要再叠 opacity——
 * 整卡调透明度会把已经是次级色的提示文字一起拖到 AA 以下。
 */
export function AccountStatusBadges({ account }: { account: AccountView }): React.ReactElement {
  const t = useTranslations("overview");
  const isError = account.latestSnapshot?.status === "error";
  return (
    <>
      {isError ? (
        <Badge variant="error" data-testid="error-badge">
          {t("error")}
        </Badge>
      ) : null}
      {account.warn ? (
        <Badge variant="warning" data-testid="warn-badge">
          <TriangleAlert />
          {t("lowQuota")}
        </Badge>
      ) : null}
      {!account.enabled ? <Badge variant="secondary">{t("disabled")}</Badge> : null}
      {/* 正常态不出徽标：分节标题已经说明「正常」，每张卡再挂一个绿标只是噪声。 */}
    </>
  );
}
