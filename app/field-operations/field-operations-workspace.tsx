"use client";

import { Children, useMemo, useState, type DragEvent, type FormEvent, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react";
import type { ProjectWithEstimate } from "@/app/lib/estimates";
import type { FieldOperationsAssignment, FieldOperationsEquipment, FieldOperationsTask, FieldOperationsVisit } from "@/app/lib/field-operations";
import { getCurrentWeekRange, getEstimatedLaborHours, type WeekRange } from "@/app/lib/field-operations-dates";
import type { Person } from "@/app/lib/personnel";

type DragPayload =
  | { kind: "resource"; resourceType: "employee" | "equipment"; resourceId: number }
  | { kind: "assignment"; assignmentId: number }
  | { kind: "visit"; serviceVisitId: number }
  | { kind: "project"; projectId: number };

function shiftDate(value: string, days: number) {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dateLabel(value: string, options: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric" }) {
  return new Date(`${value}T12:00:00`).toLocaleDateString(undefined, options);
}

function frequencyLabel(project: ProjectWithEstimate) {
  if (project.engagementType !== "Service" || !project.recurrenceFrequency) return null;
  return project.recurrenceFrequency === "SemiAnnually"
    ? "Semi-annually"
    : project.recurrenceFrequency === "Annually"
      ? "Annually"
      : project.recurrenceFrequency;
}

async function sendAction(body: Record<string, unknown>) {
  const response = await fetch("/api/field-operations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new Error(result?.error ?? "Unable to update the field schedule");
}

function startDrag(event: DragEvent<HTMLElement>, payload: DragPayload) {
  event.dataTransfer.effectAllowed = payload.kind === "assignment" || payload.kind === "visit" ? "move" : "copy";
  event.dataTransfer.setData("application/json", JSON.stringify(payload));
}

function TaskCard({
  task,
  employees,
  equipment,
  onAction,
  onDropResource,
}: {
  task: FieldOperationsTask;
  employees: Person[];
  equipment: FieldOperationsEquipment[];
  onAction: (action: Record<string, unknown>) => Promise<void>;
  onDropResource: (payload: DragPayload, taskId: number) => Promise<void>;
}) {
  const [taskName, setTaskName] = useState(task.taskName);
  const [plannedHours, setPlannedHours] = useState(String(task.plannedLaborHours));
  const [resourceChoice, setResourceChoice] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      await onAction(action);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Unable to update task");
    } finally {
      setBusy(false);
    }
  }

  async function saveTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await run({ action: "update-task", taskId: task.taskId, taskName, plannedLaborHours: Number(plannedHours) });
  }

  async function assignSelectedResource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const [resourceType, resourceId] = resourceChoice.split(":");
    if (!resourceId || (resourceType !== "employee" && resourceType !== "equipment")) return;
    await run({ action: "assign-resource", taskId: task.taskId, resourceType, resourceId: Number(resourceId) });
    setResourceChoice("");
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    try {
      const payload: unknown = JSON.parse(event.dataTransfer.getData("application/json"));
      if (
        typeof payload === "object" && payload !== null &&
        "kind" in payload && (payload.kind === "resource" || payload.kind === "assignment")
      ) {
        void onDropResource(payload as DragPayload, task.taskId).catch((dropError: unknown) => {
          setError(dropError instanceof Error ? dropError.message : "Unable to assign resource");
        });
      }
    } catch (dropError) {
      setError(dropError instanceof Error ? dropError.message : "Invalid dragged resource");
    }
  }

  return (
    <div
      className="fieldTask"
      onDragOver={(event) => event.preventDefault()}
      onDrop={handleDrop}
    >
      <form className="fieldTaskEdit" onSubmit={(event) => void saveTask(event)}>
        <label>
          Task
          <input aria-label="Task name" value={taskName} maxLength={150} required onChange={(event) => setTaskName(event.target.value)} />
        </label>
        <label>
          Planned hours
          <input aria-label="Planned task hours" type="number" min="0" max="100000" step="0.25" value={plannedHours} required onChange={(event) => setPlannedHours(event.target.value)} />
        </label>
        <button className="fieldIconButton" type="submit" disabled={busy} aria-label={`Save ${task.taskName}`} title="Save task"><span>Save</span></button>
        <button className="fieldIconButton fieldRemoveButton" type="button" disabled={busy} aria-label={`Remove ${task.taskName}`} title="Remove task" onClick={() => void run({ action: "delete-task", taskId: task.taskId })}><Trash2 size={15} /></button>
      </form>

      <div className="fieldTaskAssignments" aria-label={`Assignments for ${task.taskName}`}>
        {task.assignments.map((assignment) => (
          <AssignmentChip key={assignment.assignmentId} assignment={assignment} busy={busy} onRemove={() => void run({ action: "remove-assignment", assignmentId: assignment.assignmentId })} />
        ))}
        {task.assignments.length === 0 && <span className="fieldDropHint">Drop an employee or equipment here</span>}
      </div>

      <form className="fieldAssignForm" onSubmit={(event) => void assignSelectedResource(event)}>
        <label>
          Assign
          <select aria-label={`Assign resource to ${task.taskName}`} value={resourceChoice} onChange={(event) => setResourceChoice(event.target.value)}>
            <option value="">Choose employee or equipment</option>
            {employees.map((employee) => <option key={`employee-${employee.id}`} value={`employee:${employee.id}`}>{employee.name}</option>)}
            {equipment.map((item) => <option key={`equipment-${item.equipmentId}`} value={`equipment:${item.equipmentId}`}>Equipment: {item.equipmentName}</option>)}
          </select>
        </label>
        <button type="submit" disabled={!resourceChoice || busy}>Assign</button>
      </form>
      {error && <p className="fieldOperationsError" role="alert">{error}</p>}
    </div>
  );
}

