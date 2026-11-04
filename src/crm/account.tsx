import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { db, useAuth, useToast, CrmIcon, PageHeader, cx } from "./shared";

function profilePhotoSaveError(error: unknown, action: "upload" | "save") {
  const message = error instanceof Error ? error.message : typeof error === "object" && error && "message" in error ? String(error.message) : "";
  const normalized = message.toLowerCase();
  if (normalized.includes("bucket") && (normalized.includes("not found") || normalized.includes("does not exist") || normalized.includes("missing"))) {
    return "Profile photo storage is not configured. Apply supabase/migrations/202611010007_profile_avatars.sql to the connected Supabase project, then try again.";
  }
  if (normalized.includes("row-level security") || normalized.includes("row level security") || normalized.includes("unauthorized") || normalized.includes("not allowed") || normalized.includes("403")) {
    return "Photo access was denied. Confirm you are signed in with AAL2 as an active administrator and that the profile photo storage policies are installed.";
  }
  if (normalized.includes("aal2") || normalized.includes("assurance level") || normalized.includes("multi-factor") || normalized.includes("mfa required")) {
    return "Verify your authenticator and try saving the photo again.";
  }
  if (message) return `Profile photo ${action} failed: ${message}`;
  return action === "upload" ? "The profile photo could not be uploaded. Try again." : "The profile photo could not be saved. Try again.";
}

