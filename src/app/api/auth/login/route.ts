import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkPassword, issueSessionCookie, isAuthEnabled } from "@/server/auth";

const LoginSchema = z.object({ password: z.string().min(1) });

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.json().catch(() => null);
  const parsed = LoginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  if (!isAuthEnabled()) {
    return NextResponse.json({ ok: true }); // 未配置口令 → 无需登录
  }
  if (!checkPassword(parsed.data.password)) {
    return NextResponse.json({ error: "wrong password" }, { status: 401 });
  }
  const cookie = issueSessionCookie();
  const response = NextResponse.json({ ok: true });
  response.cookies.set(cookie.name, cookie.value, cookie.options as never);
  return response;
}
