import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { db, CrmIcon, LoadingInline, useAuth } from "./shared";

export type RecordImageType = "lead" | "client" | "project" | "task";

const bucket = "crm-record-images";
const maxBytes = 5 * 1024 * 1024;
const maxSelection = 10;
const extensions: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp"
};

type SavedImage = { name: string; displayName: string; path: string; url: string };

function imageError(message?: string) {
  if (/bucket not found|does not exist/i.test(message ?? "")) return "Image storage is not set up yet. Ask a workspace administrator to enable it.";
  if (/row.level security|permission|unauthori[sz]ed|403/i.test(message ?? "")) return "You need a verified workspace session to manage images.";
  return message || "Images could not be loaded. Please try again.";
}

export async function uploadRecordImages(workspaceId: string, recordType: RecordImageType, recordId: string, files: File[]) {
  const failed: File[] = [];
  let uploaded = 0;
  let errorMessage = "";
  for (const file of files) {
    const extension = extensions[file.type];
    if (!extension || file.size > maxBytes || file.size === 0) {
      failed.push(file);
      errorMessage = "Choose non-empty JPG, PNG, or WebP images up to 5 MB each.";
      continue;
    }
    const path = `${workspaceId}/${recordType}/${recordId}/${crypto.randomUUID()}.${extension}`;
    try {
      const { error } = await db().storage.from(bucket).upload(path, file, { contentType: file.type, upsert: false, metadata: { originalName: file.name.slice(0, 180) } });
      if (error) {
        failed.push(file);
        errorMessage = imageError(error.message);
      } else uploaded += 1;
    } catch {
      failed.push(file);
      errorMessage = "Image upload failed. Please try again.";
    }
  }
  return { uploaded, failed, error: errorMessage };
}

export function ImagePicker({ files, onChange, disabled = false }: { files: File[]; onChange: (files: File[]) => void; disabled?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [previews, setPreviews] = useState<string[]>([]);

  useEffect(() => {
    const urls = files.map((file) => URL.createObjectURL(file));
    setPreviews(urls);
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, [files]);

  function select(event: ChangeEvent<HTMLInputElement>) {
    const incoming = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!incoming.length) return;
    const valid = incoming.filter((file) => extensions[file.type] && file.size > 0 && file.size <= maxBytes);
    const slots = Math.max(0, maxSelection - files.length);
    const next = valid.slice(0, slots);
    if (valid.length !== incoming.length) setError("Choose non-empty JPG, PNG, or WebP images up to 5 MB each.");
    else if (valid.length > slots) setError(`Choose up to ${maxSelection} images at a time.`);
    else setError("");
    if (next.length) onChange([...files, ...next]);
  }

  return <section className="crm-image-picker" aria-label="Images">
    <div className="crm-image-picker-heading"><span className="crm-image-picker-icon"><CrmIcon name="camera"/></span><div><strong>Images</strong><small>JPG, PNG, or WebP · up to 5 MB each</small></div><button type="button" className="button button-secondary" disabled={disabled || files.length >= maxSelection} onClick={() => inputRef.current?.click()}><CrmIcon name="plus"/> Choose images</button></div>
    <input ref={inputRef} className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={disabled} onChange={select} aria-label="Choose images"/>
    {error && <p className="crm-image-error" role="alert">{error}</p>}
    {files.length > 0 && <div className="crm-image-grid">{files.map((file, index) => <div className="crm-image-tile" key={`${file.name}-${file.lastModified}-${index}`}><img src={previews[index]} alt={`Selected image: ${file.name}`}/><div><span title={file.name}>{file.name}</span><button type="button" disabled={disabled} aria-label={`Remove selected image ${file.name}`} onClick={() => onChange(files.filter((_, itemIndex) => itemIndex !== index))}>Remove</button></div></div>)}</div>}
  </section>;
}

export function RecordAvatar({ recordType, recordId, name, className, refreshKey = 0, fallbackClientId = "", fallbackLeadIds = [] }: { recordType: RecordImageType; recordId: string; name: string; className: string; refreshKey?: number; fallbackClientId?: string; fallbackLeadIds?: string[] }) {
  const { founder } = useAuth();
  const workspaceId = founder?.workspaceId ?? "";
  const fallbackKey = fallbackLeadIds.join(",");
  const [url, setUrl] = useState("");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!workspaceId || !recordId) return;
    let active = true;
    let objectUrl = "";
    setUrl("");
    setFailed(false);
    void (async () => {
      async function latestImage(type: RecordImageType, id: string) {
        const prefix = `${workspaceId}/${type}/${id}`;
        const { data, error: listError } = await db().storage.from(bucket).list(prefix, { limit: 10, sortBy: { column: "created_at", order: "desc" } });
        if (listError) return null;
        const latest = data?.find((item) => /^[0-9a-f-]{36}\.(jpg|png|webp)$/i.test(item.name));
        if (!latest) return null;
        const { data: blob, error: downloadError } = await db().storage.from(bucket).download(`${prefix}/${latest.name}`);
        if (downloadError) return null;
        return blob;
      }
      let blob = recordType === "project" && fallbackClientId ? await latestImage("client", fallbackClientId) : null;
      if (!blob) blob = await latestImage(recordType, recordId);
      if (!blob && fallbackClientId && recordType === "lead") blob = await latestImage("client", fallbackClientId);
      if (!blob && (recordType === "client" || recordType === "project")) {
        for (const leadId of fallbackKey.split(",").filter(Boolean)) {
          if (!active) return;
          blob = await latestImage("lead", leadId);
          if (blob) break;
        }
      }
      if (!active) return;
      if (!blob) return;
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    })().catch(() => { if (active) setFailed(true); });
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [workspaceId, recordType, recordId, refreshKey, fallbackClientId, fallbackKey]);

  return <span className={className} title={failed ? "Image unavailable; showing initials" : undefined}>{url ? <img src={url} alt="" onError={() => { setFailed(true); setUrl(""); }}/> : name.slice(0, 2).toUpperCase()}</span>;
}

