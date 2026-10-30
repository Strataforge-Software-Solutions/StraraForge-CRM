import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { SetPasswordForm } from "@/components/set-password-form";
import { readPasswordFlow } from "@/lib/auth/password-flow";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseConfig } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

export default async function SetPasswordPage() {
  if (!getSupabaseConfig()) redirect("/setup");
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) redirect("/sign-in?error=link");
  const flow = await readPasswordFlow(data.claims.sub);
  if (!flow) redirect("/sign-in?error=link");

  const { data: membership, error: membershipError } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", data.claims.sub)
    .eq("active", true)
    .limit(1)
    .maybeSingle();
  if (membershipError) throw new Error("Could not verify workspace access");
  if (!membership) redirect("/access-pending");

  return <AuthShell><SetPasswordForm flow={flow} /></AuthShell>;
}
