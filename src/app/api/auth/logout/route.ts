import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, requestIsHttps } from "@/server/auth";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
    secure: requestIsHttps(request),
  });
  return response;
}
