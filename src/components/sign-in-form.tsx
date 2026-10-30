"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function SignInForm({ signInError = false }: { signInError?: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(signInError ? "That sign-in or account link could not be completed. Please try again." : "");

  async function signInWithPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password
      });
      if (signInError) {
        setError("We couldn't sign you in. Check your details and try again.");
        return;
      }
      router.replace("/verify");
      router.refresh();
    } catch {
      setError("Sign-in is unavailable right now. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function signInWithGoogle() {
    setError("");
    setBusy(true);
    try {
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/auth/callback` }
      });
      if (signInError) {
        setError("Google sign-in is unavailable right now. Please try again.");
        setBusy(false);
      }
    } catch {
      setError("Google sign-in is unavailable right now. Please try again.");
      setBusy(false);
    }
  }

  return (
    <div className="auth-card">
      <div className="auth-card-heading">
        <p className="eyebrow">Founder access</p>
        <h1>Welcome back</h1>
        <p>Sign in to your StrataForge workspace.</p>
      </div>

      <button className="button button-google" type="button" onClick={signInWithGoogle} disabled={busy}>
        <span className="google-g" aria-hidden="true">G</span>
        Continue with Google
      </button>

      <div className="auth-divider"><span>or use your email</span></div>

      <form onSubmit={signInWithPassword} className="auth-form">
        <label htmlFor="email">Email address</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@strataforge.com"
          disabled={busy}
        />
        <div className="field-label-row">
          <label htmlFor="password">Password</label>
          <Link className="recovery-link" href="/forgot-password">Forgot password?</Link>
        </div>
        <div className="password-input-wrap">
          <input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Enter your password"
            disabled={busy}
          />
          <button type="button" onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword} disabled={busy}>
            {showPassword ? "Hide" : "Show"}
          </button>
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="button button-primary button-full" type="submit" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <p className="auth-footnote">Access is by invitation. A second verification step is required for both sign-in methods.</p>
    </div>
  );
}
