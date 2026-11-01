import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { db, useAuth, useToast, CrmIcon, PageHeader } from "./shared";

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
        if (uploadError) throw new Error("Profile photo could not be uploaded. Try again.");
        uploadedPath = path;
        changes.avatar_path = path;
      } else if (removePhoto) {
        changes.avatar_path = null;
      }
      const { error: saveError } = await db().auth.updateUser({ data: changes });
      if (saveError) throw saveError;
    } catch {
      if (uploadedPath) await storage.remove([uploadedPath]).catch(() => undefined);
      setError("Your profile could not be saved. Try again.");
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
        <div className="sf-settings-security-actions"><Link className="button button-secondary" to="/account">Manage authenticator</Link><button className="button button-secondary" type="button" disabled={signingOut} onClick={() => void signOut()}>{signingOut ? "Signing out…" : "Sign out"}</button></div>
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
export function MfaPage(){const navigate=useNavigate();const {founder}=useAuth();const [factorId,setFactorId]=useState("");const [qr,setQr]=useState("");const [secret,setSecret]=useState("");const [code,setCode]=useState("");const [error,setError]=useState("");const [busy,setBusy]=useState(false);const [checking,setChecking]=useState(true);useEffect(()=>{if(founder?.aal==="aal2"){navigate("/dashboard",{replace:true});return;}void db().auth.mfa.listFactors().then(({data,error:e})=>{if(e){setError("Security factors could not be loaded. Refresh to retry.");}else{const factor=data?.totp?.find((item:any)=>item.status==="verified");if(factor)setFactorId(factor.id);}setChecking(false);});},[founder,navigate]);async function start(){setBusy(true);setError("");const {data,error:e}=await db().auth.mfa.enroll({factorType:"totp"});setBusy(false);if(e||!data?.totp){setError("Could not start authenticator enrollment.");return;}setFactorId(data.id);setQr(data.totp.qr_code);setSecret(data.totp.secret);}async function submit(event:FormEvent){event.preventDefault();setBusy(true);setError("");const challenge=await db().auth.mfa.challenge({factorId});if(challenge.error||!challenge.data){setError("Could not verify authenticator code.");setBusy(false);return;}const result=await db().auth.mfa.verify({factorId,challengeId:challenge.data.id,code});setBusy(false);if(result.error){setError("That code did not work. Try again.");return;}navigate("/dashboard",{replace:true});}return <div className="auth-shell"><div className="auth-card mfa-card"><p className="eyebrow">Account protection</p><h1>One more step</h1><p>Verify your account to open the workspace.</p>{checking?<p role="status">Checking your verification method…</p>:!factorId?<><p>Set up an authenticator app before opening the CRM.</p><button className="button button-primary button-full" onClick={()=>void start()} disabled={busy}>{busy?"Preparing…":"Set up authenticator"}</button></>:<>{qr&&<><p>Scan this code in your authenticator app, or enter the setup key manually.</p><img className="mfa-qr" src={qr} alt="Authenticator setup QR code"/><details className="secret-details"><summary>Can’t scan the code?</summary><p><code>{secret}</code></p></details></>}<form className="auth-form" onSubmit={submit}><label htmlFor="verification-code">Authenticator code</label><input id="verification-code" value={code} onChange={event=>setCode(event.target.value.replace(/\D/g,""))} inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required/><button className="button button-primary button-full" disabled={busy}>{busy?"Verifying…":"Verify and continue"}</button></form></>}{error&&<p className="form-error" role="alert">{error}</p>}</div></div>}
function MfaSettings() {
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


export function AuthPage({ mode }: { mode: "sign-in" | "forgot" | "set-password" | "verify" }) {
 const {founder,reload}=useAuth();const navigate=useNavigate();const notify=useToast();const [searchParams]=useSearchParams();const [email,setEmail]=useState("");const [password,setPassword]=useState("");const [code,setCode]=useState("");const [factorId,setFactorId]=useState("");const [error,setError]=useState(()=>searchParams.get("error")==="link"?"This recovery link has expired or was already used. Request a new one.":"");const [busy,setBusy]=useState(false);const [qr,setQr]=useState("");
 useEffect(()=>{if(mode==="verify"&&founder?.aal==="aal1")void db().auth.mfa.listFactors().then(({data})=>{const f=data?.totp?.find((x:any)=>x.status==="verified");if(f)setFactorId(f.id);});},[founder,mode]);
 async function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();setBusy(true);setError("");try{if(mode==="sign-in"){const {error:e}=await db().auth.signInWithPassword({email:email.trim(),password});if(e)throw e;await reload();navigate("/verify");}else if(mode==="forgot"){const {error:e}=await db().auth.resetPasswordForEmail(email.trim(),{redirectTo:`${location.origin}/auth/callback?next=/set-password`});if(e)throw e;setError("If that address belongs to a founder account, a recovery email is on its way.");}else if(mode==="set-password"){const {error:e}=await db().auth.updateUser({password});if(e)throw e;notify("Password updated.");navigate("/verify");}else{let id=factorId;if(!id){const {data,error:e}=await db().auth.mfa.enroll({factorType:"totp"});if(e||!data)throw e??new Error("Could not start authenticator enrollment.");id=data.id;setFactorId(id);setQr(data.totp.qr_code);if(!code){setBusy(false);return;}}const challenge=await db().auth.mfa.challenge({factorId:id});if(challenge.error||!challenge.data)throw challenge.error??new Error("Challenge failed");const verified=await db().auth.mfa.verify({factorId:id,challengeId:challenge.data.id,code});if(verified.error)throw verified.error;await reload();navigate("/dashboard");}}catch(e){setError(e instanceof Error?e.message:"This request could not be completed.");}finally{setBusy(false);}}
 return <div className="auth-shell"><div className="auth-panel"><Link to="/sign-in" className="brand-link"><img width="70" src="/strataforge-mark.png" alt="StrataForge"/></Link><div className="auth-card"><p className="eyebrow">Founder access</p><h1>{mode==="sign-in"?"Welcome back":mode==="forgot"?"Reset your password":mode==="set-password"?"Choose a new password":"One more step"}</h1><p>{mode==="sign-in"?"Sign in to your StrataForge workspace.":mode==="forgot"?"We’ll email a password recovery link.":mode==="set-password"?"Set a new password for your account.":"Verify your account to open the workspace."}</p>{mode==="sign-in"&&<button className="button button-google button-full" disabled={busy} onClick={async()=>{const {error:e}=await db().auth.signInWithOAuth({provider:"google",options:{redirectTo:`${location.origin}/auth/callback`}});if(e)setError(e.message);}}>Continue with Google</button>}{mode==="sign-in"&&<div className="auth-divider"><span>or use your email</span></div>}<form className="auth-form" onSubmit={submit}>{(mode==="sign-in"||mode==="forgot")&&<><label htmlFor="email">Email address</label><input id="email" type="email" required value={email} onChange={e=>setEmail(e.target.value)}/></>}{(mode==="sign-in"||mode==="set-password")&&<><label htmlFor="password">{mode==="sign-in"?"Password":"New password"}</label><input id="password" type="password" required minLength={mode === "set-password" ? 12 : 1} value={password} onChange={e=>setPassword(e.target.value)}/>{mode === "set-password" && <span className="form-hint">Use at least 12 characters.</span>}</>}{mode==="verify"&&<>{qr&&<img className="mfa-qr" src={qr} alt="Authenticator QR code"/>}<label htmlFor="code">Authenticator code</label><input id="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,""))}/></>}{error&&<p className="form-error" role="alert">{error}</p>}<button className="button button-primary button-full" disabled={busy}>{busy?"Please wait…":mode==="sign-in"?"Sign in":mode==="forgot"?"Send recovery email":mode==="set-password"?"Update password":"Verify and continue"}</button></form>{mode==="sign-in"&&<p><Link to="/forgot-password">Forgot password?</Link></p>}{mode!=="sign-in"&&mode!=="verify"&&<p><Link to="/sign-in">Return to sign in</Link></p>}</div></div></div>;
}

export function Setup(){const navigate=useNavigate();useEffect(()=>{if(getSupabaseConfig())navigate("/sign-in",{replace:true});},[navigate]);return <div className="auth-shell"><div className="auth-card"><h1>Supabase setup needed</h1><p>Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> in <code>.env.local</code>, then restart the development server.</p></div></div>}
export function AccessPending(){return <div className="auth-shell"><div className="auth-card"><h1>Workspace access pending</h1><p>Your account is not an active member of this workspace. Ask a co-founder to invite you.</p><button className="button button-secondary" onClick={()=>void db().auth.signOut()}>Sign out</button></div></div>}

export function AuthCallback(){const navigate=useNavigate();const {reload}=useAuth();useEffect(()=>{let active=true;(async()=>{const url=new URL(location.href);const code=url.searchParams.get("code");const tokenHash=url.searchParams.get("token_hash");const type=url.searchParams.get("type");let error:unknown=null;if(code){error=(await db().auth.exchangeCodeForSession(code)).error;}else if(tokenHash&&(type==="recovery"||type==="invite"||type==="email")){error=(await db().auth.verifyOtp({token_hash:tokenHash,type})).error;}else if(location.hash.includes("access_token=")){const hash=new URLSearchParams(location.hash.slice(1));const access_token=hash.get("access_token");const refresh_token=hash.get("refresh_token");if(access_token&&refresh_token)error=(await db().auth.setSession({access_token,refresh_token})).error;else error=new Error("Incomplete auth session");}if(error){navigate(type==="recovery"?"/forgot-password?error=link":"/sign-in?error=link",{replace:true});return;}await reload();if(active)navigate(type==="recovery"||type==="invite"||url.searchParams.get("next")==="/set-password"?"/set-password":"/verify",{replace:true});})();return()=>{active=false;};},[navigate,reload]);return <div className="page-loading" role="status">Completing secure sign-in…</div>}
