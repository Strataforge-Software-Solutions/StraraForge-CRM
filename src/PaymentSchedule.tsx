import { useMemo, useState, type FormEvent } from "react";

type DraftMilestone = { id: number; title: string; calculation_type: "fixed" | "percentage"; calculation_value: string; due_date: string };
type SavedMilestone = { id: string; title: string; calculation_type: string; calculation_value: number; scheduled_amount: number; currency: string; due_date: string };

const initialMilestone = (id = 1): DraftMilestone => ({ id, title: `Milestone ${id}`, calculation_type: "fixed", calculation_value: "", due_date: "" });
const amountFor = (item: DraftMilestone, total: number) => item.calculation_type === "percentage" ? Math.round(total * Number(item.calculation_value)) / 100 : Number(item.calculation_value);

export function PaymentSchedule({ projectId, agreedAmount, paidAmount, currency, activeSchedule, milestones, payments, onSaved, save, canEdit = true }: {
  projectId: string; agreedAmount: number; paidAmount: number; currency: string;
  activeSchedule: { id: string; version: number; balance_at_creation: number; currency: string; created_at: string } | null;
  milestones: SavedMilestone[]; payments: Array<{ milestone_id: string | null; amount: number }>;
  onSaved: () => Promise<void>; save: (projectId: string, rows: Array<{ title: string; calculation_type: string; calculation_value: number; due_date: string }>) => Promise<{ error?: string }>; canEdit?: boolean;
}) {
  const [rows, setRows] = useState<DraftMilestone[]>([initialMilestone()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(!activeSchedule);
  const remaining = Math.max(0, Math.round((agreedAmount - paidAmount) * 100) / 100);
  const total = useMemo(() => rows.reduce((sum, row) => sum + amountFor(row, agreedAmount), 0), [rows, agreedAmount]);
  const dateOrderOk = rows.every((row, index) => index === 0 || row.due_date >= rows[index - 1].due_date);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (rows.length < 1 || rows.length > 20 || rows.some((row) => !row.title.trim() || !row.due_date || Number(row.calculation_value) <= 0) || !dateOrderOk) {
      setError("Add 1 to 20 milestones with a name, amount, and dates in order."); return;
    }
    if (Math.round(total * 100) !== Math.round(remaining * 100)) {
      setError(`Milestones must total the remaining balance (${currency} ${remaining.toFixed(2)}).`); return;
    }
    setBusy(true);
    const result = await save(projectId, rows.map(({ title, calculation_type, calculation_value, due_date }) => ({ title: title.trim(), calculation_type, calculation_value: Number(calculation_value), due_date })));
    setBusy(false);
    if (result.error) { setError(result.error); return; }
    await onSaved();
    setRows([initialMilestone()]);
    setEditing(false);
  }

  if ((!editing || !activeSchedule) && activeSchedule) {
    const paidByMilestone = new Map<string, number>();
    payments.forEach((payment) => { if (payment.milestone_id) paidByMilestone.set(payment.milestone_id, (paidByMilestone.get(payment.milestone_id) ?? 0) + Number(payment.amount)); });
    return <section className="record-list-panel payment-schedule-panel"><div className="leads-table-toolbar"><div><h2>Payment schedule · v{activeSchedule.version}</h2><p>Active schedule covers {currency} {Number(activeSchedule.balance_at_creation).toFixed(2)} when saved.</p></div><button className="button button-secondary" onClick={() => setEditing(true)} disabled={remaining <= 0 || !canEdit}>Create new version</button></div><ul className="milestone-list">{milestones.map((item) => { const paid = paidByMilestone.get(item.id) ?? 0; const balance = Math.max(0, Number(item.scheduled_amount) - paid); const state = balance <= 0.005 ? "Paid" : paid > 0 ? "Partially paid" : item.due_date < new Date().toISOString().slice(0, 10) ? "Overdue" : "Upcoming"; return <li key={item.id}><div><strong>{item.title}</strong><span>{item.calculation_type === "percentage" ? `${Number(item.calculation_value).toFixed(2)}% of agreed price` : "Fixed amount"} · due {item.due_date}</span><span>{currency} {paid.toFixed(2)} received{balance > 0.005 ? ` · ${currency} ${balance.toFixed(2)} remaining` : ""}</span></div><div className="milestone-amount"><strong>{currency} {Number(item.scheduled_amount).toFixed(2)}</strong><span className={`milestone-status milestone-${state.toLowerCase().replaceAll(" ", "-")}`}>{state}</span></div></li>; })}</ul></section>;
  }

  return <section className="record-list-panel payment-schedule-panel"><h2>{activeSchedule ? "Create a new schedule version" : "Plan progress payments"}</h2><p>Split the unpaid project balance into dated milestones. The schedule is saved as a versioned transaction.</p><form className="payment-schedule-form" onSubmit={(event) => void submit(event)}>{rows.map((row, index) => <div className="payment-schedule-row" key={row.id}><label className="field"><span>Milestone name</span><input value={row.title} maxLength={120} onChange={(event) => setRows((items) => items.map((item) => item.id === row.id ? { ...item, title: event.target.value } : item))} required/></label><label className="field"><span>Amount method</span><select value={row.calculation_type} onChange={(event) => setRows((items) => items.map((item) => item.id === row.id ? { ...item, calculation_type: event.target.value as DraftMilestone["calculation_type"] } : item))}><option value="fixed">Fixed amount</option><option value="percentage">Percent of agreed price</option></select></label><label className="field"><span>{row.calculation_type === "percentage" ? "Percentage" : `Amount (${currency})`}</span><input type="number" min="0.01" max={row.calculation_type === "percentage" ? 100 : undefined} step="0.01" value={row.calculation_value} onChange={(event) => setRows((items) => items.map((item) => item.id === row.id ? { ...item, calculation_value: event.target.value } : item))} required/><small>Calculated: {currency} {amountFor(row, agreedAmount).toFixed(2)}</small></label><label className="field"><span>Due date</span><input type="date" value={row.due_date} onChange={(event) => setRows((items) => items.map((item) => item.id === row.id ? { ...item, due_date: event.target.value } : item))} required/></label><button type="button" className="button button-quiet" aria-label={`Remove milestone ${index + 1}`} disabled={rows.length <= 1 || busy} onClick={() => setRows((items) => items.filter((item) => item.id !== row.id))}>Remove</button></div>)}<div className="schedule-summary"><span>Remaining balance</span><strong>{currency} {remaining.toFixed(2)}</strong><span>Milestone total</span><strong>{currency} {total.toFixed(2)}</strong></div>{error && <p className="form-notice form-notice-error" role="alert">{error}</p>}{!dateOrderOk && <p className="form-notice form-notice-error" role="alert">Put milestone due dates in chronological order.</p>}<div className="schedule-actions"><button type="button" className="button button-secondary" disabled={rows.length >= 20 || busy} onClick={() => setRows((items) => [...items, initialMilestone(Math.max(...items.map((item) => item.id)) + 1)])}>＋ Add milestone</button>{activeSchedule && <button type="button" className="button button-quiet" onClick={() => setEditing(false)}>Cancel</button>}<button className="button button-primary" disabled={busy || !dateOrderOk}>{busy ? "Saving schedule…" : "Save payment schedule"}</button></div></form></section>;
}

export function MilestoneSelect({ milestones, payments, currency }: { milestones: SavedMilestone[]; payments: Array<{ milestone_id: string | null; amount: number }>; currency: string }) {
  const paidByMilestone = new Map<string, number>();
  payments.forEach((payment) => { if (payment.milestone_id) paidByMilestone.set(payment.milestone_id, (paidByMilestone.get(payment.milestone_id) ?? 0) + Number(payment.amount)); });
  const available = milestones.filter((item) => Number(item.scheduled_amount) - (paidByMilestone.get(item.id) ?? 0) > 0.005);
  if (!available.length) return null;
  return <label className="field"><span>Scheduled milestone</span><select name="milestone_id" defaultValue="" required><option value="" disabled>Choose a milestone</option>{available.map((item) => <option key={item.id} value={item.id}>{item.title} · {currency} {(Number(item.scheduled_amount) - (paidByMilestone.get(item.id) ?? 0)).toFixed(2)} remaining · due {item.due_date}</option>)}</select></label>;
}
