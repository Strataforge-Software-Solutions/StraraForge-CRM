import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "StrataForge CRM",
  description: "A private workspace for StrataForge client relationships and website projects.",
  robots: { index: false, follow: false }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main-content">Skip to content</a>
        {children}
      </body>
    </html>
  );
}
