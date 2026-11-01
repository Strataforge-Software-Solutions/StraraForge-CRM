import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent as ReactDragEvent, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CrmIcon, DatePicker, ErrorBox, Loading, Modal, PageHeader, StageDropdown, useAuth, useToast } from "@/crm/shared";
import { ImagePicker, RecordImages, uploadRecordImages } from "@/crm/images";
import { createClient as db } from "@/lib/supabase/client";

type ProjectOption = { project_id: string; project_name: string; project_status: string; task_count: number };
type ProjectTask = { task_id: string; project_id: string; project_name: string; title: string; description: string | null; due_at: string | null; task_status: string; development_stage: string; is_claimed: boolean; assigned_to_me: boolean };

const developmentStages = [
  ["new_feature", "New Feature", "#f35b18"],
  ["planned", "Planned", "#3384ef"],
  ["building", "Building", "#18a873"],
  ["code_review", "Code Review", "#f2a20a"],
  ["testing", "Testing / QA", "#3384ef"],
  ["client_review", "UAT / Client Review (Optional)", "#9254e9"],
  ["ready_to_deploy", "Ready to Deploy", "#18a873"],
  ["released", "Released", "#109552"],
] as const;

function dateText(value: string | null) {
  if (!value) return "No due date";
  return new Date(value).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Manila" });
}

