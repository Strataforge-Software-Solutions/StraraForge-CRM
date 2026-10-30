import Link from "next/link";

export function Brand({ linked = true }: { linked?: boolean }) {
  const mark = (
    <span className="brand-lockup">
      <span className="brand-mark" aria-hidden="true">SF</span>
      <span className="brand-type">
        <span>STRATA<span className="brand-accent">FORGE</span></span>
        <small>CRM</small>
      </span>
    </span>
  );

  return linked ? <Link className="brand-link" href="/dashboard" aria-label="StrataForge CRM dashboard">{mark}</Link> : mark;
}
