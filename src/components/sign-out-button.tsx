"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function SignOutButton({ subtle = false }: { subtle?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function signOut() {
    setError("");
    setBusy(true);
    try {
      const { error: signOutError } = await createClient().auth.signOut({ scope: "local" });
      if (signOutError) throw signOutError;
      window.location.replace("/sign-in");
    } catch {
      setError("Could not sign out. Please try again.");
      setBusy(false);
    }
  }

  return (
    <span className="sign-out-wrap">
      <button type="button" className={subtle ? "text-button" : "button button-outline"} onClick={signOut} disabled={busy}>
        {busy ? "Signing out…" : "Sign out"}
      </button>
      {error && <span className="form-error" role="alert">{error}</span>}
    </span>
  );
}
