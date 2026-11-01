import type { ReactNode } from "react";

export function CrmIcon({ name }: { name: string }) {
  const paths: Record<string, ReactNode> = {
    dashboard: <><rect x="3.5" y="3.5" width="7" height="7" rx="1.4"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.4"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.4"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.4"/></>,
    tasks: <><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4.5h6M8.5 10h7M8.5 14h7M8.5 18h4"/><path d="m3 7 1.5 1.5L7 6"/></>,
    users: <><path d="M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20"/><circle cx="10" cy="7.5" r="3.5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 6.8M17 15h.5a3.5 3.5 0 0 1 3.5 3.5V20"/></>,
    pipeline: <><rect x="3.5" y="4" width="5" height="16" rx="1.3"/><rect x="10" y="4" width="5" height="11" rx="1.3"/><rect x="16.5" y="4" width="4" height="7" rx="1.3"/></>,
    clients: <><circle cx="9" cy="8" r="3.2"/><path d="M3.5 20v-1.4A4.6 4.6 0 0 1 8.1 14h1.8a4.6 4.6 0 0 1 4.6 4.6V20z"/><path d="M16 5.2a3.2 3.2 0 0 1 0 6.1M17 14.5a4.4 4.4 0 0 1 3.5 4.3V20"/></>,
    projects: <><path d="M3.5 7.5h6l2 2h9v9a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/><path d="M3.5 8V5.5a2 2 0 0 1 2-2h4l2 2h5"/></>,
    calendar: <><rect x="3.5" y="5" width="17" height="16" rx="2"/><path d="M7.5 3v4M16.5 3v4M3.5 9.5h17M7.5 13h2M12 13h2M7.5 17h2M12 17h2"/></>,
    reports: <><path d="M4 20V11h4v9M10 20V5h4v15M16 20V8h4v12M2.5 20.5h19"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="m19.4 15 .1.1 1 1.8-1.8 3.1-2.1-.5a7.8 7.8 0 0 1-1.6.9l-.9 2h-3.6l-.9-2a7.8 7.8 0 0 1-1.6-.9l-2.1.5-1.8-3.1 1-1.8a7.2 7.2 0 0 1 0-1.9l-1-1.8 1.8-3.1 2.1.5a7.8 7.8 0 0 1 1.6-.9l.9-2h3.6l.9 2a7.8 7.8 0 0 1 1.6.9l2.1-.5 1.8 3.1-1 1.8a7.2 7.2 0 0 1-.1 1.8z" transform="translate(0 -1) scale(.9) translate(1.3 1.7)"/></>,
    security: <><path d="M12 3 19 6v5c0 4.7-2.9 8-7 10-4.1-2-7-5.3-7-10V6z"/><path d="m9 12 2 2 4-4"/></>,
    phone: <><path d="M7 3.5h3l1.5 4-2 1.5a15 15 0 0 0 5.5 5.5l1.5-2 4 1.5v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 5 6a2 2 0 0 1 2-2.5z"/></>,
    inbox: <><path d="M4 4h16l1 11h-5l-2 3h-4l-2-3H3z"/><path d="M3.5 15h4l2 3h5l2-3h4M12 7v5m-2-2 2 2 2-2"/></>,
    layers: <><path d="m12 3 9 5-9 5-9-5zM3 12l9 5 9-5M3 16l9 5 9-5"/></>,
    check: <><circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16.5 9"/></>,
    trend: <><path d="M4 17 10 11l4 4 6-8"/><path d="M14 7h6v6"/></>,
    money: <><circle cx="12" cy="12" r="9"/><path d="M15 8.5c-.7-.7-1.7-1-3-1-1.7 0-2.8.8-2.8 2s1.1 1.8 2.8 2.2 2.8 1 2.8 2.3-1.1 2.3-2.8 2.3c-1.3 0-2.3-.4-3-1.1M12 6v12"/></>,
    activity: <><path d="M4 12h3l2-5 4 10 2-5h5"/><circle cx="12" cy="12" r="9"/></>,
    bell: <><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></>,
    search: <><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 4.5 4.5"/></>,
    camera: <><path d="M3.5 7.5h4l1.6-2h5.8l1.6 2h4v11.5h-17z"/><circle cx="12" cy="13" r="3.2"/></>,
    plus: <path d="M12 5v14M5 12h14"/>,
    more: <><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></>,
    back: <path d="m10 5-7 7 7 7M3 12h18"/>
  };
  return <svg className="crm-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{paths[name] ?? paths.dashboard}</svg>;
}
