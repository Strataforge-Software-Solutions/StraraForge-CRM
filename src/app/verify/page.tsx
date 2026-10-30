import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { MfaGate } from "@/components/mfa-gate";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseConfig } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

export default async function VerifyPage() {
  if (!getSupabaseConfig()) redirect("/setup");
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) redirect("/sign-in");

  const { data: membership, error: membershipError } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", claims.sub)
    .eq("active", true)
    .limit(1)
    .maybeSingle();

  if (membershipError) throw new Error("Could not verify workspace access");
  if (!membership) redirect("/access-pending");
  if (claims.aal === "aal2") redirect("/dashboard");

  return <AuthShell><MfaGate email={typeof claims.email === "string" ? claims.email : ""} /></AuthShell>;
}
