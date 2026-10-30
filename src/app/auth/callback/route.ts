import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseConfig } from "@/lib/supabase/config";

export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  if (!getSupabaseConfig()) {
    return NextResponse.redirect(new URL("/setup", origin));
  }

  const code = request.nextUrl.searchParams.get("code");
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL("/verify", origin));
    }
  }

  return NextResponse.redirect(new URL("/sign-in?error=callback", origin));
}
