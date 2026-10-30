import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { SignOutButton } from "@/components/sign-out-button";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseConfig } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

export default async function AccessPendingPage() {
  if (!getSupabaseConfig()) redirect("/setup");
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) redirect("/sign-in");

  return (
    <AuthShell>
      <div className="auth-card info-card">
        <p className="eyebrow">Workspace access</p>
        <h1>Access pending</h1>
        <p>This account does not have active access to the StrataForge workspace. Ask a co-founder to check your invitation.</p>
        <SignOutButton />
      </div>
    </AuthShell>
  );
}
