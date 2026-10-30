"use client";

import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import type { PasswordFlow } from "@/lib/auth/password-flow";

export function SetPasswordForm({ flow }: { flow: PasswordFlow }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function savePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password !== confirm) {
      setError("The passwords do not match.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      const { error: updateError } = await createClient().auth.updateUser({ password });
      if (updateError) throw updateError;
      await fetch("/auth/password-complete", { method: "POST" });
      window.location.replace("/verify");
    } catch {
      setError("We couldn’t save the password. Check the requirements and try again.");
      setBusy(false);
    }
  }

  return (
    <div className="auth-card">
      <p className="eyebrow">{flow === "invite" ? "Founder invitation" : "Account recovery"}</p>
      <h1>{flow === "invite" ? "Create your password" : "Choose a new password"}</h1>
      <p className="auth-intro">Use a unique password with at least 12 characters. You’ll verify with your authenticator before entering the CRM.</p>
      <form className="auth-form" onSubmit={savePassword}>
        <label htmlFor="new-password">New password</label>
        <input id="new-password" type="password" autoComplete="new-password" minLength={12} required value={password} onChange={(event) => setPassword(event.target.value)} disabled={busy} />
        <label htmlFor="confirm-password">Confirm password</label>
        <input id="confirm-password" type="password" autoComplete="new-password" minLength={12} required value={confirm} onChange={(event) => setConfirm(event.target.value)} disabled={busy} />
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="button button-primary button-full" type="submit" disabled={busy}>{busy ? "Saving…" : "Save password"}</button>
      </form>
      <p className="auth-footnote">Your authenticator is still required to open the workspace.</p>
    </div>
  );
}
