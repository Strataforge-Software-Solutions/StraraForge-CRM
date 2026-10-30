import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseConfig } from "@/lib/supabase/config";

export type Founder = {
  userId: string;
  email: string;
  workspaceId: string;
  role: "admin" | "member";
};

export async function requireFounder(): Promise<Founder> {
  if (!getSupabaseConfig()) redirect("/setup");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) redirect("/sign-in");
  if (claims.aal !== "aal2") redirect("/verify");

  const { data: membership, error: membershipError } = await supabase
    .from("workspace_members")
    .select("workspace_id, role")
    .eq("user_id", claims.sub)
    .eq("active", true)
    .limit(1)
    .maybeSingle();

  if (membershipError) throw new Error("Could not verify workspace access");
  if (!membership) redirect("/access-pending");
  if (membership.role !== "admin" && membership.role !== "member") {
    throw new Error("Invalid workspace role");
  }

  return {
    userId: claims.sub,
    email: typeof claims.email === "string" ? claims.email : "Founder",
    workspaceId: membership.workspace_id,
    role: membership.role
  };
}
