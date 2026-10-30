"use client";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="error-page" id="main-content">
      <div className="error-box">
        <p className="eyebrow">Temporary issue</p>
        <h1>We couldn’t load this page.</h1>
        <p>Your data has not been changed. Try again, or return later if the issue continues.</p>
        <button className="button button-primary" onClick={reset}>Try again</button>
      </div>
    </main>
  );
}
