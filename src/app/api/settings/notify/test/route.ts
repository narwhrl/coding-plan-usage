import { NextResponse } from "next/server";
import { requireAuth } from "@/server/auth";
import { ensureBootstrapped } from "@/server/bootstrap";
import { getNotifySettings } from "@/server/settings";
import { dispatchWebhook } from "@/server/notify";

/**
 * POST /api/settings/notify/test → 用已保存的配置发一条 test 事件。
 * 不接受请求体里的地址：只测已保存的 endpoint，避免把本服务变成任意 URL 的转发器。
 * enabled 为 false 时仍可测试（方便先验证连通再开启）。
 */
export async function POST(): Promise<NextResponse> {
  if (!(await requireAuth())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  ensureBootstrapped();
  const notify = await getNotifySettings();
  if (!notify.url) return NextResponse.json({ error: "notify not configured" }, { status: 400 });

  const result = await dispatchWebhook(
    {
      version: 1,
      event: "test",
      firedAt: new Date().toISOString(),
      account: null,
      level: "ok",
      previousLevel: null,
      threshold: 0,
      window: null,
      error: null,
      consecutiveFailures: 0,
    },
    { url: notify.url, secret: notify.secret },
  );
  return NextResponse.json(result);
}