export function RecordImages({ recordType, recordId, title = "Images", pendingFiles, onPendingFilesChange, saveWithForm = false, disabled = false, onImagesChanged }: { recordType: RecordImageType; recordId: string; title?: string; pendingFiles?: File[]; onPendingFilesChange?: (files: File[]) => void; saveWithForm?: boolean; disabled?: boolean; onImagesChanged?: () => void }) {
  const { founder } = useAuth();
  const workspaceId = founder?.workspaceId ?? "";
  const [images, setImages] = useState<SavedImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [localPending, setLocalPending] = useState<File[]>([]);
  const pending = pendingFiles ?? localPending;
  const setPending = onPendingFilesChange ?? setLocalPending;
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState("");
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!workspaceId || !recordId) return;
    let active = true;
    const objectUrls: string[] = [];
    const prefix = `${workspaceId}/${recordType}/${recordId}`;
    setLoading(true);
    setError("");
    void (async () => {
      const { data, error: listError } = await db().storage.from(bucket).list(prefix, { limit: 100, sortBy: { column: "created_at", order: "desc" } });
      if (!active) return;
      if (listError) { setError(imageError(listError.message)); setLoading(false); return; }
      const files = (data ?? []).filter((item) => /^[0-9a-f-]{36}\.(jpg|png|webp)$/i.test(item.name));
      const downloaded = await Promise.all(files.map(async (item) => {
        const path = `${prefix}/${item.name}`;
        const { data: blob, error: downloadError } = await db().storage.from(bucket).download(path);
        const originalName = item.metadata?.originalName;
        if (downloadError || !blob || !active) return null;
        const url = URL.createObjectURL(blob);
        objectUrls.push(url);
        return { name: item.name, displayName: typeof originalName === "string" ? originalName : "Image", path, url };
      }));
      if (!active) return;
      setImages(downloaded.filter((item): item is SavedImage => item !== null));
      if (downloaded.some((item) => item === null)) setError("Some images could not be displayed. Retry to refresh them.");
      setLoading(false);
    })().catch(() => { if (active) { setError("Images could not be loaded. Please try again."); setLoading(false); } });
    return () => { active = false; objectUrls.forEach((url) => URL.revokeObjectURL(url)); };
  }, [workspaceId, recordType, recordId, version]);

  async function upload() {
    if (!workspaceId || !pending.length || busy) return;
    setBusy(true);
    setError("");
    const result = await uploadRecordImages(workspaceId, recordType, recordId, pending);
    setPending(result.failed);
    setBusy(false);
    if (result.error) setError(`${result.uploaded ? `${result.uploaded} uploaded. ` : ""}${result.error}`);
    if (result.uploaded) { setVersion((value) => value + 1); onImagesChanged?.(); }
  }

  async function remove(image: SavedImage) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const { error: removeError } = await db().storage.from(bucket).remove([image.path]);
      if (removeError) setError(imageError(removeError.message));
      else { setVersion((value) => value + 1); onImagesChanged?.(); }
    } catch { setError("Image removal failed. Please try again."); }
    finally { setBusy(false); setConfirming(""); }
  }

  return <section className="crm-record-images" aria-label={title}>
    <div className="crm-record-images-heading"><div><CrmIcon name="camera"/><h2>{title}</h2></div><span>{images.length} saved</span></div>
    <p className="crm-image-muted">{saveWithForm ? "Selected images upload when you save changes. Removals are saved immediately." : "Uploads and removals are saved immediately."}</p>
    {recordType === "lead" && <p className="crm-image-muted">The newest saved image appears as the lead avatar.</p>}
    {recordType === "client" && <p className="crm-image-muted">The newest client image appears as the avatar. A linked lead image is used when this client has none.</p>}
    {recordType === "project" && <p className="crm-image-muted">The newest project image appears beside the title. Client or lead images are used when this project has none.</p>}
    <ImagePicker files={pending} onChange={setPending} disabled={busy || disabled}/>
    {!saveWithForm && pending.length > 0 && <button type="button" className="button button-primary crm-image-upload" disabled={busy || disabled} onClick={() => void upload()}>{busy ? "Uploading…" : `Upload ${pending.length} ${pending.length === 1 ? "image" : "images"}`}</button>}
    {error && <div className="crm-image-error" role="alert">{error} <button type="button" onClick={() => setVersion((value) => value + 1)}>Refresh images</button></div>}
    {loading ? <p className="crm-image-muted"><LoadingInline label="Loading images…"/></p> : images.length ? <div className="crm-image-grid">{images.map((image) => <div className="crm-image-tile" key={image.path}><a href={image.url} target="_blank" rel="noreferrer" aria-label={`Open ${image.displayName} in new tab`}><img src={image.url} alt={image.displayName} loading="lazy"/></a><div><span title={image.displayName}>{image.displayName}</span>{confirming === image.path ? <span className="crm-image-confirm"><button type="button" disabled={busy || disabled} onClick={() => void remove(image)}>Remove?</button><button type="button" disabled={busy || disabled} onClick={() => setConfirming("")}>Cancel</button></span> : <button type="button" disabled={busy || disabled} aria-label={`Remove ${image.displayName}`} onClick={() => setConfirming(image.path)}>Remove</button>}</div></div>)}</div> : <p className="crm-image-muted">No images added yet.</p>}
  </section>;
}
