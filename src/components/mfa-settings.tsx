"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";

type FactorSummary = { id: string; name: string };

export function MfaSettings() {
  const [factors, setFactors] = useState<FactorSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [factorId, setFactorId] = useState("");
  const [qrCode, setQrCode] = useState("");
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [removing, setRemoving] = useState<FactorSummary | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const confirmDialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = confirmDialog.current;
    if (removing && dialog && !dialog.open) dialog.showModal();
    if (!removing && dialog?.open) dialog.close();
  }, [removing]);

  async function loadFactors() {
    const { data, error: listError } = await createClient().auth.mfa.listFactors();
    if (listError) throw listError;
    const verified = (data.totp ?? [])
      .filter((factor: { status: string }) => factor.status === "verified")
      .map((factor: { id: string; friendly_name?: string }, index: number) => ({
        id: factor.id,
        name: factor.friendly_name || `Authenticator ${index + 1}`
      }));
    setFactors(verified);
  }

  useEffect(() => {
    let cancelled = false;
    async function checkFactors() {
      try {
        const response = await createClient().auth.mfa.listFactors();
        if (cancelled) return;
        if (response.error) throw response.error;
        setFactors((response.data.totp ?? [])
          .filter((factor: { status: string }) => factor.status === "verified")
          .map((factor: { id: string; friendly_name?: string }, index: number) => ({ id: factor.id, name: factor.friendly_name || `Authenticator ${index + 1}` })));
      } catch {
        if (!cancelled) setError("Couldn’t load your authenticators. Refresh to try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void checkFactors();
    return () => { cancelled = true; };
  }, []);

  async function beginEnrollment() {
    setError("");
    setSuccess("");
    setBusy(true);
    try {
      const { data, error: enrollError } = await createClient().auth.mfa.enroll({ factorType: "totp" });
      if (enrollError || !data?.totp) throw new Error("Enrollment failed");
      setFactorId(data.id);
      setQrCode(`data:image/svg+xml;utf-8,${encodeURIComponent(data.totp.qr_code)}`);
      setSecret(data.totp.secret);
    } catch {
      setError("Couldn’t start backup setup. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function finishEnrollment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const supabase = createClient();
      const challenge = await supabase.auth.mfa.challenge({ factorId });
      if (challenge.error || !challenge.data) throw new Error("Challenge failed");
      const result = await supabase.auth.mfa.verify({ factorId, challengeId: challenge.data.id, code: code.trim() });
      if (result.error) {
        setError("That code didn’t work. Check the backup authenticator and try again.");
        return;
      }
      setQrCode("");
      setSecret("");
      setFactorId("");
      setCode("");
      await loadFactors();
      setSuccess("Backup authenticator added. Other sessions may need to sign in again.");
    } catch {
      setError("Couldn’t finish backup setup. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function removeFactor() {
    if (!removing || factors.length < 2) return;
    setError("");
    setSuccess("");
    setBusy(true);
    try {
      const { error: removeError } = await createClient().auth.mfa.unenroll({ factorId: removing.id });
      if (removeError) throw removeError;
      const removedName = removing.name;
      setFactors((current) => current.filter((factor) => factor.id !== removing.id));
      setRemoving(null);
      setSuccess(`${removedName} was removed. Keep another verified authenticator available.`);
    } catch {
      setError("Couldn’t remove this authenticator. Refresh and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="settings-card mfa-settings">
      <h2>Authenticator methods</h2>
      <p className="settings-copy">Keep a backup authenticator on a separate device. Both methods still require a valid sign-in before they can open the CRM.</p>
      {loading ? <p role="status" className="settings-copy">Loading methods…</p> : (
        <>
          <ul className="factor-list">
            {factors.map((factor) => <li key={factor.id}><span className="factor-check" aria-hidden="true">✓</span>{factor.name}<span className="factor-status">Active</span>{factors.length > 1 && <button className="text-button" type="button" onClick={() => setRemoving(factor)} disabled={busy}>Remove</button>}</li>)}
          </ul>
          {factors.length < 2 && !factorId && <button className="button button-outline" type="button" onClick={beginEnrollment} disabled={busy}>{busy ? "Preparing…" : "Add backup authenticator"}</button>}
          {factors.length >= 2 && <p className="settings-copy">A backup method is ready. You can choose it on the verification screen.</p>}
        </>
      )}
      {factorId && (
        <div className="backup-enrollment">
          <p>Scan this code with a different authenticator device, then enter its six-digit code.</p>
          {qrCode && <img className="mfa-qr" src={qrCode} alt="Backup authenticator setup QR code" />}
          <details className="secret-details"><summary>Can’t scan the code?</summary><p>Enter this setup key manually: <code>{secret}</code></p></details>
          <form className="auth-form" onSubmit={finishEnrollment}>
            <label htmlFor="backup-code">Backup authenticator code</label>
            <input id="backup-code" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} disabled={busy} />
            <button className="button button-primary" type="submit" disabled={busy}>{busy ? "Verifying…" : "Verify backup"}</button>
          </form>
        </div>
      )}
      {removing && (
        <dialog ref={confirmDialog} className="confirm-dialog" aria-labelledby="remove-factor-title" aria-describedby="remove-factor-description" onClose={() => { if (removing) setRemoving(null); }} onCancel={(event) => { if (busy) event.preventDefault(); }} onClick={(event) => { if (event.target === event.currentTarget && !busy) setRemoving(null); }}>
          <section role="alertdialog">
            <h3 id="remove-factor-title">Remove {removing.name}?</h3>
            <p id="remove-factor-description">This authenticator will no longer work for sign-in. Another verified authenticator must remain on your account.</p>
            {error && <p className="form-error" role="alert">{error}</p>}
            <div className="dialog-actions">
              <button className="button button-outline" type="button" onClick={() => setRemoving(null)} disabled={busy}>Keep authenticator</button>
              <button className="button button-danger" type="button" onClick={removeFactor} disabled={busy}>{busy ? "Removing…" : "Remove authenticator"}</button>
            </div>
          </section>
        </dialog>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}
      {success && <p className="form-message form-message-success" role="status">{success}</p>}
    </section>
  );
}
