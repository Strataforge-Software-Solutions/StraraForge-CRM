import Link from "next/link";

export default function NotFoundPage() {
  return (
    <main className="error-page" id="main-content">
      <div className="error-box">
        <p className="eyebrow">Page unavailable</p>
        <h1>We couldn’t find that page.</h1>
        <p>The address may have changed or the page may no longer exist.</p>
        <Link className="button button-primary" href="/dashboard">Go to workspace</Link>
      </div>
    </main>
  );
}