export function Settings() {
  const { founder, reload } = useAuth();
  const navigate = useNavigate();
  const notify = useToast();
  const photoInputRef = useRef<HTMLInputElement>(null);
  const photoSelectionIdRef = useRef(0);
  const [name, setName] = useState(founder?.name ?? "");
  const [error, setError] = useState("");
  const [photoError, setPhotoError] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [busy, setBusy] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [passwordResetBusy, setPasswordResetBusy] = useState(false);
  const [passwordResetError, setPasswordResetError] = useState("");
  const [passwordResetSent, setPasswordResetSent] = useState(false);
  const unchanged = name.trim() === (founder?.name ?? "").trim() && !photoFile && !removePhoto;
  const avatar = (founder?.name?.trim() || founder?.email || "S").charAt(0).toUpperCase();
  const avatarImage = removePhoto ? null : photoPreview || founder?.avatarUrl;
  const role = founder?.role ? founder.role.charAt(0).toUpperCase() + founder.role.slice(1).replaceAll("_", " ") : "Not assigned";

  useEffect(() => { setName(founder?.name ?? ""); }, [founder?.name]);
  useEffect(() => () => { photoSelectionIdRef.current += 1; }, []);
  useEffect(() => () => { if (photoPreview) URL.revokeObjectURL(photoPreview); }, [photoPreview]);

  async function choosePhoto(file?: File) {
    if (!file) return;
    const selectionId = ++photoSelectionIdRef.current;
    setPhotoError("");
    if (!(["image/jpeg", "image/png", "image/webp"] as string[]).includes(file.type)) {
      setPhotoError("Choose a JPG, PNG, or WebP image.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setPhotoError("Choose an image up to 2 MB.");
      return;
    }
    const preview = URL.createObjectURL(file);
    try {
      await new Promise<void>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("Invalid image"));
        image.src = preview;
      });
      if (selectionId !== photoSelectionIdRef.current) { URL.revokeObjectURL(preview); return; }
      setPhotoFile(file);
      setPhotoPreview(preview);
      setRemovePhoto(false);
      setError("");
    } catch {
      URL.revokeObjectURL(preview);
      if (selectionId === photoSelectionIdRef.current) setPhotoError("This image could not be opened. Choose another file.");
    }
  }

  function undoPhotoChange() {
    photoSelectionIdRef.current += 1;
    setPhotoFile(null);
    setPhotoPreview(null);
    setRemovePhoto(false);
    setPhotoError("");
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fullName = name.trim();
    if (!fullName && (founder?.name ?? "").trim()) { setError("Enter a display name."); return; }
    if (!founder) { setError("Your account is unavailable. Refresh and try again."); return; }
    setError("");
    setPhotoError("");
    setBusy(true);
    const storage = db().storage.from("profile-avatars");
    const previousPath = founder.avatarPath;
    let uploadedPath: string | null = null;
    try {
      const changes: { full_name: string; avatar_path?: string | null } = { full_name: fullName };
      if (photoFile) {
        const extension = photoFile.type === "image/jpeg" ? "jpg" : photoFile.type === "image/png" ? "png" : "webp";
        const path = `${founder.userId}/${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await storage.upload(path, photoFile, { contentType: photoFile.type, cacheControl: "3600", upsert: false });
        if (uploadError) {
          setPhotoError(profilePhotoSaveError(uploadError, "upload"));
          setBusy(false);
          return;
        }
        uploadedPath = path;
        changes.avatar_path = path;
      } else if (removePhoto) {
        changes.avatar_path = null;
      }
      const { error: saveError } = await db().auth.updateUser({ data: changes });
      if (saveError) {
        if (uploadedPath) await storage.remove([uploadedPath]).catch(() => undefined);
        if (photoFile || removePhoto) setPhotoError(profilePhotoSaveError(saveError, "save"));
        else setError("Your profile could not be saved. Try again.");
        setBusy(false);
        return;
      }
    } catch (saveError) {
      if (uploadedPath) await storage.remove([uploadedPath]).catch(() => undefined);
      if (photoFile || removePhoto) setPhotoError(profilePhotoSaveError(saveError, uploadedPath ? "save" : "upload"));
      else setError("Your profile could not be saved. Try again.");
      setBusy(false);
      return;
    }
    setName(fullName);
    undoPhotoChange();
    try {
      await reload();
      notify("Profile updated.");
    } catch {
      notify("Profile saved. Refresh to see the latest photo.");
    } finally {
      setBusy(false);
    }
    if (previousPath && (uploadedPath || removePhoto)) await storage.remove([previousPath]).catch(() => undefined);
  }

  async function signOut() {
    setSigningOut(true);
    try {
      const { error: signOutError } = await db().auth.signOut();
      if (signOutError) throw signOutError;
      navigate("/sign-in", { replace: true });
    } catch {
      notify("Could not sign out. Try again.", true);
    } finally {
      setSigningOut(false);
    }
  }

  async function requestPasswordReset() {
    if (!founder?.email || passwordResetBusy) return;
    setPasswordResetBusy(true);
    setPasswordResetError("");
    setPasswordResetSent(false);
    try {
      const { error: resetError } = await db().auth.resetPasswordForEmail(founder.email, {
        redirectTo: `${location.origin}/auth/callback?flow=recovery`,
      });
      if (resetError) throw resetError;
      setPasswordResetSent(true);
    } catch {
      setPasswordResetError("We couldn't send the reset email. Try again in a moment.");
    } finally {
      setPasswordResetBusy(false);
    }
  }

  return <div className="sf-settings-page">
    <PageHeader eyebrow="Workspace" title="Settings" description="Manage your account and review your workspace." action={<button className="button button-primary sf-settings-header-save" form="settings-profile-form" disabled={busy || unchanged}>{busy ? "Saving…" : "Save changes"}</button>}/>
    <div className="sf-settings-grid">
      <section className="sf-settings-card sf-settings-profile">
        <header className="sf-settings-card-head"><span className="sf-settings-icon"><CrmIcon name="users"/></span><div><h2>Account profile</h2><p>Update your display name and photo.</p></div></header>
        <div className="sf-settings-profile-body"><div className="sf-settings-photo-picker"><button className="sf-settings-avatar sf-settings-avatar-button" type="button" disabled={busy} aria-label={founder?.avatarPath ? "Change profile photo" : "Add profile photo"} onClick={() => photoInputRef.current?.click()}>{avatarImage ? <img src={avatarImage} alt=""/> : avatar}<span className="sf-settings-photo-edit" aria-hidden="true"><CrmIcon name="camera"/></span></button><input ref={photoInputRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; void choosePhoto(file); }}/></div><form id="settings-profile-form" className="sf-settings-form" onSubmit={save}>
          <label><span>Display name</span><input type="text" autoComplete="name" maxLength={120} value={name} aria-invalid={Boolean(error)} aria-describedby={error ? "settings-name-error" : undefined} onChange={(event) => { setName(event.target.value); if (error) setError(""); }}/></label>
          <label><span>Sign-in email</span><input type="email" value={founder?.email ?? ""} readOnly/></label>
          <div className="sf-settings-photo-controls"><div><button type="button" disabled={busy} onClick={() => photoInputRef.current?.click()}>Choose photo</button>{(photoFile || removePhoto || founder?.avatarPath) && <button type="button" disabled={busy} onClick={() => { if (photoFile || removePhoto) undoPhotoChange(); else { setPhotoError(""); setRemovePhoto(true); } }}>{photoFile ? "Cancel selection" : removePhoto ? "Undo removal" : "Remove photo"}</button>}</div><small>JPG, PNG, or WebP · up to 2 MB</small>{(photoFile || removePhoto) && <small className="sf-settings-photo-pending" role="status">{photoFile ? "New photo ready to save" : "Photo will be removed when saved"}</small>}{photoError && <p className="sf-settings-error" role="alert">{photoError}</p>}</div>
          {error && <p id="settings-name-error" className="sf-settings-error" role="alert">{error}</p>}
          <button className="button button-primary sf-settings-inline-save" disabled={busy || unchanged}>{busy ? "Saving…" : "Save changes"}</button>
        </form></div>
      </section>
      <section className="sf-settings-card sf-settings-company">
        <header className="sf-settings-card-head"><span className="sf-settings-icon"><CrmIcon name="projects"/></span><div><h2>Company information</h2><p>Workspace identity and your access.</p></div></header>
        <div className="sf-settings-company-body"><dl className="sf-settings-details"><div><dt>Workspace</dt><dd>{founder?.workspaceName || "Unavailable"}</dd></div><div><dt>Your role</dt><dd>{role}</dd></div><div><dt>Access</dt><dd><span className="sf-settings-status">Active member</span></dd></div></dl><div className="sf-settings-brand"><img src="/strataforge-mark.png" alt="StrataForge mark"/><small>Workspace brand</small></div></div>
      </section>
      <section className="sf-settings-card sf-settings-preferences">
        <header className="sf-settings-card-head"><span className="sf-settings-icon"><CrmIcon name="settings"/></span><div><h2>Display defaults</h2><p>Current regional and appearance settings.</p></div></header>
        <dl className="sf-settings-details"><div><dt>Timezone</dt><dd>Asia/Manila · UTC+08:00</dd></div><div><dt>Interface</dt><dd>English</dd></div><div><dt>Appearance</dt><dd>Light</dd></div></dl>
        <p className="sf-settings-note">These workspace defaults are fixed in this release.</p>
      </section>
      <section className="sf-settings-card sf-settings-security">
        <header className="sf-settings-card-head"><span className="sf-settings-icon"><CrmIcon name="security"/></span><div><h2>Security</h2><p>Review the protection on your founder account.</p></div></header>
        <div className="sf-settings-security-body"><div><span>Two-factor authentication</span><strong>{founder?.aal === "aal2" ? "Verified" : "Verification required"}</strong><small>An authenticator is required to access CRM records.</small></div><div><span>Workspace access</span><strong>{role}</strong><small>Your access follows your active workspace membership.</small></div></div>
        <div className="sf-settings-security-actions"><Link className="button button-secondary" to="/account">Manage authenticator</Link><button className="button button-secondary" type="button" disabled={passwordResetBusy || !founder?.email} onClick={() => void requestPasswordReset()}>{passwordResetBusy ? "Sending…" : passwordResetSent ? "Send another reset email" : "Request password reset"}</button><button className="button button-secondary" type="button" disabled={signingOut} onClick={() => void signOut()}>{signingOut ? "Signing out…" : "Sign out"}</button></div>
        {passwordResetSent && <p className="form-notice form-notice-success" role="status">If this account can receive recovery email, a reset link is on its way to {founder?.email}.</p>}
        {passwordResetError && <p className="sf-settings-error" role="alert">{passwordResetError}</p>}
      </section>
    </div>
  </div>;
}

export function Security() {
  return <div className="sf-security-page">
    <PageHeader eyebrow="Account protection" title="Security" description="Manage the authenticator protecting your founder account." action={<Link className="button button-secondary sf-security-back" to="/settings"><CrmIcon name="back"/>Back to settings</Link>}/>
    <MfaSettings/>
  </div>;
}
export function MfaPage() {
  const navigate = useNavigate();
  const { founder } = useAuth();
  const [factorId, setFactorId] = useState("");
  const [qr, setQr] = useState("");
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [codeRejected, setCodeRejected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [backBusy, setBackBusy] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (founder?.aal === "aal2") {
      navigate("/dashboard", { replace: true });
      return;
    }
    void db().auth.mfa.listFactors().then(({ data, error: factorError }) => {
      if (factorError) setError("Security factors could not be loaded. Refresh to retry.");
      else {
        const factor = data?.totp?.find((item: any) => item.status === "verified");
        if (factor) setFactorId(factor.id);
      }
      setChecking(false);
    });
  }, [founder, navigate]);

  async function start() {
    setBusy(true);
    setError("");
    const { data, error: enrollError } = await db().auth.mfa.enroll({ factorType: "totp" });
    setBusy(false);
    if (enrollError || !data?.totp) {
      setError("Could not start authenticator enrollment.");
      return;
    }
    setFactorId(data.id);
    setQr(data.totp.qr_code);
    setSecret(data.totp.secret);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setCodeRejected(false);
    const challenge = await db().auth.mfa.challenge({ factorId });
    if (challenge.error || !challenge.data) {
      setError("Could not verify authenticator code.");
      setBusy(false);
      return;
    }
    const result = await db().auth.mfa.verify({ factorId, challengeId: challenge.data.id, code });
    setBusy(false);
    if (result.error) {
      setCodeRejected(true);
      setError("That code did not work. Try again.");
      return;
    }
    navigate("/dashboard", { replace: true });
  }

  async function backToSignIn() {
    if (busy || backBusy) return;
    setBackBusy(true);setError("");
    const {error:signOutError}=await db().auth.signOut({scope:"local"});
    if(signOutError){setError("Could not return to sign in. Please try again.");setBackBusy(false);return;}
    navigate("/sign-in",{replace:true});
  }

  return <div className="auth-shell auth-shell-login auth-shell-verify">
    <AuthBrandPanel/><div className="auth-panel auth-login-panel auth-verify-panel">
      <div className="auth-card auth-card-login auth-verify-card mfa-card">
        <button type="button" className="auth-verify-back" onClick={()=>void backToSignIn()} disabled={busy||backBusy}>{backBusy?"Returning…":"← Back to sign in"}</button>
        <div className="auth-verify-brand"><img src="/strataforge-mark.png" alt=""/><span><strong>STRATA<span>FORGE</span></strong><small>CRM · ACCOUNT SECURITY</small></span></div>

        <p className="eyebrow">Account protection</p>
        <h1>{checking ? "Checking your security" : factorId ? "Verify your identity" : "Secure your account"}</h1>
        <p className="auth-verify-intro">{checking ? "Checking your verification method…" : factorId ? "Enter the six-digit code from your authenticator app to finish signing in." : "Set up an authenticator app before opening your workspace."}</p>
        {checking ? <p className="auth-verify-loading" role="status">Loading your security settings…</p> : !factorId ? <button className="button button-primary button-full auth-submit" type="button" onClick={() => void start()} disabled={busy}>{busy ? "Preparing…" : "Set up authenticator"}</button> : <>
          {qr && <div className="auth-verify-enrollment"><p>Scan this code with your authenticator app, then enter the six-digit code it shows.</p><img className="mfa-qr" src={qr} alt="Authenticator setup QR code"/><details className="secret-details"><summary>Can’t scan the code?</summary><p><code>{secret}</code></p></details></div>}
          <form className={cx("auth-form auth-verify-form", codeRejected && "is-error")} onSubmit={submit}>
            <label htmlFor="verification-code">Authenticator code</label>
            <div className={cx("auth-otp-control", codeRejected && "is-invalid")}>
              <input id="verification-code" className="auth-verify-code-input" aria-label="Six-digit authenticator code" aria-invalid={codeRejected} value={code} onChange={event => { const digits = event.target.value.replace(/\D/g, "").slice(0, 6); setCode(digits); setCodeRejected(false); setError(""); }} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required/>
              <div className="auth-otp-digits" aria-hidden="true">{Array.from({length: 6}, (_, index) => { const digit = code[index] ?? ""; return <span key={`${index}-${digit}`} className={cx("auth-otp-digit", digit && "is-filled")}>{digit || <span className="auth-otp-placeholder">0</span>}</span>; })}</div>
            </div>
            <span className="auth-verify-hint">Use the current six-digit code. Codes refresh every 30 seconds.</span>
            <button className="button button-primary button-full auth-submit" disabled={busy}>{busy ? "Verifying…" : "Verify and continue"}</button>
          </form>
        </>}
        {error && <p className="form-error" role="alert">{error}</p>}
      </div>
    </div>
  </div>;
}function MfaSettings() {
  const { founder, reload } = useAuth();
  const notify = useToast();
  const [factors, setFactors] = useState<Array<{ id: string; status: string }>>([]);
  const [factorId, setFactorId] = useState("");
  const [qr, setQr] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const verified = factors.find((factor) => factor.status === "verified");

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const { data, error } = await db().auth.mfa.listFactors();
      if (error) throw error;
      setFactors(data?.totp ?? []);
    } catch {
      setLoadError("Authenticator status could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function enroll() {
    setBusy(true);
    setActionError("");
    try {
      const { data, error } = await db().auth.mfa.enroll({ factorType: "totp" });
      if (error || !data?.totp) throw error ?? new Error("Enrollment failed");
      setFactorId(data.id);
      setQr(data.totp.qr_code);
    } catch {
      setActionError("Could not start authenticator setup. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!verified || !window.confirm("Remove this authenticator? You will need to set one up again to open the CRM.")) return;
    setBusy(true);
    setActionError("");
    try {
      const { error } = await db().auth.mfa.unenroll({ factorId: verified.id });
      if (error) throw error;
      notify("Authenticator removed.");
      setQr("");
      await load();
      await reload();
    } catch {
      setActionError("Could not remove this authenticator. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setActionError("");
    try {
      const challenge = await db().auth.mfa.challenge({ factorId });
      if (challenge.error || !challenge.data) throw challenge.error ?? new Error("Challenge failed");
      const result = await db().auth.mfa.verify({ factorId, challengeId: challenge.data.id, code });
      if (result.error) throw result.error;
      setQr("");
      setCode("");
      await load();
      await reload();
      notify("Authenticator verified.");
    } catch {
      setActionError("That code could not be verified. Check it and try again.");
    } finally {
      setBusy(false);
    }
  }

  const protectedAccount = Boolean(verified && !loadError && !loading);
  const status = loading ? "Checking" : loadError ? "Unavailable" : verified ? "Protected" : "Setup required";
  return <div className="sf-security-content">
    <section className={`sf-security-overview${protectedAccount ? " is-protected" : ""}`} aria-live="polite">
      <span className="sf-security-overview-icon"><CrmIcon name="security"/></span>
      <div><p className="sf-security-kicker">Account protection</p><h2>{loading ? "Checking your authenticator" : loadError ? "Protection status unavailable" : verified ? "Your account is protected" : "Set up your authenticator"}</h2><p>{protectedAccount ? "A verified authenticator protects access to your CRM workspace." : "An authenticator is required for access to CRM records."}</p></div>
      <span className={`sf-security-overview-status${protectedAccount ? " is-active" : ""}`}>{status}</span>
    </section>
    <div className="sf-security-layout">
      <section className="sf-security-card">
        <header className="sf-security-card-heading"><span className="sf-settings-icon"><CrmIcon name="security"/></span><div><h2>Authenticator app</h2><p>Use a six-digit code to protect your account.</p></div></header>
        {loading ? <p className="sf-security-message" role="status">Checking your authenticator…</p> : loadError ? <div className="sf-security-load-error" role="alert"><p>{loadError}</p><button className="button button-secondary" type="button" onClick={() => void load()}>Try again</button></div> : verified ? <div className="sf-security-factor"><div className="sf-security-factor-status"><CrmIcon name="check"/><div><strong>Authenticator active</strong><span>Your account has a verified second factor.</span></div></div><p>Removing it will require you to set up another authenticator before opening the CRM again.</p><button className="button button-secondary sf-security-remove" type="button" disabled={busy} onClick={() => void remove()}>{busy ? "Removing…" : "Remove authenticator"}</button></div> : qr ? <div className="sf-security-setup"><p>Scan this code with your authenticator app, then enter the six-digit code it shows.</p><img className="mfa-qr" src={qr} alt="Scan this authenticator QR code"/><form className="sf-security-code-form" onSubmit={verify}><label htmlFor="security-code">Authenticator code</label><input id="security-code" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required/><button className="button button-primary" disabled={busy}>{busy ? "Verifying…" : "Verify authenticator"}</button></form></div> : <div className="sf-security-setup"><p>An authenticator is required to access your workspace. Set one up to continue using CRM records.</p><button className="button button-primary" type="button" disabled={busy} onClick={() => void enroll()}>{busy ? "Preparing…" : "Set up authenticator"}</button></div>}
        {actionError && <p className="sf-security-action-error" role="alert">{actionError}</p>}
      </section>
      <aside className="sf-security-card sf-security-access"><header className="sf-security-card-heading"><span className="sf-settings-icon"><CrmIcon name="users"/></span><div><h2>Current access</h2><p>Your signed-in account and workspace.</p></div></header><dl><div><dt>Signed in as</dt><dd>{founder?.email || "Unavailable"}</dd></div><div><dt>Workspace</dt><dd>{founder?.workspaceName || "Unavailable"}</dd></div><div><dt>Verification</dt><dd>{founder?.aal === "aal2" ? "AAL2 verified" : "Verification required"}</dd></div></dl></aside>
    </div>
  </div>;
}


function AuthBrandPanel() {
  return <section className="auth-brand-panel" aria-label="StrataForge CRM overview">
    <div className="auth-brand-top">
      <div className="auth-brand-lockup"><img src="/strataforge-mark.png" alt=""/><span><strong>STRATA<span>FORGE</span></strong><small>CRM</small></span></div>
      <div className="auth-brand-motto">Manage <i/> Track <i/> Grow</div>
    </div>
    <div className="auth-brand-copy">
      <p className="eyebrow eyebrow-light">All-in-one CRM for modern businesses <span/></p>
      <h2>Turn conversations<br/>into <span>opportunities.</span></h2>
      <p className="auth-brand-description">StrataForge CRM helps you manage leads, clients, projects, and communication — all in one place.</p>
      <div className="auth-feature-grid">
        <div><span><CrmIcon name="users"/></span><p><strong>Manage Leads</strong><small>Capture and track potential clients.</small></p></div>
        <div><span><CrmIcon name="clients"/></span><p><strong>Build Client Relationships</strong><small>Keep contact and project details together.</small></p></div>
        <div><span><CrmIcon name="projects"/></span><p><strong>Organize Projects</strong><small>Turn inquiries into real project work.</small></p></div>
        <div><span><CrmIcon name="reports"/></span><p><strong>Track Growth</strong><small>Use reports to guide better decisions.</small></p></div>
      </div>
    </div>
    <img className="auth-brand-watermark" src="/strataforge-mark.png" alt="" aria-hidden="true"/>
    <p className="auth-brand-caption">A clearer path from first conversation to finished work.</p>
  </section>;
}
export function AuthPage({ mode }: { mode: "sign-in" | "forgot" | "set-password" | "verify" }) {
 const {founder,reload}=useAuth();const navigate=useNavigate();const notify=useToast();const [searchParams]=useSearchParams();const linkError=searchParams.get("error")==="link";const [email,setEmail]=useState("");const [password,setPassword]=useState("");const [passwordVisible,setPasswordVisible]=useState(false);const [code,setCode]=useState("");const [factorId,setFactorId]=useState("");const [factorLoading,setFactorLoading]=useState(false);const [error,setError]=useState(()=>linkError?"This recovery link has expired or was already used. Request a new one.":"");const [success,setSuccess]=useState("");const [busy,setBusy]=useState(false);const [qr,setQr]=useState("");
  useEffect(()=>{setError(linkError?"This recovery link has expired or was already used. Request a new one.":"");setSuccess("");setPassword("");},[mode,linkError]);
  useEffect(()=>{if(mode==="sign-in"&&founder)navigate("/verify",{replace:true});},[mode,founder,navigate]);
 useEffect(()=>{if((mode==="verify"&&founder?.aal==="aal1")||(mode==="set-password"&&founder?.aal!=="aal2")){let active=true;setFactorLoading(true);void db().auth.mfa.listFactors().then(({data,error:e})=>{if(!active)return;const f=data?.totp?.find((x:any)=>x.status==="verified");if(f)setFactorId(f.id);else if(mode==="set-password")setError(e?"Your authenticator could not be checked. Refresh the recovery page and try again.":"No verified authenticator was found. Contact your workspace administrator to restore account access.");setFactorLoading(false);});return()=>{active=false;};}},[founder?.aal,mode]);
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();setBusy(true);setError("");setSuccess("");
    try{
      if(mode==="sign-in"){
        let result=await db().auth.signInWithPassword({email:email.trim(),password});
        if(result.error?.name==="AuthRetryableFetchError"){
          await new Promise(resolve=>window.setTimeout(resolve,700));
          result=await db().auth.signInWithPassword({email:email.trim(),password});
        }
        if(result.error?.name==="AuthRetryableFetchError")throw new Error("Could not connect to sign-in right now. Check your internet connection and try again.");
        if(result.error)throw result.error;await reload();
      }else if(mode==="forgot"){
        const {error:e}=await db().auth.resetPasswordForEmail(email.trim(),{redirectTo:`${location.origin}/auth/callback?flow=recovery`});if(e)throw e;setSuccess("If this address has an account, a recovery email is on its way. Check your inbox and spam folder.");
      }else if(mode==="set-password"){
        if(founder?.aal!=="aal2"){
          if(!factorId)throw new Error("No verified authenticator was found. Contact your workspace administrator to restore account access.");
          const challenge=await db().auth.mfa.challenge({factorId});if(challenge.error||!challenge.data)throw challenge.error??new Error("Could not start authenticator verification.");
          const verified=await db().auth.mfa.verify({factorId,challengeId:challenge.data.id,code});if(verified.error)throw new Error("That authenticator code did not work. Try again.");
          await reload();
        }
        const {error:e}=await db().auth.updateUser({password});if(e)throw e;notify("Password updated.");navigate("/verify");
      }else{
        let id=factorId;if(!id){const {data,error:e}=await db().auth.mfa.enroll({factorType:"totp"});if(e||!data)throw e??new Error("Could not start authenticator enrollment.");id=data.id;setFactorId(id);setQr(data.totp.qr_code);if(!code){setBusy(false);return;}}
        const challenge=await db().auth.mfa.challenge({factorId:id});if(challenge.error||!challenge.data)throw challenge.error??new Error("Challenge failed");const verified=await db().auth.mfa.verify({factorId:id,challengeId:challenge.data.id,code});if(verified.error)throw verified.error;await reload();navigate("/dashboard");
      }
    }catch(e){setError(e instanceof Error?e.message:"This request could not be completed.");}finally{setBusy(false);}
  }
  async function signInWithGoogle() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const { error: oauthError } = await db().auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${location.origin}/auth/callback` }
      });
      if (oauthError) throw oauthError;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Google sign-in could not be started.");
      setBusy(false);
    }
  }

  const signInMode = mode === "sign-in";
  const recoveryMode = mode === "forgot" || mode === "set-password";
  const brandedAuthMode = signInMode || recoveryMode;
  return <div className={cx("auth-shell", brandedAuthMode && "auth-shell-login", mode === "verify" && "auth-shell-verify", recoveryMode && "auth-shell-recovery")}>
    {brandedAuthMode&&<AuthBrandPanel/>}
    <div className={cx("auth-panel", brandedAuthMode && "auth-login-panel", recoveryMode && "auth-recovery-panel")}>
      <div className={cx("auth-card", brandedAuthMode && "auth-card-login", recoveryMode && "auth-card-recovery")}>
        {recoveryMode&&<Link to="/sign-in" className="auth-recovery-brand"><img src="/strataforge-mark.png" alt=""/><span><strong>STRATA<span>FORGE</span></strong><small>CRM · ACCOUNT RECOVERY</small></span></Link>}
        {signInMode && <div className="auth-login-brand"><img src="/strataforge-mark.png" alt=""/><strong>STRATA<span>FORGE</span></strong><small>CRM</small></div>}{mode === "verify" && <div className="auth-verify-brand"><img src="/strataforge-mark.png" alt=""/><span><strong>STRATA<span>FORGE</span></strong><small>CRM · ACCOUNT SECURITY</small></span></div>}
        <p className="eyebrow">{signInMode ? "Founder access" : mode === "forgot" ? "Account recovery" : mode === "set-password" ? "Secure your account" : "Account protection"}</p>
        <h1>{signInMode ? "Welcome back" : mode === "forgot" ? "Reset your password" : mode === "set-password" ? "Choose a new password" : "Verify your identity"}</h1>
        <p className={cx(brandedAuthMode && "auth-login-intro", mode === "verify" && "auth-verify-intro")}>{signInMode ? "Log in to your StrataForge CRM account to continue." : mode === "forgot" ? "We’ll email a password recovery link." : mode === "set-password" ? "Set a new password for your account." : "Enter the six-digit code from your authenticator app to finish signing in."}</p>
        <form className="auth-form" onSubmit={submit}>
          {(signInMode || mode === "forgot") && <>
            <label htmlFor="email">Email address</label>
            {signInMode ? <div className="auth-email-input"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/></svg><input id="email" type="email" autoComplete="email" required value={email} placeholder="you@example.com" onChange={event => setEmail(event.target.value)}/></div> : <input id="email" type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)}/>}
          </>}
          {(signInMode || mode === "set-password") && <>
            <label htmlFor="password">{signInMode ? "Password" : "New password"}</label>
            <div className={cx("password-input-wrap", signInMode && "auth-signin-password")}>
              {signInMode && <svg className="auth-password-lock" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>}
              <input id="password" type={passwordVisible ? "text" : "password"} autoComplete={signInMode ? "current-password" : "new-password"} required minLength={mode === "set-password" ? 12 : 1} value={password} placeholder={signInMode ? "Enter your password" : ""} onChange={event => setPassword(event.target.value)}/>
              <button type="button" className="password-input-toggle" aria-label={passwordVisible ? "Hide password" : "Show password"} aria-pressed={passwordVisible} onClick={() => setPasswordVisible(value => !value)}><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{passwordVisible ? <><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></> : <><path d="m3 3 18 18M10.6 10.6a2 2 0 0 0 2.8 2.8"/><path d="M9.9 5.2A10.8 10.8 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3 3.8M6.2 6.2C3.5 8 2 12 2 12s3.6 7 10 7c1 0 2-.2 2.9-.5"/></>}</svg></button>
            </div>
            {mode === "set-password" && <span className="form-hint">Use at least 12 characters.</span>}
            {signInMode && <div className="auth-forgot-row"><Link to="/forgot-password">Forgot password?</Link></div>}
          </>}
          {mode === "set-password" && founder?.aal !== "aal2" && <><label htmlFor="recovery-code">Authenticator code</label><input id="recovery-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} disabled={factorLoading || !factorId} onChange={event => setCode(event.target.value.replace(/\D/g, ""))}/><span className="form-hint">Enter the code from your authenticator app to confirm this password change.</span></>}
          {mode === "verify" && <>{qr && <img className="mfa-qr" src={qr} alt="Authenticator QR code"/>}<label htmlFor="code">Authenticator code</label><input id="code" className="auth-verify-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} placeholder="000000" onChange={event => setCode(event.target.value.replace(/\D/g, ""))}/><span className="auth-verify-hint">Use the current six-digit code. Codes refresh every 30 seconds.</span></>}
          {success && <p className="form-notice form-notice-success" role="status">{success}</p>}
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="button button-primary button-full auth-submit" disabled={busy}>{busy ? "Please wait…" : signInMode ? "Log In" : mode === "forgot" ? "Send recovery email" : mode === "set-password" ? "Update password" : "Verify and continue"}</button>
        </form>
        {signInMode && <>
          <div className="auth-divider"><span>or</span></div>
          <button className="button auth-provider-button button-full" type="button" disabled={busy} onClick={() => void signInWithGoogle()}><svg className="google-mark" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.89c-.58 2.96-2.26 5.47-4.76 7.16l7.73 6C44.37 37.98 46.98 31.96 46.98 24.55Z"/><path fill="#FBBC05" d="M10.54 28.59a14.4 14.4 0 0 1 0-9.18l-7.98-6.19a23.9 23.9 0 0 0 0 21.56l7.98-6.19Z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.9-5.82l-7.73-6c-2.14 1.44-4.88 2.3-8.17 2.3-6.26 0-11.57-4.22-13.46-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z"/></svg>Continue with Google</button>
          <p className="auth-login-footer">Don’t have an account? <span>Contact your administrator.</span></p>
        </>}
        {!signInMode && mode !== "verify" && <p className={recoveryMode?"auth-recovery-return":""}><Link to="/sign-in">← Return to sign in</Link></p>}
      </div>
    </div>
  </div>;
}

export function Setup(){const navigate=useNavigate();useEffect(()=>{if(getSupabaseConfig())navigate("/sign-in",{replace:true});},[navigate]);return <div className="auth-shell"><div className="auth-card"><h1>Supabase setup needed</h1><p>Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> in <code>.env.local</code>, then restart the development server.</p></div></div>}
export function AccessPending(){
  const navigate=useNavigate();
  const {reload,founder}=useAuth();
  const [signingOut,setSigningOut]=useState(false);
  const [refreshing,setRefreshing]=useState(false);
  const [error,setError]=useState("");
  async function refreshAccess(){
    if(refreshing||signingOut)return;
    setRefreshing(true);
    setError("");
    try{
      await reload();
      navigate("/dashboard",{replace:true});
    }catch{
      setError("Could not check workspace access. Please try again.");
    }finally{
      setRefreshing(false);
    }
  }
  async function signOut(){
    if(signingOut||refreshing)return;
    setSigningOut(true);
    setError("");
    try{
      const {error:signOutError}=await db().auth.signOut({scope:"local"});
      if(signOutError)throw signOutError;
      navigate("/sign-in",{replace:true});
      void reload().catch(()=>undefined);
    }catch{
      setError("Could not sign out. Please try again.");
    }finally{
      setSigningOut(false);
    }
  }
  return <div className="auth-shell"><div className="auth-card"><h1>Workspace access pending</h1><p>Your account is not an active member of this workspace. Ask an administrator to grant access to this exact account:</p><p className="pending-account-email"><strong>{founder?.email || "Signed-in account unavailable"}</strong></p>{error&&<p className="form-error" role="alert">{error}</p>}<div className="pending-access-actions"><button type="button" className="button button-primary" disabled={signingOut||refreshing} onClick={()=>void refreshAccess()}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M16 7a6.5 6.5 0 0 0-11-2L3 7m0 0V3m0 4h4M4 13a6.5 6.5 0 0 0 11 2l2-2m0 0v4m0-4h-4"/></svg>{refreshing?"Checking access…":"Refresh access"}</button><button type="button" className="button button-secondary" disabled={signingOut||refreshing} onClick={()=>void signOut()}>{signingOut?"Signing out…":"Sign out"}</button></div></div></div>;
}

export function AuthCallback(){
  const navigate=useNavigate();
  const {reload}=useAuth();
  // React StrictMode replays effects in development. Keep one exchange for each callback URL:
  // recovery codes and token hashes are single-use, so a second exchange would fail.
  const completion=useRef<Promise<string>|null>(null);
  useEffect(()=>{
    let active=true;
    completion.current??=(async()=>{
      const url=new URL(location.href);
      const fragment=new URLSearchParams(url.hash.slice(1));
      const type=url.searchParams.get("type")??fragment.get("type");
      const next=url.searchParams.get("next")??fragment.get("next");
      const isRecovery=type==="recovery"||url.searchParams.get("flow")==="recovery"||next==="/set-password";
      try{
        if(url.searchParams.has("error")||fragment.has("error"))throw new Error("Auth link failed");
        const code=url.searchParams.get("code");
        const tokenHash=url.searchParams.get("token_hash");
        if(code){
          const {error}=await db().auth.exchangeCodeForSession(code);
          if(error)throw error;
        }else if(tokenHash&&(type==="recovery"||type==="invite"||type==="email")){
          const {error}=await db().auth.verifyOtp({token_hash:tokenHash,type});
          if(error)throw error;
        }else if(fragment.has("access_token")){
          const access_token=fragment.get("access_token");
          const refresh_token=fragment.get("refresh_token");
          if(!access_token||!refresh_token)throw new Error("Incomplete auth session");
          const {error}=await db().auth.setSession({access_token,refresh_token});
          if(error)throw error;
        }else{
          throw new Error("Missing auth credentials");
        }
        await reload();
        return isRecovery||type==="invite"?"/set-password":"/verify";
      }catch{
        return isRecovery?"/forgot-password?error=link":"/sign-in?error=link";
      }
    })();
    void completion.current.then(path=>{if(active)navigate(path,{replace:true});});
    return()=>{active=false;};
  },[navigate,reload]);
  return <div className="page-loading" role="status">Completing secure sign-in…</div>;
}
