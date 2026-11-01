import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseConfig } from "@/lib/supabase/config";

let browserClient: SupabaseClient<any> | null = null;

export function createClient(): SupabaseClient<any> {
  if (!browserClient) {
    const { url, publishableKey } = requireSupabaseConfig();
    browserClient = createSupabaseClient<any>(url, publishableKey, {
      // AuthCallback owns code and recovery-link exchange so each link is consumed once.
      auth: { detectSessionInUrl: false, flowType: "pkce", persistSession: true, autoRefreshToken: true }
    });
  }
  return browserClient;
}
