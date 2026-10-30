import { NextResponse, type NextRequest } from "next/server";
import { clearPasswordFlow } from "@/lib/auth/password-flow";

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin !== request.nextUrl.origin) {
    return new NextResponse(null, { status: 403 });
  }
  await clearPasswordFlow();
  return NextResponse.json({ ok: true });
}
