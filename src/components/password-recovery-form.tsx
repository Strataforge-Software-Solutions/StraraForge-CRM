"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";

export function PasswordRecoveryForm() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function requestReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const { error: resetError } = await createClient().auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/set-password`
      });
      if (resetError) throw resetError;
      setSent(true);
    } catch {
      setError("We couldn’t send a recovery email right now. Please try again later.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-card">
      <p className="eyebrow">Account recovery</p>
      <h1>Reset your password</h1>
      {sent ? (
        <div role="status">
          <p className="auth-intro">If this email belongs to a founder account, we’ve sent a recovery link. Check your inbox and follow its instructions.</p>
          <Link className="auth-back" href="/sign-in">Return to sign in</Link>
        </div>
      ) : (
        <>
          <p className="auth-intro">Enter your account email. We’ll send a recovery link if an account exists.</p>
          <form className="auth-form" onSubmit={requestReset}>
            <label htmlFor="recovery-email">Email address</label>
            <input id="recovery-email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} disabled={busy} />
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="button button-primary button-full" type="submit" disabled={busy}>{busy ? "Sending…" : "Send recovery link"}</button>
          </form>
          <Link className="auth-back" href="/sign-in">Return to sign in</Link>
        </>
      )}
    </div>
  );
}