export default function TeamProjectTasks() {
  const { founder } = useAuth();
  const notify = useToast();
  const [params, setParams] = useSearchParams();
  const requestedProject = params.get("project") ?? "";
  const [projects, setProjects] = useState<ProjectOption[] | null>(null);
  const [tasks, setTasks] = useState<ProjectTask[] | null>(null);
  const [selectedProject, setSelectedProject] = useState(requestedProject);
  const [loadError, setLoadError] = useState("");
  const [projectError, setProjectError] = useState("");
  const [formError, setFormError] = useState("");
  const [addingTask, setAddingTask] = useState(false);
  const [newTaskImages, setNewTaskImages] = useState<File[]>([]);
  const [savedTaskId, setSavedTaskId] = useState("");
  const [showSharedQueue, setShowSharedQueue] = useState(() => typeof window !== "undefined" && window.location.hash === "#shared-delivery-queue");
  const [busyId, setBusyId] = useState("");
  const [draggedTaskId, setDraggedTaskId] = useState("");
  const [dragOverStage, setDragOverStage] = useState("");
  const [recentlyMovedId, setRecentlyMovedId] = useState("");
  const [saving, setSaving] = useState(false);
  const [detailsTask, setDetailsTask] = useState<ProjectTask | null>(null);
  const [realtimeStatus, setRealtimeStatus] = useState<"connecting" | "live" | "paused">("connecting");
  const [realtimeRetry, setRealtimeRetry] = useState(0);
  const taskRequestId = useRef(0);
  const dragPreviewRef = useRef<HTMLDivElement | null>(null);
  const pendingArrivalRef = useRef<{ taskId: string; stage: string } | null>(null);
  const activeProject = useMemo(() => projects?.find((project) => project.project_id === selectedProject) ?? null, [projects, selectedProject]);
  const projectListLoaded = projects !== null;

  const loadProjects = useCallback(async () => {
    setLoadError("");
    setProjectError("");
    setProjects(null);
    try {
      const result = await db().rpc("list_project_task_projects");
      if (result.error) {
        setProjectError(result.error.message || "The project list could not be loaded.");
        return;
      }
      const rows = (result.data ?? []) as ProjectOption[];
      setProjects(rows);
      const matched = rows.some((project) => project.project_id === requestedProject) ? requestedProject : rows[0]?.project_id ?? "";
      setSelectedProject(matched);
      if (matched !== requestedProject) setParams(matched ? { project: matched } : {}, { replace: true });
    } catch (error) {
      setProjectError(error instanceof Error ? error.message : "The project list could not be loaded.");
    }
  }, [requestedProject, setParams]);

  const loadTasks = useCallback(async (projectId: string, options: { silent?: boolean } = {}) => {
    const requestId = ++taskRequestId.current;
    setLoadError("");
    if (!projectId) { setTasks([]); return true; }
    if (!options.silent) setTasks(null);
    try {
      const result = await db().rpc("get_project_delivery_tasks", { p_project_id: projectId });
      if (requestId !== taskRequestId.current) return null;
      if (result.error) { setLoadError(result.error.message || "Project tasks could not be loaded."); return false; }
      const rows = (result.data ?? []) as ProjectTask[];
      setTasks(rows.map((task) => ({ ...task, development_stage: task.development_stage || (task.task_status === "completed" ? "released" : task.task_status === "in_progress" ? "building" : "new_feature") })));
      return true;
    } catch (error) {
      if (requestId !== taskRequestId.current) return null;
      setLoadError(error instanceof Error ? error.message : "Project tasks could not be loaded.");
      return false;
    }
  }, []);

  useEffect(() => { void loadProjects(); }, [loadProjects]);
  useEffect(() => { if (projects !== null) void loadTasks(selectedProject); }, [loadTasks, projects, selectedProject]);
  useEffect(() => {
    if (!recentlyMovedId) return;
    const timeout = window.setTimeout(() => setRecentlyMovedId(""), 850);
    return () => window.clearTimeout(timeout);
  }, [recentlyMovedId]);
  useEffect(() => {
    const pending = pendingArrivalRef.current;
    if (!pending || !tasks?.some((task) => task.task_id === pending.taskId && task.development_stage === pending.stage)) return;
    pendingArrivalRef.current = null;
    setRecentlyMovedId(pending.taskId);
  }, [tasks]);
  useEffect(() => () => { dragPreviewRef.current?.remove(); }, []);
  useEffect(() => {
    if (!selectedProject || !projectListLoaded) return;
    let active = true;
    let refreshTimer: number | undefined;
    setRealtimeStatus("connecting");
    const client = db();
    const refreshQuietly = () => {
      window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => void loadTasks(selectedProject, { silent: true }), 120);
    };
    const channel = client.channel(`project-tasks:${selectedProject}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "tasks", filter: `project_id=eq.${selectedProject}` }, refreshQuietly)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "tasks", filter: `project_id=eq.${selectedProject}` }, refreshQuietly)
      .subscribe((status) => {
        if (!active) return;
        if (status === "SUBSCRIBED") {
          setRealtimeStatus("live");
          refreshQuietly();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          setRealtimeStatus("paused");
        }
      });
    return () => {
      active = false;
      window.clearTimeout(refreshTimer);
      void client.removeChannel(channel);
    };
  }, [loadTasks, projectListLoaded, realtimeRetry, selectedProject]);

  function chooseProject(projectId: string) {
    pendingArrivalRef.current = null;
    setSelectedProject(projectId);
    setParams(projectId ? { project: projectId } : {}, { replace: true });
  }

  async function addTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedProject || saving) return;
    setSaving(true); setFormError("");
    try {
      let taskId = savedTaskId;
      if (!taskId) {
        const form = new FormData(event.currentTarget);
        const due = String(form.get("due_at") ?? "");
        const result = await db().rpc("create_project_delivery_task", {
          p_project_id: selectedProject,
          p_title: String(form.get("title") ?? "").trim(),
          p_description: String(form.get("description") ?? "").trim() || null,
          p_due_at: due ? `${due}T12:00:00.000Z` : null,
        });
        if (result.error || !result.data) { setFormError(result.error?.message || "Task could not be added."); return; }
        taskId = String(result.data);
        setSavedTaskId(taskId);
      }
      if (newTaskImages.length) {
        const result = await uploadRecordImages(founder!.workspaceId, "task", taskId, newTaskImages);
        setNewTaskImages(result.failed);
        if (result.error) { setFormError(`Task saved, but ${result.failed.length} ${result.failed.length === 1 ? "image" : "images"} could not upload. ${result.error} Retry Add shared task or attach them in task details.`); await loadTasks(selectedProject, { silent: true }); return; }
      }
      setAddingTask(false);
      setNewTaskImages([]);
      setSavedTaskId("");
      notify("Task added to the shared project list.");
      await loadTasks(selectedProject);
      await loadProjects();
    } catch { setFormError("Task or image upload failed. Please try again."); }
    finally { setSaving(false); }
  }

  async function claim(task: ProjectTask) {
    if (busyId) return;
    setBusyId(task.task_id);
    const result = await db().rpc("claim_project_delivery_task", { p_task_id: task.task_id });
    setBusyId("");
    if (result.error) { notify("Could not assign this task. Refresh and try again.", true); return; }
    if (!result.data) { notify("Someone else already claimed this task.", true); await loadTasks(selectedProject); return; }
    notify("Task assigned to you.");
    await loadTasks(selectedProject);
  }

  async function setStatus(task: ProjectTask, status: "in_progress" | "completed") {
    if (busyId) return;
    setBusyId(task.task_id);
    const result = await db().rpc("set_project_delivery_task_status", { p_task_id: task.task_id, p_status: status });
    setBusyId("");
    if (result.error) { notify(result.error.message, true); return; }
    notify(status === "completed" ? "Task completed." : "Task started.");
    await loadTasks(selectedProject);
  }

  async function unassign(task: ProjectTask) {
    if (busyId) return;
    setBusyId(task.task_id);
    const result = await db().rpc("unassign_project_delivery_task", { p_task_id: task.task_id });
    setBusyId("");
    if (result.error) {
      const message = /PGRST202|unassign_project_delivery_task/i.test(result.error.message)
        ? "Unassign is not enabled in Supabase yet. Apply migration 202611010002_unassign_project_delivery_task.sql, then retry."
        : result.error.message;
      notify(message, true);
      return;
    }
    notify("Task returned to the shared queue.");
    await loadTasks(selectedProject);
  }

  async function moveDevelopmentTask(task: ProjectTask, stage: string) {
    if (busyId || task.development_stage === stage || task.task_status === "cancelled") return;
    pendingArrivalRef.current = { taskId: task.task_id, stage };
    setBusyId(task.task_id);
    try {
      const result = await db().rpc("set_project_delivery_task_stage", { p_task_id: task.task_id, p_stage: stage });
      if (result.error) {
        const message = /PGRST202|set_project_delivery_task_stage/i.test(result.error.message)
          ? "The development flow needs migration 202611010004_project_task_development_flow.sql applied in Supabase."
          : result.error.message || "Could not move this development task.";
        pendingArrivalRef.current = null;
        notify(message, true);
        return;
      }
      const refreshed = await loadTasks(selectedProject, { silent: true });
      notify(refreshed === false ? "Stage saved, but the task list could not refresh. Please retry." : `Moved to ${developmentStages.find(([key]) => key === stage)?.[1] ?? stage}.`, refreshed === false);
    } catch {
      pendingArrivalRef.current = null;
      notify("Could not move this development task. Please try again.", true);
    } finally {
      setBusyId("");
    }
  }

  function clearDevelopmentDrag() {
    setDraggedTaskId("");
    setDragOverStage("");
    dragPreviewRef.current?.remove();
    dragPreviewRef.current = null;
  }

  function startDevelopmentDrag(event: ReactDragEvent<HTMLLIElement>, task: ProjectTask) {
    if (busyId || task.task_status === "completed" || task.task_status === "cancelled") {
      event.preventDefault();
      return;
    }
    clearDevelopmentDrag();
    event.dataTransfer.setData("text/plain", task.task_id);
    event.dataTransfer.effectAllowed = "move";
    const preview = document.createElement("div");
    preview.className = "development-flow-drag-preview";
    const title = document.createElement("strong");
    title.textContent = task.title;
    const project = document.createElement("span");
    project.textContent = task.project_name;
    preview.append(title, project);
    document.body.appendChild(preview);
    dragPreviewRef.current = preview;
    event.dataTransfer.setDragImage(preview, 22, 24);
    window.setTimeout(() => {
      if (dragPreviewRef.current !== preview) return;
      preview.remove();
      dragPreviewRef.current = null;
    }, 0);
    setDraggedTaskId(task.task_id);
  }

  function dragDevelopmentOver(event: ReactDragEvent<HTMLElement>, stage: string) {
    const draggedTask = tasks?.find((task) => task.task_id === draggedTaskId);
    if (!draggedTask || draggedTask.development_stage === stage) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDragOverStage(stage);
  }

  function dropDevelopmentTask(event: ReactDragEvent<HTMLElement>, stage: string) {
    event.preventDefault();
    const taskId = event.dataTransfer.getData("text/plain") || draggedTaskId;
    const task = tasks?.find((item) => item.task_id === taskId);
    clearDevelopmentDrag();
    if (!task || task.development_stage === stage || task.task_status === "completed" || task.task_status === "cancelled") return;
    setDragOverStage(stage);
    void moveDevelopmentTask(task, stage).finally(() => setDragOverStage(""));
  }

  if (!founder) return <Loading/>;
  const selfAssigneeName = founder.name?.trim().split(/\s+/)[0];
  const selfAssigneeLabel = selfAssigneeName ? `You (${selfAssigneeName})` : "You";
  const backHref = selectedProject ? `/projects/${selectedProject}` : "/projects";
  const backLabel = selectedProject ? "Back to project" : "Back to projects";
  const backButton = <Link className="button button-secondary team-task-back-button" to={backHref}><span aria-hidden="true">←</span>{backLabel}</Link>;
  const toggleTaskQueue = () => {
    if (showSharedQueue) {
      closeTaskQueue();
      return;
    }
    setShowSharedQueue(true);
    const url = new URL(window.location.href);
    url.hash = "shared-delivery-queue";
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  };
  const closeTaskQueue = () => {
    setShowSharedQueue(false);
    const url = new URL(window.location.href);
    if (url.hash === "#shared-delivery-queue") url.hash = "";
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  };
  const tasksButton = <button className={`button ${showSharedQueue ? "button-primary" : "button-secondary"}`} type="button" disabled={!selectedProject} aria-controls="shared-delivery-queue" aria-expanded={showSharedQueue} onClick={toggleTaskQueue}>Tasks</button>;
  const openNewTask = () => { setFormError(""); setNewTaskImages([]); setSavedTaskId(""); setAddingTask(true); };
  const closeNewTask = () => { if (saving) return; setAddingTask(false); setNewTaskImages([]); setSavedTaskId(""); setFormError(""); };
  const newTaskButton = <button className="button button-primary" type="button" disabled={!selectedProject} onClick={openNewTask}>＋ New task</button>;
  if (projects === null && !projectError) return <><PageHeader eyebrow="Delivery team" title="Project tasks" description="Add delivery work, then claim an unassigned task so the team knows who owns it." action={backButton}/><Loading label="Loading active projects…"/></>;
  const availableProjects=projects??[];
  const projectSelect = <label className="field team-project-select"><span>Project</span><StageDropdown value={selectedProject} options={availableProjects.map((project) => project.project_id)} optionLabels={Object.fromEntries(availableProjects.map((project) => [project.project_id, project.project_name]))} disabled={!selectedProject} label="Choose project" onChange={chooseProject} minMenuWidth={260} className="team-project-select-dropdown"/></label>;

  return <>
    <PageHeader eyebrow="Delivery team" title={activeProject?.project_name ?? "Project tasks"} description="Add delivery work, then claim an unassigned task so the team knows who owns it." action={<div className="team-task-page-actions">{projectSelect}<div className="team-task-page-button-row">{tasksButton}{newTaskButton}{backButton}</div></div>}/>
    {projectError ? <section className="record-list-panel team-task-load-state" role="alert"><span className="team-task-load-icon" aria-hidden="true">!</span><div><h2>Couldn’t load projects</h2><p>The project list is temporarily unavailable. Try again, or share the error below with your workspace admin.</p><code>{projectError}</code><button className="button button-primary" type="button" onClick={() => void loadProjects()}>Retry project list</button></div></section> : availableProjects.length === 0 ? <section className="record-list-panel team-task-empty"><span className="team-task-empty-icon" aria-hidden="true">▱</span><strong>No active projects yet</strong><p>Project tasks will appear here after a co-founder creates an active project.</p></section> : null}
    {showSharedQueue && !projectError && availableProjects.length > 0 && <Modal title="Tasks" description="Claim or manage shared delivery work for this project." onClose={closeTaskQueue} className="team-task-queue-dialog">
      <section id="shared-delivery-queue" className="record-list-panel team-task-board" aria-label="Shared delivery task queue" tabIndex={-1}>
        <div className="team-task-heading"><div><p className="eyebrow">Shared delivery queue</p><h2>Shared tasks</h2><p>Claimed tasks show as assigned, so teammates can avoid duplicating the same work.</p></div><div className="team-task-board-controls">{newTaskButton}{realtimeStatus === "paused" && <button className="team-task-reconnect" type="button" onClick={() => setRealtimeRetry((attempt) => attempt + 1)}>Reconnect</button>}</div></div>
        {loadError && <div className="team-task-inline-error" role="alert"><div><strong>Tasks couldn’t be synced</strong><p>{loadError}</p></div><button className="button button-secondary" type="button" onClick={() => void loadTasks(selectedProject)}>Retry</button></div>}
        {!tasks ? loadError ? null : <Loading label="Loading project tasks…"/> : tasks.length ? <ul className="team-task-list">{tasks.map((task) => <li key={task.task_id} className={`team-task-card${task.task_status === "completed" ? " is-complete" : ""}`}>
          <div className="team-task-copy"><div className="team-task-title-row"><svg className="team-task-line-icon" viewBox="0 0 20 20" aria-hidden="true"><rect x="4" y="3" width="12" height="14" rx="2"/><path d="M7 7h6M7 10h6M7 13h4"/></svg><h3>{task.title}</h3></div><span className={`team-task-status is-${task.task_status === "cancelled" ? "cancelled" : task.is_claimed ? "claimed" : task.task_status === "completed" ? "completed" : "available"}`}>{task.is_claimed && task.task_status !== "completed" && task.task_status !== "cancelled" && <svg className="team-task-assignee-icon" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="6.5" r="3"/><path d="M4.5 17v-1.5a5.5 5.5 0 0 1 11 0V17z"/></svg>}{task.task_status === "completed" ? "Completed" : task.task_status === "cancelled" ? "Cancelled" : task.is_claimed ? task.assigned_to_me ? selfAssigneeName ? `Assigned to You (${selfAssigneeName})` : "Assigned to you" : "Assigned" : "Available"}</span>
            {task.description && <p><svg className="team-task-line-icon" viewBox="0 0 20 20" aria-hidden="true"><path d="M4 4.5h12a1.5 1.5 0 0 1 1.5 1.5v7a1.5 1.5 0 0 1-1.5 1.5H9l-4.5 2v-3.5A1.5 1.5 0 0 1 3 11.5V6a1.5 1.5 0 0 1 1-1.5Z"/><path d="M6.5 8h7M6.5 11h5"/></svg><span>{task.description}</span></p>}<small><svg className="team-task-line-icon" viewBox="0 0 20 20" aria-hidden="true"><rect x="3" y="4.5" width="14" height="13" rx="2"/><path d="M6.5 2.5v4M13.5 2.5v4M3 8.5h14"/></svg><span>{task.project_name} · {dateText(task.due_at)}</span></small></div>
          <div className="team-task-actions">{!task.is_claimed && task.task_status === "open" ? <button className="button button-primary" type="button" disabled={Boolean(busyId)} onClick={() => void claim(task)}>{busyId === task.task_id ? "Assigning…" : "Assign this task for me"}</button> : task.assigned_to_me && task.task_status !== "completed" && task.task_status !== "cancelled" ? <><button className="button button-secondary" type="button" disabled={Boolean(busyId)} onClick={() => void setStatus(task, task.task_status === "in_progress" ? "completed" : "in_progress")}>{busyId === task.task_id ? "Saving…" : task.task_status === "in_progress" ? "Complete task" : "Start task"}</button><button className="button button-secondary team-task-unassign" type="button" disabled={Boolean(busyId)} onClick={() => void unassign(task)}>{busyId === task.task_id ? "Unassigning…" : "Unassign"}</button></> : null}</div>
        </li>)}</ul> : <div className="team-task-empty-inline"><span aria-hidden="true">✓</span><strong>No tasks for this project yet</strong><p>Use New task to add work for the team to claim.</p></div>}
      </section>
    </Modal>}
    {addingTask && <Modal title="New project task" description="New tasks start in New Feature and stay unassigned until a teammate claims one." onClose={closeNewTask} className="team-task-create-dialog"><form className="record-form" onSubmit={(event) => void addTask(event)}>
      <fieldset className="crm-image-saved-fields" disabled={Boolean(savedTaskId)}><label className="field"><span>Task title *</span><input name="title" required maxLength={240} placeholder="e.g. Build the contact form" autoFocus/></label>
      <label className="field"><span>Description</span><textarea name="description" rows={4} maxLength={5000} placeholder="Add useful implementation details for the team."/></label>
      <label className="field"><span>Due date</span><DatePicker name="due_at" label="Due date"/></label></fieldset>
      <ImagePicker files={newTaskImages} onChange={setNewTaskImages} disabled={saving}/>
      {formError && <ErrorBox>{formError}</ErrorBox>}
      <div className="form-actions"><button className="button button-secondary" type="button" disabled={saving} onClick={closeNewTask}>Cancel</button><button className="button button-primary" disabled={saving || !selectedProject}>{saving ? "Adding task…" : savedTaskId ? "Retry images" : "Add shared task"}</button></div>
    </form></Modal>}
    {!projectError && availableProjects.length > 0 && <section className="record-list-panel development-flow-panel" aria-labelledby="development-flow-title">
      <div className="development-flow-heading"><div><p className="eyebrow">Development workflow</p><h2 id="development-flow-title">Feature Development Flow</h2><p>Track project work from request through release. Move a card with its stage menu or drag it into a column.</p></div><span className="development-flow-count">{tasks?.filter((task) => task.task_status !== "cancelled").length ?? 0} items</span></div>
      {loadError && <div className="team-task-inline-error" role="alert"><div><strong>Development items couldn’t be synced</strong><p>{loadError}</p></div><button className="button button-secondary" type="button" onClick={() => void loadTasks(selectedProject)}>Retry</button></div>}
      {!tasks ? loadError ? null : <Loading label="Loading development items…"/> : <div className="development-flow-scroll" tabIndex={0} aria-label="Feature development stages" onDragOver={draggedTaskId ? (event) => { const bounds = event.currentTarget.getBoundingClientRect(); const edge = 64; const distanceLeft = event.clientX - bounds.left; const distanceRight = bounds.right - event.clientX; if (distanceLeft >= 0 && distanceLeft < edge) event.currentTarget.scrollLeft -= Math.ceil((edge - distanceLeft) / 3); else if (distanceRight >= 0 && distanceRight < edge) event.currentTarget.scrollLeft += Math.ceil((edge - distanceRight) / 3); } : undefined} onDragLeave={draggedTaskId ? (event) => { const bounds = event.currentTarget.getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) setDragOverStage(""); } : undefined}>
        <div className={`development-flow-board${draggedTaskId ? " is-dragging" : ""}`}>{developmentStages.map(([key, label, color]) => {
          const stageTasks = tasks.filter((task) => task.task_status !== "cancelled" && task.development_stage === key);
          const isDropTarget = dragOverStage === key;
          const canDropHere = Boolean(draggedTaskId) && tasks.some((task) => task.task_id === draggedTaskId && task.development_stage !== key);
          return <section key={key} className={`development-flow-lane${draggedTaskId ? " is-drop-ready" : ""}${isDropTarget ? " is-drop-target" : ""}`} style={{ "--flow-stage-color": color } as CSSProperties} onDragOver={(event) => dragDevelopmentOver(event, key)} onDrop={(event) => dropDevelopmentTask(event, key)} aria-label={`${label}, ${stageTasks.length} items`}>
            <header><span className="development-flow-dot" aria-hidden="true"/><h3 title={label}>{label}</h3><div className="development-flow-lane-tools"><span className="development-flow-lane-count">{stageTasks.length}</span><button type="button" className="development-flow-lane-add" aria-label="Add a task to New Feature" title="Add a task to New Feature" onClick={openNewTask}><CrmIcon name="plus"/></button></div></header>
            {stageTasks.length ? <ul>{stageTasks.map((task) => <li key={task.task_id} className={`development-flow-card${busyId === task.task_id ? " is-saving" : ""}${draggedTaskId === task.task_id ? " is-drag-source" : ""}${recentlyMovedId === task.task_id ? " is-just-moved" : ""}`} draggable={task.task_status !== "cancelled" && task.task_status !== "completed" && !busyId} onDragStart={(event) => startDevelopmentDrag(event, task)} onDragEnd={clearDevelopmentDrag}>
              <div className="development-flow-card-top"><h4>{task.title}</h4><button className="development-flow-view-details" type="button" aria-label={`View details for ${task.title}`} title="View task details" onClick={(event) => { event.stopPropagation(); setDetailsTask(task); }}><CrmIcon name="more"/></button></div>
              <p className="development-flow-project-name">{task.project_name}</p>
              <span className={`development-flow-status is-${task.task_status}`}>{task.task_status === "completed" ? "Completed" : task.task_status === "in_progress" ? "In progress" : "Open"}</span>
              <div className="development-flow-meta"><span className="development-flow-detail"><CrmIcon name="calendar"/>{task.due_at ? <time dateTime={task.due_at}>{dateText(task.due_at)}</time> : "No due date"}</span><span className="development-flow-assignee" title={task.assigned_to_me ? selfAssigneeLabel : task.is_claimed ? "Assigned teammate" : "Unassigned"}><span className={`development-flow-avatar${task.assigned_to_me ? " is-mine" : ""}`}>{task.assigned_to_me ? selfAssigneeName?.slice(0, 2).toUpperCase() || "ME" : <CrmIcon name="users"/>}</span><span>{task.assigned_to_me ? "You" : task.is_claimed ? "Assigned" : "Unassigned"}</span></span></div>
              <div className="development-flow-card-footer"><label className="development-flow-stage-select"><StageDropdown value={task.development_stage} options={developmentStages.map(([stage]) => stage)} optionLabels={Object.fromEntries(developmentStages.map(([stage, name]) => [stage, name]))} disabled={Boolean(busyId) || task.task_status === "completed"} label={`Move ${task.title} to stage`} onChange={(stage) => void moveDevelopmentTask(task, stage)} minMenuWidth={185} className="development-flow-stage-dropdown"/></label></div>
              {busyId === task.task_id && <span className="development-flow-saving" role="status">Saving stage…</span>}
            </li>)}</ul> : <div className="development-flow-drop">{isDropTarget && canDropHere ? "Release to move here" : isDropTarget && busyId ? "Moving task…" : "Drop work here"}</div>}
            {stageTasks.length > 0 && isDropTarget && canDropHere && <div className="development-flow-drop-hint" aria-hidden="true">Release to move here</div>}
          </section>;
        })}</div>
      </div>}
    </section>}
    {detailsTask && <Modal title={detailsTask.title} description={detailsTask.project_name} onClose={() => setDetailsTask(null)} className="team-task-detail-dialog">
      <div className="team-task-detail-body">
        <section className="team-task-detail-description" aria-labelledby="team-task-description-title">
          <h3 id="team-task-description-title">Task details</h3>
          <p>{detailsTask.description?.trim() || "No additional details were provided for this task."}</p>
        </section>
        <dl className="team-task-detail-facts">
          <div><dt>Assigned to</dt><dd>{detailsTask.assigned_to_me ? selfAssigneeLabel : detailsTask.is_claimed ? "Assigned teammate" : "Unassigned"}</dd></div>
          <div><dt>Due date</dt><dd>{dateText(detailsTask.due_at)}</dd></div>
          <div><dt>Workflow stage</dt><dd>{developmentStages.find(([stage]) => stage === detailsTask.development_stage)?.[1] || "New Feature"}</dd></div>
          <div><dt>Task status</dt><dd>{detailsTask.task_status === "completed" ? "Completed" : detailsTask.task_status === "in_progress" ? "In progress" : "Open"}</dd></div>
        </dl>
        <RecordImages recordType="task" recordId={detailsTask.task_id}/>
        <div className="team-task-detail-actions"><button className="button button-secondary" type="button" onClick={() => setDetailsTask(null)}>Close</button></div>
      </div>
    </Modal>}
  </>;
}
