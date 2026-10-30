"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Mode = "checking" | "enroll-prompt" | "enrolling" | "verify" | "problem";
type VerifiedFactor = { id: string; name: string };

export function MfaGate({ email }: { email: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("checking");
  const [factorId, setFactorId] = useState("");
  const [verifiedFactors, setVerifiedFactors] = useState<VerifiedFactor[]>([]);
  const [qrCode, setQrCode] = useState("");
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function checkFactors() {
      try {
        const supabase = createClient();
        const [assurance, factors] = await Promise.all([
          supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
          supabase.auth.mfa.listFactors()
        ]);
        if (cancelled) return;
        if (assurance.error || factors.error) throw new Error("MFA check failed");
        if (assurance.data.currentLevel === "aal2") {
          router.replace("/dashboard");
          router.refresh();
          return;
        }
        const verified = (factors.data.totp ?? [])
          .filter((factor: { status: string }) => factor.status === "verified")
          .map((factor: { id: string; friendly_name?: string }, index: number) => ({
            id: factor.id,
            name: factor.friendly_name || `Authenticator ${index + 1}`
          }));
        if (verified.length > 0) {
          setVerifiedFactors(verified);
          setFactorId(verified[0].id);
          setMode("verify");
        } else {
          setMode("enroll-prompt");
        }
      } catch {
        if (!cancelled) setMode("problem");
      }
    }
    void checkFactors();
    return () => { cancelled = true; };
  }, [router]);

  async function beginEnrollment() {
    setError("");
    setBusy(true);
    try {
      const { data, error: enrollError } = await createClient().auth.mfa.enroll({ factorType: "totp" });
      if (enrollError || !data?.totp) throw new Error("Enrollment failed");
      setFactorId(data.id);
      setQrCode(`data:image/svg+xml;utf-8,${encodeURIComponent(data.totp.qr_code)}`);
      setSecret(data.totp.secret);
      setMode("enrolling");
    } catch {
      setError("We couldn't start verification setup. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const supabase = createClient();
      const challenge = await supabase.auth.mfa.challenge({ factorId });
      if (challenge.error || !challenge.data) throw new Error("Challenge failed");
      const result = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.data.id,
        code: code.trim()
      });
      if (result.error) {
        setError("That code didn't work. Check your authenticator app and try again.");
        return;
      }
      router.replace("/dashboard");
      router.refresh();
    } catch {
      setError("Verification is unavailable right now. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-card mfa-card">
      <p className="eyebrow">Account protection</p>
      <h1>One more step</h1>
      <p className="auth-intro">{email ? `Verifying ${email}` : "Verify your account"}</p>

      {mode === "checking" && <p role="status">Checking your verification method…</p>}
      {mode === "problem" && <p className="form-error" role="alert">We couldn't check your security settings. Refresh this page to try again.</p>}
      {mode === "enroll-prompt" && (
        <div className="mfa-content">
          <p>Set up an authenticator app before opening your CRM workspace.</p>
          <button className="button button-primary" onClick={beginEnrollment} disabled={busy}>
            {busy ? "Preparing…" : "Set up authenticator"}
          </button>
        </div>
      )}
      {mode === "enrolling" && (
        <div className="mfa-content">
          <p>Scan this code in your authenticator app, then enter its six-digit code.</p>
          {qrCode && <img className="mfa-qr" src={qrCode} alt="Authenticator setup QR code" />}
          <details className="secret-details">
            <summary>Can’t scan the code?</summary>
            <p>Enter this setup key manually: <code>{secret}</code></p>
          </details>
        </div>
      )}
      {(mode === "enrolling" || mode === "verify") && (
        <form onSubmit={verify} className="auth-form">
          {mode === "verify" && verifiedFactors.length > 1 && (
            <>
              <label htmlFor="authenticator-choice">Choose an authenticator</label>
              <select id="authenticator-choice" value={factorId} onChange={(event) => { setFactorId(event.target.value); setCode(""); setError(""); }} disabled={busy}>
                {verifiedFactors.map((factor) => <option key={factor.id} value={factor.id}>{factor.name}</option>)}
              </select>
            </>
          )}
          <label htmlFor="verification-code">Authenticator code</label>
          <input
            id="verification-code"
            name="verification-code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            required
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
            placeholder="6-digit code"
            disabled={busy}
          />
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="button button-primary button-full" type="submit" disabled={busy}>
            {busy ? "Verifying…" : "Verify and continue"}
          </button>
        </form>
      )}
      {mode !== "checking" && <p className="auth-footnote">Lost your usual authenticator? Choose a registered backup. If neither works, contact the other co-founder; this screen cannot remove the second-factor requirement.</p>}
    </div>
  );
}
