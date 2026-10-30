import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { PasswordRecoveryForm } from "@/components/password-recovery-form";
import { getSupabaseConfig } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

export default function ForgotPasswordPage() {
  if (!getSupabaseConfig()) redirect("/setup");
  return <AuthShell><PasswordRecoveryForm /></AuthShell>;
}
