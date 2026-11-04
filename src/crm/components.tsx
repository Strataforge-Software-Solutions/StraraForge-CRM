import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cx, stageLabels } from "./core";
import { CrmIcon } from "./icons";

export function PageHeader({ eyebrow, title, description, action, avatar }: { eyebrow: string; title: string; description: string; action?: ReactNode; avatar?: ReactNode }) { return <div className="page-heading"><p className="eyebrow">{eyebrow}</p><div className="page-heading-row"><div>{avatar ? <div className="page-heading-identity">{avatar}<div><h1>{title}</h1><p>{description}</p></div></div> : <><h1>{title}</h1><p>{description}</p></>}</div>{action}</div></div>; }
export function Loading({ label = "Loading records…", className = "" }: { label?: string; className?: string }) { return <div className={`empty-state crm-loading ${className}`.trim()} role="status" aria-live="polite" aria-busy="true"><img className="crm-loading-animation" src="/blocks-loader.svg" alt=""/><span className="crm-loading-static" aria-hidden="true">{Array.from({ length: 9 }, (_, index) => <i key={index}/>)}</span><span>{label}</span></div>; }
export function LoadingInline({ label }: { label: string }) { return <span className="crm-loading-inline" role="status" aria-live="polite" aria-busy="true"><img src="/blocks-loader.svg" alt=""/><span className="crm-loading-inline-static" aria-hidden="true">▦</span><span>{label}</span></span>; }
export function ErrorBox({ children = "We couldn’t load this information. Refresh to try again." }: { children?: ReactNode }) { return <p className="form-notice form-notice-error" role="alert">{children}</p>; }
export function Metric({ label, value, hint, tone = "orange", icon = "↗" }: { label: string; value: number | string; hint: string; tone?: string; icon?: string }) { const iconName = ({ "↗": "trend", "♙": "users", "▤": "tasks", "▦": "calendar", "▱": "layers", "✓": "check", "$": "money" } as Record<string, string>)[icon] ?? icon; return <div className={`dashboard-metric metric-${tone}`}><span className="dashboard-metric-icon"><CrmIcon name={iconName}/></span><span><span className="dashboard-metric-label">{label}</span><strong>{value}</strong><small>{hint}</small></span></div>; }


export function Modal({ title, description, onClose, children, className }: { title: string; description: string; onClose: () => void; children: ReactNode; className?: string }) { const ref=useRef<HTMLDialogElement>(null); useEffect(()=>{const dialog=ref.current;if(dialog&&!dialog.open)dialog.showModal();},[]); return createPortal(<dialog ref={ref} className={cx("record-dialog",className)} onCancel={(event)=>{event.preventDefault();onClose();}} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}><header className="add-client-dialog-header"><div><p className="eyebrow">StrataForge workspace</p><h2>{title}</h2><p>{description}</p></div><button type="button" className="add-client-dialog-close" onClick={onClose} aria-label="Close">×</button></header>{children}</dialog>,document.body); }

export function DeleteRecordModal({ recordType, recordName, busy, error, onClose, onConfirm }: { recordType: "lead" | "client" | "project"; recordName: string; busy: boolean; error: string; onClose: () => void; onConfirm: () => void }) {
  return <Modal title={`Delete ${recordType}?`} description={`Remove ${recordName} from your active ${recordType} records.`} onClose={onClose} className="delete-record-dialog">
    <div className="delete-record-content">
      <div className="delete-record-notice"><span aria-hidden="true">!</span><p>This record will be archived. Its related project, payment, proposal, task, and audit history will be kept.</p></div>
      {error&&<ErrorBox>{error}</ErrorBox>}
      <div className="form-actions"><button type="button" className="button button-secondary" disabled={busy} onClick={onClose}>Cancel</button><button type="button" className="button button-danger" disabled={busy} onClick={onConfirm}>{busy?"Deleting…":`Delete ${recordType}`}</button></div>
    </div>
  </Modal>;
}

