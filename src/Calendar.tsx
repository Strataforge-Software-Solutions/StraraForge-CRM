import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { createClient } from "@/lib/supabase/client";

type Kind = "follow-up" | "deadline" | "milestone";
type View = "month" | "week" | "day" | "list";
type CalendarItem = { id: string; kind: Kind; title: string; date: string; time: string | null; href: string };
const zone = "Asia/Manila";
const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const categories: { value: string; label: string }[] = [
  { value: "all", label: "All dates" },
  { value: "deadline", label: "Deadlines" },
  { value: "milestone", label: "Project milestones" },
  { value: "follow-up", label: "Follow-ups" },
];
const dateFromKey = (key: string) => new Date(`${key}T12:00:00Z`);
const dateKey = (date: Date) => date.toISOString().slice(0, 10);
const moveDay = (key: string, offset: number) => { const date = dateFromKey(key); date.setUTCDate(date.getUTCDate() + offset); return dateKey(date); };
const localParts = (value: string) => Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(value)).map((part) => [part.type, part.value]));
const localKey = (value: string) => { const parts = localParts(value); return `${parts.year}-${parts.month}-${parts.day}`; };
const localTime = (value: string) => new Intl.DateTimeFormat("en-US", { timeZone: zone, hour: "numeric", minute: "2-digit" }).format(new Date(value));
const todayKey = () => localKey(new Date().toISOString());
const validKey = (value: string | null) => {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return todayKey();
  try { return dateKey(dateFromKey(value)) === value ? value : todayKey(); } catch { return todayKey(); }
};
const longDate = (key: string) => new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric", year: "numeric" }).format(dateFromKey(key));
const monthName = (key: string) => new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "long", year: "numeric" }).format(dateFromKey(key));
const shortDate = (key: string) => new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" }).format(dateFromKey(key));
const startOfWeek = (key: string) => moveDay(key, -dateFromKey(key).getUTCDay());
const monthDays = (key: string) => { const first = `${key.slice(0, 7)}-01`; const start = startOfWeek(first); const last = new Date(Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)), 0)); const count = Math.ceil((Math.round((last.getTime() - dateFromKey(start).getTime()) / 86400000) + 1) / 7) * 7; return Array.from({ length: count }, (_, index) => moveDay(start, index)); };

function EventList({ items, compact = false }: { items: CalendarItem[]; compact?: boolean }) {
  if (!items.length) return <div className="calendar-empty"><p>No scheduled dates</p><span>Follow-ups, task deadlines, and project targets appear here when they have dates.</span></div>;
  return <ul className={`calendar-event-list${compact ? " is-compact" : ""}`}>{items.map((item) => <li className={`calendar-list-event calendar-list-${item.kind}`} key={`${item.kind}-${item.id}`}><span className="calendar-event-dot" aria-hidden="true"/><div><Link to={item.href}>{item.title}</Link><small>{item.time ?? "All day"} · {item.kind === "follow-up" ? "Follow up" : item.kind === "deadline" ? "Task deadline" : "Project target"}</small>{!compact && <span>{shortDate(item.date)}</span>}</div></li>)}</ul>;
}

function CategoryIcon({ kind }: { kind: string }) {
  const paths: Record<string, ReactNode> = {
    deadline: <><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4m8-4v4M4 10h16"/></>,
    milestone: <><path d="M5 21V4"/><path d="M5 5h13l-2 4 2 4H5"/></>,
    "follow-up": <><circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3 2"/></>,
  };
  if (kind === "all") return null;
  return <svg className="calendar-category-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[kind]}</svg>;
}