function AssignmentChip({
  assignment,
  busy,
  onRemove,
}: {
  assignment: FieldOperationsAssignment;
  busy: boolean;
  onRemove: () => void;
}) {
  const name = assignment.employeeName ?? assignment.equipmentName ?? "Unknown resource";
  const kind = assignment.employeeId !== null ? "Employee" : "Equipment";
  return (
    <span
      className={`fieldAssignmentChip${kind === "Equipment" ? " fieldEquipmentChip" : ""}`}
      draggable
      onDragStart={(event) => startDrag(event, { kind: "assignment", assignmentId: assignment.assignmentId })}
      title="Drag to another task to move this assignment"
    >
      <span>{name}<small>{kind}</small></span>
      <button type="button" aria-label={`Remove ${name}`} disabled={busy} onClick={onRemove}>×</button>
    </span>
  );
}

export default function FieldOperationsWorkspace({
  projects,
  employees,
  roleNames,
  equipment,
  initialWeek,
  initialVisits,
}: {
  projects: ProjectWithEstimate[];
  employees: Person[];
  roleNames: Record<string, string>;
  equipment: FieldOperationsEquipment[];
  initialWeek: WeekRange;
  initialVisits: FieldOperationsVisit[];
}) {
  const [weekStart, setWeekStart] = useState(initialWeek.startDate);
  const [visits, setVisits] = useState(initialVisits);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [selectedDate, setSelectedDate] = useState(initialWeek.startDate);
  const [isLoading, setIsLoading] = useState(false);
  const [isScheduling, setIsScheduling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dates = useMemo(() => Array.from({ length: 7 }, (_, index) => shiftDate(weekStart, index)), [weekStart]);
  const weekEnd = dates[6];
  const visitsByDate = useMemo(() => {
    const grouped = new Map<string, FieldOperationsVisit[]>();
    for (const visit of visits) {
      const dayVisits = grouped.get(visit.visitDate) ?? [];
      dayVisits.push(visit);
      grouped.set(visit.visitDate, dayVisits);
    }
    return grouped;
  }, [visits]);

  async function changeWeek(nextWeekStart: string) {
    setWeekStart(nextWeekStart);
    setSelectedDate(nextWeekStart);
    setVisits([]);
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/field-operations?startDate=${nextWeekStart}&endDate=${shiftDate(nextWeekStart, 6)}`);
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error ?? "Unable to load field schedule");
      setVisits(result.visits as FieldOperationsVisit[]);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load field schedule");
    } finally {
      setIsLoading(false);
    }
  }

  async function refreshSchedule() {
    const response = await fetch(`/api/field-operations?startDate=${weekStart}&endDate=${weekEnd}`);
    const result = await response.json().catch(() => null);
    if (!response.ok) throw new Error(result?.error ?? "Unable to refresh field schedule");
    setVisits(result.visits as FieldOperationsVisit[]);
  }

  async function runAction(action: Record<string, unknown>) {
    setError(null);
    await sendAction(action);
    await refreshSchedule();
  }

  async function scheduleProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedProjectId) return;
    setIsScheduling(true);
    setError(null);
    try {
      await runAction({ action: "schedule-project", projectId: Number(selectedProjectId), visitDate: selectedDate });
    } catch (scheduleError) {
      setError(scheduleError instanceof Error ? scheduleError.message : "Unable to schedule job");
    } finally {
      setIsScheduling(false);
    }
  }

  async function dropResource(payload: DragPayload, taskId: number) {
    if (payload.kind === "assignment") {
      await runAction({ action: "move-assignment", assignmentId: payload.assignmentId, taskId });
      return;
    }
    if (payload.kind === "resource") {
      await runAction({ action: "assign-resource", taskId, resourceType: payload.resourceType, resourceId: payload.resourceId });
    }
  }

  async function dropJob(event: DragEvent<HTMLElement>, visitDate: string) {
    event.preventDefault();
    try {
      const payload: unknown = JSON.parse(event.dataTransfer.getData("application/json"));
      if (typeof payload !== "object" || payload === null || !("kind" in payload)) return;
      if (payload.kind === "visit" && "serviceVisitId" in payload) {
        await runAction({ action: "move-visit", serviceVisitId: Number(payload.serviceVisitId), visitDate });
      } else if (payload.kind === "project" && "projectId" in payload) {
        await runAction({ action: "schedule-project", projectId: Number(payload.projectId), visitDate });
      }
    } catch (dropError) {
      setError(dropError instanceof Error ? dropError.message : "Unable to schedule dropped job");
    }
  }

  const rangeLabel = `${dateLabel(weekStart, { month: "short", day: "numeric" })} – ${dateLabel(weekEnd, { month: "short", day: "numeric", year: "numeric" })}`;

  return (
    <section className="fieldOperationsWorkspace">
      <header className="fieldOperationsHeader">
        <div>
          <p className="salesEyebrow">FIELD OPERATIONS</p>
          <h1>Weekly field planner</h1>
          <p>Approved recurring jobs are scheduled from their start date and frequency through their expected end date. Move individual visits within the week as needed.</p>
        </div>
        <div className="fieldWeekNavigation" aria-label="Choose week">
          <button type="button" aria-label="Previous week" disabled={isLoading} onClick={() => void changeWeek(shiftDate(weekStart, -7))}><ChevronLeft size={18} /></button>
          <strong>{rangeLabel}</strong>
          <button type="button" aria-label="Next week" disabled={isLoading} onClick={() => void changeWeek(shiftDate(weekStart, 7))}><ChevronRight size={18} /></button>
          <button type="button" disabled={isLoading} onClick={() => void changeWeek(getCurrentWeekRange(new Date()).startDate)}>This week</button>
        </div>
      </header>

      <section className="fieldJobPicker">
        <div>
          <h2>Jobs</h2>
          <p>All projects are listed. Estimated labor sums approved estimate lines marked Labor and measured in HR.</p>
          {projects.some((project) => project.engagementType === "Service" && (!project.expectedStartDate || !project.expectedEndDate || !project.recurrenceFrequency)) && (
            <p className="fieldOperationsError" role="alert">Some existing recurring jobs are missing a start date, end date, or frequency. They remain available for manual scheduling, but cannot be automatically scheduled until their recurrence details are supplied.</p>
          )}
          <div className="fieldJobPool">
            {projects.map((project) => (
              <button
                className="fieldJobChip"
                key={project.projectId}
                type="button"
                draggable
                onDragStart={(event) => startDrag(event, { kind: "project", projectId: project.projectId })}
                title="Drag onto a date to schedule this job"
              >
                <strong>{project.projectName}</strong>
                <span>{project.engagementType === "Service" ? "Recurring" : "Project"} · {project.projectStatus}</span>
                <small>{getEstimatedLaborHours(project.lines).toLocaleString()} estimated labor hrs</small>
              </button>
            ))}
            {projects.length === 0 && <p className="fieldResourceEmpty">No projects or recurring jobs yet.</p>}
          </div>
        </div>
        <div className="fieldJobSchedule">
          <h3>Or schedule by selection</h3>
          <form onSubmit={(event) => void scheduleProject(event)}>
            <label>
              Job
              <select aria-label="Job to schedule" required value={selectedProjectId} onChange={(event) => setSelectedProjectId(event.target.value)}>
                <option value="">Choose a project or recurring job</option>
                {projects.map((project) => (
                  <option key={project.projectId} value={project.projectId}>
                    {project.projectName} · {project.engagementType === "Service" ? "Recurring" : "Project"} · {getEstimatedLaborHours(project.lines).toLocaleString()} estimated labor hrs
                  </option>
                ))}
              </select>
            </label>
            <label>
              Date
              <select aria-label="Job date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)}>
                {dates.map((date) => <option key={date} value={date}>{dateLabel(date)}</option>)}
              </select>
            </label>
            <button type="submit" disabled={!selectedProjectId || isScheduling || projects.length === 0}>
              <Plus size={16} /> Schedule
            </button>
          </form>
        </div>
      </section>

      {error && <p className="fieldOperationsError" role="alert">{error}</p>}
      {isLoading && <p className="fieldScheduleLoading" role="status">Loading this week&apos;s schedule…</p>}

      <div className="fieldWeekBoard" aria-label="Weekly job schedule">
        {dates.map((date) => {
          const dayVisits = visitsByDate.get(date) ?? [];
          const plannedHours = dayVisits.reduce(
            (total, visit) => total + visit.tasks.reduce((taskTotal, task) => taskTotal + task.plannedLaborHours, 0),
            0,
          );
          return (
          <section
            className="fieldDayColumn"
            key={date}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => void dropJob(event, date)}
          >
            <header className="fieldDayHeader">
              <strong>{dateLabel(date, { weekday: "long" })}</strong>
              <span>{dateLabel(date, { month: "short", day: "numeric" })} · {plannedHours.toLocaleString()} planned hrs</span>
            </header>
            {dayVisits.length === 0 ? (
              <div className="fieldDayEmpty">No scheduled jobs</div>
            ) : (
              dayVisits.map((visit) => {
                const project = projects.find((item) => item.projectId === visit.projectId);
                if (!project) return null;
                const visitPlannedHours = visit.tasks.reduce((total, task) => total + task.plannedLaborHours, 0);
                return (
                  <article className="fieldScheduledJob" key={visit.serviceVisitId}>
                    <header>
                      <div
                        draggable
                        onDragStart={(event) => startDrag(event, { kind: "visit", serviceVisitId: visit.serviceVisitId })}
                        title="Drag this occurrence onto another day in this week"
                      >
                        <strong>{project.projectName}</strong>
                        <span>{project.engagementType === "Service" ? `${frequencyLabel(project) ?? "Recurring"} service` : "Project"} · {visitPlannedHours.toLocaleString()} planned / {getEstimatedLaborHours(project.lines).toLocaleString()} estimated hrs</span>
                      </div>
                      <span className="fieldJobStatus">{project.projectStatus}</span>
                      <button
                        className="fieldUnscheduleButton"
                        type="button"
                        aria-label={`Remove ${project.projectName} from ${dateLabel(date)}`}
                        title="Remove this visit from the schedule"
                        onClick={() => void runAction({ action: "unschedule-visit", serviceVisitId: visit.serviceVisitId }).catch((actionError: unknown) => setError(actionError instanceof Error ? actionError.message : "Unable to remove visit"))}
                      >×</button>
                    </header>
                    <label className="fieldVisitMove">
                      Move visit to
                      <select
                        aria-label={`Move ${project.projectName} occurrence from ${dateLabel(date)}`}
                        value={visit.visitDate}
                        onChange={(event) => void runAction({ action: "move-visit", serviceVisitId: visit.serviceVisitId, visitDate: event.target.value }).catch((actionError: unknown) => setError(actionError instanceof Error ? actionError.message : "Unable to move visit"))}
                      >
                        {dates.map((day) => <option key={day} value={day}>{dateLabel(day)}</option>)}
                      </select>
                    </label>
                    <div className="fieldTasks">
                      {visit.tasks.map((task) => (
                        <TaskCard
                          key={`${task.taskId}:${task.taskName}:${task.plannedLaborHours}`}
                          task={task}
                          employees={employees}
                          equipment={equipment}
                          onAction={runAction}
                          onDropResource={dropResource}
                        />
                      ))}
                    </div>
                    <AddTaskForm visit={visit} onAction={runAction} />
                  </article>
                );
              })
            )}
          </section>
        );
      })}
      </div>
      <p className="fieldScheduleHint">Drag a scheduled job&apos;s title to another day, or use Move visit to. Moving or removing a visit affects only that occurrence, not future dates. Drop a job from the list above to add extra work. Employees and equipment may be assigned to multiple tasks on a date; conflicts are not blocked.</p>

      <section className="fieldResourceLists">
        <ResourceList
          title="Employees"
          description="All employees from the organization chart are available in v1."
          emptyMessage="No employees are in the organization chart yet."
        >
          {employees.map((employee) => (
            <ResourceChip
              key={employee.id}
              label={employee.name}
              detail={roleNames[employee.roleId] ?? "Employee"}
              onDragStart={(event) => startDrag(event, { kind: "resource", resourceType: "employee", resourceId: Number(employee.id) })}
            />
          ))}
        </ResourceList>
        <ResourceList
          title="Equipment"
          description="Drag equipment onto a task or choose it from the task assignment menu."
          emptyMessage="No equipment has been added yet."
        >
          {equipment.map((item) => (
            <ResourceChip
              key={item.equipmentId}
              label={item.equipmentName}
              detail={[item.equipmentType, item.assetTag].filter(Boolean).join(" · ") || "Equipment"}
              onDragStart={(event) => startDrag(event, { kind: "resource", resourceType: "equipment", resourceId: item.equipmentId })}
            />
          ))}
        </ResourceList>
      </section>
    </section>
  );
}

function AddTaskForm({ visit, onAction }: { visit: FieldOperationsVisit; onAction: (action: Record<string, unknown>) => Promise<void> }) {
  const [taskName, setTaskName] = useState("");
  const [plannedLaborHours, setPlannedLaborHours] = useState("0");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onAction({ action: "add-task", serviceVisitId: visit.serviceVisitId, taskName, plannedLaborHours: Number(plannedLaborHours) });
      setTaskName("");
      setPlannedLaborHours("0");
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Unable to add task");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="fieldAddTask" onSubmit={(event) => void submit(event)}>
      <label>
        Add task
        <input aria-label="New task name" placeholder="Task name" maxLength={150} value={taskName} required onChange={(event) => setTaskName(event.target.value)} />
      </label>
      <label>
        Planned hrs
        <input aria-label="New task planned hours" type="number" min="0" max="100000" step="0.25" value={plannedLaborHours} onChange={(event) => setPlannedLaborHours(event.target.value)} />
      </label>
      <button type="submit" disabled={busy}><Plus size={14} /> Add</button>
      {error && <span className="fieldOperationsError" role="alert">{error}</span>}
    </form>
  );
}

function ResourceList({
  title,
  description,
  emptyMessage,
  children,
}: {
  title: string;
  description: string;
  emptyMessage: string;
  children: ReactNode;
}) {
  return (
    <section className="fieldResourceList">
      <header><h2>{title}</h2><p>{description}</p></header>
      <div className="fieldResourcePool">
        {Children.count(children) > 0 ? children : <p className="fieldResourceEmpty">{emptyMessage}</p>}
      </div>
    </section>
  );
}

function ResourceChip({
  label,
  detail,
  onDragStart,
}: {
  label: string;
  detail: string;
  onDragStart: (event: DragEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button className="fieldResourceChip" type="button" draggable onDragStart={onDragStart} title="Drag onto a task to assign">
      <strong>{label}</strong><span>{detail}</span>
    </button>
  );
}
