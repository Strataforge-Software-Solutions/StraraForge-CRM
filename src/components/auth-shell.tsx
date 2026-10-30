import { Brand } from "@/components/brand";

export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="auth-layout" id="main-content">
      <aside className="auth-story" aria-label="About StrataForge CRM">
        <Brand linked={false} />
        <div className="auth-story-copy">
          <p className="eyebrow eyebrow-light">Built for a clearer workflow</p>
          <h2>Every client conversation has a next step.</h2>
          <p>Keep website inquiries, proposals, delivery work, and payment milestones connected in one private workspace.</p>
          <div className="story-rule" aria-hidden="true" />
          <p className="story-caption">StrataForge CRM · Founder workspace</p>
        </div>
        <div className="story-graphic" aria-hidden="true">
          <span className="graphic-node node-one" />
          <span className="graphic-node node-two" />
          <span className="graphic-node node-three" />
          <span className="graphic-line line-one" />
          <span className="graphic-line line-two" />
        </div>
      </aside>
      <section className="auth-form-area">
        <div className="auth-mobile-brand"><Brand linked={false} /></div>
        {children}
      </section>
    </main>
  );
}