export default function Calendar({ workspaceId }: { workspaceId: string }) {
  const [params, setParams] = useSearchParams();
  const selected = validKey(params.get("date"));
  const view = (["month", "week", "day", "list"].includes(params.get("view") ?? "") ? params.get("view") : "month") as View;
  const category = categories.some((item) => item.value === params.get("type")) ? params.get("type")! : "all";
  const [items, setItems] = useState<CalendarItem[] | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const update = (changes: Record<string, string>) => { const next = new URLSearchParams(params); Object.entries(changes).forEach(([key, value]) => next.set(key, value)); setParams(next); };
  const load = useCallback(async () => {
    setError("");
    const db = createClient();
    const [leads, tasks, projects] = await Promise.all([
      db.from("leads").select("id,company_name,next_follow_up_at").eq("workspace_id", workspaceId).is("archived_at", null).not("next_follow_up_at", "is", null),
      db.from("tasks").select("id,title,due_at,status,project_id").eq("workspace_id", workspaceId).is("archived_at", null).not("due_at", "is", null),
      db.from("projects").select("id,name,target_date,status").eq("workspace_id", workspaceId).is("archived_at", null).not("target_date", "is", null),
    ]);
    const failure = leads.error ?? tasks.error ?? projects.error;
    if (failure) { setItems([]); setError(`Calendar dates couldn’t load. ${failure.message}`); return; }
    const next: CalendarItem[] = [
      ...(leads.data ?? []).map((row) => ({ id: row.id, kind: "follow-up" as const, title: `${row.company_name} follow-up`, date: localKey(row.next_follow_up_at!), time: localTime(row.next_follow_up_at!), href: `/leads/${row.id}` })),
      ...(tasks.data ?? []).filter((row) => row.status !== "cancelled").map((row) => ({ id: row.id, kind: "deadline" as const, title: row.title, date: localKey(row.due_at!), time: null, href: row.project_id ? `/team/tasks?project=${encodeURIComponent(row.project_id)}` : "/tasks-deals?view=tasks" })),
      ...(projects.data ?? []).filter((row) => row.status !== "cancelled").map((row) => ({ id: row.id, kind: "milestone" as const, title: row.name, date: row.target_date!, time: null, href: `/projects/${row.id}` })),
    ];
    next.sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? "").localeCompare(b.time ?? "") || a.title.localeCompare(b.title));
    setItems(next);
  }, [workspaceId]);
  useEffect(() => { void load(); }, [load, retry]);
  const shown = useMemo(() => (items ?? []).filter((item) => category === "all" || item.kind === category), [items, category]);
  const byDate = (date: string) => shown.filter((item) => item.date === date);
  const days = monthDays(selected);
  const weekStart = startOfWeek(selected);
  const weekDays = Array.from({ length: 7 }, (_, index) => moveDay(weekStart, index));
  const periodDays = view === "week" ? weekDays : view === "day" ? [selected] : days;
  const periodEvents = shown.filter((item) => item.date.slice(0, 7) === selected.slice(0, 7));
  const upcoming = shown.filter((item) => item.date >= todayKey()).slice(0, 3);
  const navigatePeriod = (direction: number) => {
    if (view === "month" || view === "list") { const year = Number(selected.slice(0, 4)); const month = Number(selected.slice(5, 7)) - 1; const day = Number(selected.slice(8)); const target = new Date(Date.UTC(year, month + direction, 1, 12)); const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate(); target.setUTCDate(Math.min(day, lastDay)); update({ date: dateKey(target) }); }
    else update({ date: moveDay(selected, direction * (view === "week" ? 7 : 1)) });
  };
  const rangeLabel = view === "week" ? `${shortDate(weekDays[0])} – ${shortDate(weekDays[6])}` : view === "day" ? longDate(selected) : monthName(selected);
  return <div className="calendar-page">
    <div className="calendar-page-heading"><div><p className="eyebrow">Workspace schedule</p><h1>Calendar</h1><p>Manage follow-ups, deadlines, and project schedules.</p></div><Link className="button button-primary calendar-heading-action" to={`/tasks-deals?view=tasks&new=task&date=${selected}`}><span aria-hidden="true">＋</span> Add Task</Link></div>
    <div className="calendar-toolbar"><div className="calendar-categories" aria-label="Calendar category">{categories.map((item) => <button type="button" key={item.value} className={`calendar-category${category === item.value ? " is-active" : ""}`} aria-pressed={category === item.value} onClick={() => update({ type: item.value })}><CategoryIcon kind={item.value}/>{item.label}</button>)}</div><div className="calendar-controls"><button type="button" className="calendar-today" onClick={() => update({ date: todayKey() })}>Today</button><div className="calendar-nav"><button type="button" aria-label="Previous period" onClick={() => navigatePeriod(-1)}>‹</button><button type="button" aria-label="Next period" onClick={() => navigatePeriod(1)}>›</button></div><strong className="calendar-period">{rangeLabel}</strong><div className="calendar-views" aria-label="Calendar view">{(["month", "week", "day", "list"] as const).map((name) => <button type="button" key={name} className={view === name ? "is-active" : ""} aria-pressed={view === name} onClick={() => update({ view: name })}>{name[0].toUpperCase() + name.slice(1)}</button>)}</div></div></div>
    {error && <div className="calendar-load-error" role="alert"><span>{error}</span><button type="button" onClick={() => { setItems(null); setRetry((value) => value + 1); }}>Retry</button></div>}
    <div className="calendar-layout"><section className="calendar-main-panel" aria-label={`${rangeLabel} calendar`}>{items === null ? <div className="calendar-loading" role="status">Loading calendar dates…</div> : view === "month" ? <><div className="calendar-weekday-row">{weekdays.map((day) => <span key={day}>{day}</span>)}</div><div className="calendar-month-grid">{days.map((day) => { const dateItems = byDate(day); return <div key={day} className={`calendar-day-cell${day.slice(0, 7) !== selected.slice(0, 7) ? " is-outside" : ""}${day === selected ? " is-selected" : ""}${day === todayKey() ? " is-today" : ""}${dateItems.length ? " has-events" : ""}`}><button type="button" className="calendar-day-number" aria-label={`Select ${longDate(day)}, ${dateItems.length} scheduled`} aria-pressed={day === selected} aria-current={day === todayKey() ? "date" : undefined} onClick={() => update({ date: day })}>{Number(day.slice(8))}</button>{dateItems.slice(0, 2).map((item) => <Link title={`${item.title} · ${item.time ?? "All day"}`} key={`${item.kind}-${item.id}`} className={`calendar-event-chip calendar-event-${item.kind}`} to={item.href}><span>{item.title}</span><small>{item.time ?? "All day"}</small></Link>)}{dateItems.length > 2 && <button type="button" className="calendar-more" onClick={() => update({ date: day, view: "day" })}>+{dateItems.length - 2} more</button>}</div>; })}</div><div className="calendar-mobile-agenda"><h3>{longDate(selected)}</h3><EventList items={byDate(selected)}/></div></> : view === "week" ? <div className="calendar-week-grid">{weekDays.map((day) => <section className="calendar-agenda-day" key={day}><button type="button" onClick={() => update({ date: day, view: "day" })}>{longDate(day)}</button><EventList items={byDate(day)} compact/></section>)}</div> : view === "day" ? <div className="calendar-day-view"><h2>{longDate(selected)}</h2><EventList items={byDate(selected)}/></div> : <div className="calendar-list-view"><h2>{monthName(selected)}</h2><EventList items={periodEvents}/></div>}</section>
      <aside className="calendar-side-panel" aria-label="Calendar details"><section className="calendar-selected-day"><header><div><h2>{longDate(selected)}</h2><p>{byDate(selected).length} {byDate(selected).length === 1 ? "date" : "dates"} scheduled</p></div><div className="calendar-side-nav"><button type="button" aria-label="Previous day" onClick={() => update({ date: moveDay(selected, -1) })}>‹</button><button type="button" aria-label="Next day" onClick={() => update({ date: moveDay(selected, 1) })}>›</button></div></header><EventList items={byDate(selected)} compact/><Link className="button button-secondary calendar-add-task" to={`/tasks-deals?view=tasks&new=task&date=${selected}`}>＋ Add task for this day</Link></section><section className="calendar-mini-month"><header><h2>{monthName(selected)}</h2><button type="button" aria-label="Next month" onClick={() => navigatePeriod(1)}>›</button></header><div className="calendar-mini-grid">{weekdays.map((day) => <span key={day} className="calendar-mini-weekday">{day[0]}</span>)}{days.map((day) => <button type="button" key={day} aria-label={`Select ${longDate(day)}`} aria-pressed={day === selected} className={`${day.slice(0, 7) !== selected.slice(0, 7) ? "is-outside " : ""}${day === selected ? "is-selected " : ""}${byDate(day).length ? "has-events" : ""}`} onClick={() => update({ date: day })}>{Number(day.slice(8))}</button>)}</div></section><section className="calendar-upcoming"><header><h2>Upcoming dates</h2><button type="button" onClick={() => update({ view: "list", date: todayKey() })}>View All ›</button></header><EventList items={upcoming}/></section></aside></div>
  </div>;
}
