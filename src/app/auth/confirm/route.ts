import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { issuePasswordFlow, type PasswordFlow } from "@/lib/auth/password-flow";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseConfig } from "@/lib/supabase/config";

export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  if (!getSupabaseConfig()) return NextResponse.redirect(new URL("/setup", origin));

  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type");
  if (!tokenHash || (type !== "invite" && type !== "recovery")) {
    return NextResponse.redirect(new URL("/sign-in?error=link", origin));
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: type as EmailOtpType
  });
  if (error || !data.user) {
    return NextResponse.redirect(new URL("/sign-in?error=link", origin));
  }

  try {
    await issuePasswordFlow(data.user.id, type as PasswordFlow);
  } catch {
    return NextResponse.redirect(new URL("/setup", origin));
  }
  return NextResponse.redirect(new URL("/set-password", origin));
}
