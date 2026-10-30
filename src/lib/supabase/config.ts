export function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (
    !url ||
    !publishableKey ||
    url.includes("YOUR_PROJECT") ||
    publishableKey === "YOUR_PUBLISHABLE_KEY"
  ) {
    return null;
  }

  return { url, publishableKey };
}

export function requireSupabaseConfig() {
  const config = getSupabaseConfig();
  if (!config) {
    throw new Error("Supabase is not configured");
  }
  return config;
}