export function DatePicker({ name, defaultValue = "", label }: { name: string; defaultValue?: string; label: string }) {
  const id = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const calendarRef = useRef<HTMLDivElement>(null);
  const dayRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [value, setValue] = useState(defaultValue);
  const [visibleMonth, setVisibleMonth] = useState(() => {
    if (defaultValue) {
      const [year, month, day] = defaultValue.split("-").map(Number);
      if (year && month && day) return new Date(year, month - 1, 1);
    }
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [focusedDate, setFocusedDate] = useState(defaultValue || toDateValue(new Date()));
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 280 });

  function toDateValue(date: Date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  const updatePosition = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.min(288, window.innerWidth - 16);
    const height = 330;
    const openAbove = window.innerHeight - rect.bottom < height + 8 && rect.top > height + 8;
    setPosition({
      top: openAbove ? Math.max(8, rect.top - height - 5) : Math.min(rect.bottom + 5, window.innerHeight - height - 8),
      left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
      width
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePosition();
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !calendarRef.current?.contains(target)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (open) dayRefs.current[focusedDate]?.focus();
  }, [open, focusedDate, visibleMonth]);

  const monthName = new Intl.DateTimeFormat("en", { month: "long", year: "numeric" }).format(visibleMonth);
  const firstDay = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1).getDay();
  const days = Array.from({ length: 42 }, (_, index) => new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), index - firstDay + 1));
  const todayValue = toDateValue(new Date());
  const formattedValue = value ? new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(`${value}T12:00:00`)) : "";

  function shiftMonth(amount: number) {
    setVisibleMonth((month) => new Date(month.getFullYear(), month.getMonth() + amount, 1));
  }

  function selectDate(dateValue: string) {
    setValue(dateValue);
    setFocusedDate(dateValue);
    setOpen(false);
    triggerRef.current?.focus();
  }

  function focusDate(date: Date) {
    const dateValue = toDateValue(date);
    setFocusedDate(dateValue);
    if (date.getMonth() !== visibleMonth.getMonth() || date.getFullYear() !== visibleMonth.getFullYear()) {
      setVisibleMonth(new Date(date.getFullYear(), date.getMonth(), 1));
    } else {
      dayRefs.current[dateValue]?.focus();
    }
  }

  function onDayKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>, date: Date) {
    let next: Date | null = null;
    if (event.key === "ArrowLeft") next = new Date(date.getFullYear(), date.getMonth(), date.getDate() - 1);
    if (event.key === "ArrowRight") next = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
    if (event.key === "ArrowUp") next = new Date(date.getFullYear(), date.getMonth(), date.getDate() - 7);
    if (event.key === "ArrowDown") next = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 7);
    if (event.key === "PageUp" || event.key === "PageDown") {
      const monthOffset = event.key === "PageUp" ? -1 : 1;
      const targetMonth = date.getMonth() + monthOffset;
      const lastDay = new Date(date.getFullYear(), targetMonth + 1, 0).getDate();
      next = new Date(date.getFullYear(), targetMonth, Math.min(date.getDate(), lastDay));
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    } else if (next) {
      event.preventDefault();
      focusDate(next);
    }
  }

  return <div className="date-picker" ref={rootRef}>
    <input type="hidden" name={name} value={value}/>
    <button ref={triggerRef} type="button" className="date-picker-trigger" aria-label={`${label}${formattedValue ? `, ${formattedValue}` : ""}`} aria-haspopup="dialog" aria-expanded={open} aria-controls={id} onClick={() => { if (open) setOpen(false); else { setFocusedDate(value || todayValue); updatePosition(); setOpen(true); } }} onKeyDown={(event) => { if (event.key === "ArrowDown" && !open) { event.preventDefault(); setFocusedDate(value || todayValue); updatePosition(); setOpen(true); } }}>
      <span className={cx("date-picker-value", !formattedValue && "is-placeholder")}>{formattedValue || "mm/dd/yyyy"}</span><CrmIcon name="calendar"/>
    </button>
    {open && <div ref={calendarRef} id={id} className="date-picker-popover" role="dialog" aria-label={`Choose ${label.toLowerCase()}`} style={{ top: position.top, left: position.left, width: position.width }}>
      <div className="date-picker-header"><strong>{monthName}</strong><div><button type="button" aria-label="Previous month" onClick={() => shiftMonth(-1)}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m12.5 4-6 6 6 6"/></svg></button><button type="button" aria-label="Next month" onClick={() => shiftMonth(1)}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m7.5 4 6 6-6 6"/></svg></button></div></div>
      <div className="date-picker-grid" role="grid" aria-label={monthName}>
        <div className="date-picker-week" role="row">{["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((day) => <span role="columnheader" key={day}>{day}</span>)}</div>
        {Array.from({ length: 6 }, (_, week) => <div className="date-picker-week" role="row" key={week}>{days.slice(week * 7, week * 7 + 7).map((date) => {
          const dateValue = toDateValue(date);
          const inMonth = date.getMonth() === visibleMonth.getMonth();
          return <span role="gridcell" key={dateValue}><button ref={(element) => { dayRefs.current[dateValue] = element; }} type="button" tabIndex={dateValue === focusedDate ? 0 : -1} aria-label={new Intl.DateTimeFormat("en", { weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(date)} aria-selected={dateValue === value} className={cx("date-picker-day", !inMonth && "is-outside-month", dateValue === todayValue && "is-today", dateValue === value && "is-selected")} onClick={() => selectDate(dateValue)} onKeyDown={(event) => onDayKeyDown(event, date)}>{date.getDate()}</button></span>;
        })}</div>)}
      </div>
      <div className="date-picker-footer"><button type="button" onClick={() => selectDate("")}>Clear</button><button type="button" onClick={() => selectDate(todayValue)}>Today</button></div>
    </div>}
  </div>;
}


export function StageDropdown({ value, options, disabled, label, optionLabels, optionIcon, onChange, className, minMenuWidth = 180 }: { value: string; options: string[]; disabled: boolean; label: string; optionLabels?: Record<string, string>; optionIcon?: (option: string) => ReactNode; onChange: (stage: string) => void; className?: string; minMenuWidth?: number }) {
  const id = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(Math.max(0, options.indexOf(value)));
  const [position, setPosition] = useState({ top: 0, left: 0, width: 180, maxHeight: 240 });
  const selectedIndex = Math.max(0, options.indexOf(value));
  const optionLabel = (option: string) => optionLabels?.[option] ?? stageLabels[option] ?? option;

  const updatePosition = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const viewportWidth = window.innerWidth;
    const width = Math.min(Math.max(rect.width, minMenuWidth), viewportWidth - 16);
    const maxHeight = Math.min(240, window.innerHeight - 24);
    const estimatedHeight = Math.min(options.length * 36 + 8, maxHeight);
    const openAbove = window.innerHeight - rect.bottom < estimatedHeight + 8 && rect.top > estimatedHeight + 8;
    setPosition({
      top: openAbove ? Math.max(8, rect.top - estimatedHeight - 4) : Math.min(rect.bottom + 4, window.innerHeight - estimatedHeight - 8),
      left: Math.max(8, Math.min(rect.left, viewportWidth - width - 8)),
      width,
      maxHeight
    });
  }, [options.length, minMenuWidth]);

  useEffect(() => {
    if (!open) return;
    updatePosition();
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (open) optionRefs.current[activeIndex]?.focus();
  }, [open, activeIndex]);

  function openAt(index: number) {
    const next = Math.max(0, Math.min(options.length - 1, index));
    setActiveIndex(next);
    updatePosition();
    setOpen(true);
  }

  function choose(option: string) {
    onChange(option);
    setOpen(false);
    triggerRef.current?.focus();
  }

  function handleTriggerKey(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (disabled) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      openAt(selectedIndex);
    } else if (event.key === "Home") {
      event.preventDefault();
      openAt(0);
    } else if (event.key === "End") {
      event.preventDefault();
      openAt(options.length - 1);
    }
  }

  function handleOptionKey(event: ReactKeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      const next = (index + direction + options.length) % options.length;
      setActiveIndex(next);
      optionRefs.current[next]?.focus();
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      const next = event.key === "Home" ? 0 : options.length - 1;
      setActiveIndex(next);
      optionRefs.current[next]?.focus();
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      choose(options[index]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    } else if (event.key === "Tab") {
      setOpen(false);
    } else if (event.key.length === 1 && event.key.trim()) {
      const query = event.key.toLowerCase();
      const next = options.findIndex((option, optionIndex) => optionIndex > index && optionLabel(option).toLowerCase().startsWith(query));
      const wrapped = next >= 0 ? next : options.findIndex((option) => optionLabel(option).toLowerCase().startsWith(query));
      if (wrapped >= 0) {
        setActiveIndex(wrapped);
        optionRefs.current[wrapped]?.focus();
      }
    }
  }

  return <div className={cx("stage-dropdown", className)} ref={rootRef}>
    <button ref={triggerRef} type="button" className="stage-dropdown-trigger" aria-label={label} aria-haspopup="listbox" aria-expanded={open} aria-controls={id} disabled={disabled} onKeyDown={handleTriggerKey} onClick={() => open ? setOpen(false) : openAt(selectedIndex)}>
      <span className="stage-dropdown-value">{optionIcon?.(value)}<span>{optionLabel(value)}</span></span><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 7.5 5 5 5-5"/></svg>
    </button>
    {open && createPortal(<div ref={menuRef} id={id} className="stage-dropdown-menu" role="listbox" aria-label={label} style={{ top: position.top, left: position.left, width: position.width, maxHeight: position.maxHeight }}>
      {options.map((option, index) => <button key={option} ref={(element) => { optionRefs.current[index] = element; }} type="button" role="option" aria-selected={option === value} tabIndex={index === activeIndex ? 0 : -1} className={cx("stage-dropdown-option", option === value && "is-selected", index === activeIndex && "is-active")} onFocus={() => setActiveIndex(index)} onKeyDown={(event) => handleOptionKey(event, index)} onClick={() => choose(option)}>
        <span className="stage-dropdown-option-label">{optionIcon?.(option)}<span>{optionLabel(option)}</span></span>{option === value && <CrmIcon name="check"/>}
      </button>)}
    </div>, triggerRef.current?.closest("dialog") ?? document.body)}
  </div>;
}
