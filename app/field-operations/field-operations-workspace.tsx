"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type FormEvent } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Plus, UserRound } from "lucide-react";
import type { ProjectWithEstimate } from "@/app/lib/estimates";
import type { FieldOperationsEquipment, FieldOperationsVisit } from "@/app/lib/field-operations";
import { getCurrentWeekRange, getEstimatedLaborHours, type WeekRange } from "@/app/lib/field-operations-dates";
import type { Person } from "@/app/lib/personnel";
import { capacityLabel, dayCapacityLabel, resourceCapacity, visitLaborHours, DAILY_CAPACITY, WEEKLY_CAPACITY, type ResourceKind } from "@/app/lib/field-capacity";
import TaskAssignmentModal from "./task-assignment-modal";
import Modal from "@/app/components/modal";
import styles from "./field-operations-workspace.module.css";

type DragPayload =
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
  event.dataTransfer.effectAllowed = payload.kind === "visit" ? "move" : "copy";
  event.dataTransfer.setData("application/json", JSON.stringify(payload));
}

export default function FieldOperationsWorkspace({
  projects,
  employees,
  roleNames,
  equipment,
  initialWeek,
  initialVisits,
  projectId,
  canEdit = true,
}: {
  projects: ProjectWithEstimate[];
  employees: Person[];
  roleNames: Record<string, string>;
  equipment: FieldOperationsEquipment[];
  initialWeek: WeekRange;
  initialVisits: FieldOperationsVisit[];
  projectId?: number;
  canEdit?: boolean;
}) {
  const [weekStart, setWeekStart] = useState(initialWeek.startDate);
  const [visits, setVisits] = useState(initialVisits);
  const [selectedProjectId, setSelectedProjectId] = useState(projectId ? String(projectId) : "");
  const [schedulingMode, setSchedulingMode] = useState<"drag" | "select">("select");
  const [showScheduling, setShowScheduling] = useState(false);
  const [boardView, setBoardView] = useState<"responsive" | "week" | "day">("responsive");
  const activeProjects = projects.filter((project) => project.projectStatus === "Active" && (!projectId || project.projectId === projectId));
  const [selectedDate, setSelectedDate] = useState(initialWeek.startDate);
  const [isLoading, setIsLoading] = useState(false);
  const [isScheduling, setIsScheduling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [availabilityDate, setAvailabilityDate] = useState(initialWeek.startDate);
  const [showAvailability, setShowAvailability] = useState(false);
  const [availabilityKind, setAvailabilityKind] = useState<ResourceKind>("employee");
  const [capacityAvailable, setCapacityAvailable] = useState(true);
  const [assigningVisitId, setAssigningVisitId] = useState<number | null>(null);
  const closeAssignment = useCallback(() => setAssigningVisitId(null), []);
  const loadSequence = useRef(0);

  const dates = useMemo(() => Array.from({ length: 7 }, (_, index) => shiftDate(weekStart, index)), [weekStart]);
  const weekEnd = dates[6];
  const activeVisits = useMemo(() => {
    const activeProjectIds = new Set(projects.filter((project) => project.projectStatus === "Active").map((project) => project.projectId));
    return visits.filter((visit) => activeProjectIds.has(visit.projectId));
  }, [projects, visits]);
  const capacity = useMemo(() => resourceCapacity(activeVisits, dates, "employee"), [activeVisits, dates]);
  const equipmentCapacity = useMemo(() => resourceCapacity(activeVisits, dates, "equipment"), [activeVisits, dates]);
  const overbookedResources = [capacity, equipmentCapacity].reduce((count, resources) => count + [...resources.values()].filter((days) =>
    [...days.values()].some((hours) => hours > DAILY_CAPACITY)
    || [...days.values()].reduce((total, hours) => total + hours, 0) > WEEKLY_CAPACITY).length, 0);
  const assigningVisit = activeVisits.find((visit) => visit.serviceVisitId === assigningVisitId) ?? null;
  const assigningProject = assigningVisit ? projects.find((project) => project.projectId === assigningVisit.projectId) : undefined;
  const visitsByDate = useMemo(() => {
    const grouped = new Map<string, FieldOperationsVisit[]>();
    for (const visit of activeVisits.filter((visit) => !projectId || visit.projectId === projectId)) {
      const dayVisits = grouped.get(visit.visitDate) ?? [];
      dayVisits.push(visit);
      grouped.set(visit.visitDate, dayVisits);
    }
    return grouped;
  }, [activeVisits, projectId]);

  async function changeWeek(nextWeekStart: string) {
    const sequence = ++loadSequence.current;
    setWeekStart(nextWeekStart);
    setAssigningVisitId(null);
    setSelectedDate(nextWeekStart);
    setAvailabilityDate(nextWeekStart);
    setCapacityAvailable(false);
    setVisits([]);
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/field-operations?startDate=${nextWeekStart}&endDate=${shiftDate(nextWeekStart, 6)}`);
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error ?? "Unable to load field schedule");
      if (sequence !== loadSequence.current) return;
      setVisits(result.visits as FieldOperationsVisit[]);
      setCapacityAvailable(true);
    } catch (loadError) {
      if (sequence === loadSequence.current) setError(loadError instanceof Error ? loadError.message : "Unable to load field schedule");
    } finally {
      if (sequence === loadSequence.current) setIsLoading(false);
    }
  }

  const refreshSchedule = useCallback(async () => {
    const sequence = ++loadSequence.current;
    setCapacityAvailable(false);
    try {
      const response = await fetch(`/api/field-operations?startDate=${weekStart}&endDate=${weekEnd}`);
      const result = await response.json().catch(() => null);
      if (sequence !== loadSequence.current) return;
      if (!response.ok) throw new Error(result?.error ?? "Unable to refresh field schedule");
      setVisits(result.visits as FieldOperationsVisit[]);
      setCapacityAvailable(true);
      setError(null);
    } catch (loadError) {
      if (sequence === loadSequence.current) throw loadError;
    } finally {
      if (sequence === loadSequence.current) setIsLoading(false);
    }
  }, [weekStart, weekEnd]);

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      void refreshSchedule().catch((error: unknown) => {
        setCapacityAvailable(false);
        setError(error instanceof Error ? error.message : "Unable to refresh the schedule");
      });
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    const timer = window.setInterval(refresh, 30_000);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
      window.clearInterval(timer);
    };
  }, [refreshSchedule]);

  useEffect(() => () => { ++loadSequence.current; }, []);

  async function runAction(action: Record<string, unknown>) {
    if (!canEdit) throw new Error("You do not have permission to change the schedule.");
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
      setAvailabilityDate(selectedDate);
    } catch (scheduleError) {
      setError(scheduleError instanceof Error ? scheduleError.message : "Unable to schedule job");
    } finally {
      setIsScheduling(false);
    }
  }

  async function moveVisit(serviceVisitId: number, visitDate: string) {
    await runAction({ action: "move-visit", serviceVisitId, visitDate });
    setAvailabilityDate(visitDate);
  }

  async function dropJob(event: DragEvent<HTMLElement>, visitDate: string) {
    event.preventDefault();
    if (!canEdit) return;
    try {
      const payload: unknown = JSON.parse(event.dataTransfer.getData("application/json"));
      if (typeof payload !== "object" || payload === null || !("kind" in payload)) return;
      if (payload.kind === "visit" && "serviceVisitId" in payload) {
        await moveVisit(Number(payload.serviceVisitId), visitDate);
      } else if (payload.kind === "project" && "projectId" in payload) {
        await runAction({ action: "schedule-project", projectId: Number(payload.projectId), visitDate });
        setAvailabilityDate(visitDate);
      }
    } catch (dropError) {
      setError(dropError instanceof Error ? dropError.message : "Unable to schedule dropped job");
    }
  }

  const rangeLabel = `${dateLabel(weekStart, { month: "short", day: "numeric" })} – ${dateLabel(weekEnd, { month: "short", day: "numeric", year: "numeric" })}`;

  return (
    <section className={`fieldOperationsWorkspace ${styles.workspace}`}>
      <header className="fieldOperationsHeader">
        <div>
          <p className="salesEyebrow">FIELD OPERATIONS</p>
          <h1>{projectId ? "Project schedule" : "Weekly field planner"}</h1>
          <p>Jobs at a glance. Open assignments for crew, equipment, and task details.</p>
          {projectId && <p>This board shows only this project. Availability includes all Active jobs in your organization. <Link href="/field-operations">Open company field planner</Link></p>}
        </div>
        <div className={styles.actions}>
          <button type="button" className="financeImportButton" aria-expanded={showScheduling} aria-controls="fieldSchedulingPanel"
            disabled={!canEdit} onClick={() => { if (!showScheduling) setSelectedDate(availabilityDate); setShowScheduling((current) => !current); }}>
            <Plus size={15} aria-hidden="true" /> Schedule job
          </button>
          <button type="button" className="projectWorkspaceLink" aria-haspopup="dialog"
            onClick={() => setShowAvailability((current) => !current)}>Availability</button>
        </div>
      </header>

      <div className={styles.toolbar}>
        <div className="fieldWeekNavigation" aria-label="Choose week">
          <button type="button" aria-label="Previous week" disabled={isLoading} onClick={() => void changeWeek(shiftDate(weekStart, -7))}><ChevronLeft size={18} /></button>
          <strong>{rangeLabel}</strong>
          <button type="button" aria-label="Next week" disabled={isLoading} onClick={() => void changeWeek(shiftDate(weekStart, 7))}><ChevronRight size={18} /></button>
          <button type="button" disabled={isLoading} onClick={() => void changeWeek(getCurrentWeekRange(new Date()).startDate)}>This week</button>
        </div>
        <label className={styles.viewPicker}>View
          <select aria-label="Schedule view" value={boardView} onChange={(event) => {
            const value = event.target.value;
            if (value === "responsive" || value === "week" || value === "day") setBoardView(value);
          }}>
            <option value="responsive">Auto (day on small screens)</option>
            <option value="week">Week</option>
            <option value="day">Day</option>
          </select>
        </label>
      </div>
      <p className={styles.saveNotice}>Changes save immediately. Only Active jobs are shown.</p>
      {activeProjects.some((project) => project.engagementType === "Service" && (!project.expectedStartDate || !project.expectedEndDate || !project.recurrenceFrequency)) && (
        <p className="fieldOperationsError" role="alert">Some recurring jobs are missing a start date, end date, or frequency. Manual scheduling is available, but automatic scheduling requires all recurrence details.</p>
      )}
      {!capacityAvailable && <p className="fieldScheduleLoading" role="status">{isLoading ? "Loading availability…" : "Availability unavailable until the schedule refreshes successfully."}</p>}
      {capacityAvailable && overbookedResources > 0 && <p className={styles.warning} role="status">
        {overbookedResources} {overbookedResources === 1 ? "resource is" : "resources are"} over daily or weekly capacity across Active jobs.{" "}
        <button type="button" className="fieldAvailabilityToggle" aria-haspopup="dialog" onClick={() => setShowAvailability(true)}>Review availability</button>
      </p>}

      <div id="fieldSchedulingPanel" hidden={!showScheduling}>
      <fieldset className="fieldJobPicker" disabled={!canEdit || isLoading}>
        <div>
          <div className="fieldJobPickerHeader">
            <h2>Jobs to schedule</h2>
            <button type="button" className="fieldSchedulingToggle"
              aria-pressed={schedulingMode === "select"} aria-controls="fieldSchedulingControls"
              disabled={isScheduling}
              onClick={() => {
                setSchedulingMode((current) => current === "drag" ? "select" : "drag");
                if (schedulingMode === "select") setBoardView("week");
              }}>
              {schedulingMode === "drag" ? "Use job/date selectors" : "Use drag & drop"}
            </button>
          </div>
          <p>Set a job to Active in Project Management to make it available here. Estimated labor sums approved estimate lines marked Labor and measured in HR.</p>
          <div id="fieldSchedulingControls">
          {schedulingMode === "drag" ? <div className="fieldJobPool">
            {activeProjects.map((project) => (
              <button
                className="fieldJobChip"
                key={project.projectId}
                type="button"
                draggable
                onDragStart={(event) => startDrag(event, { kind: "project", projectId: project.projectId })}
                title="Choose this job or drag it onto a date to schedule it"
                onClick={() => { setSelectedProjectId(String(project.projectId)); setSchedulingMode("select"); }}
              >
                <strong>{project.projectName}</strong>
                <span>{project.engagementType === "Service" ? "Recurring" : "Project"} · {project.projectStatus}</span>
                <small>{getEstimatedLaborHours(project.lines).toLocaleString()} estimated labor hrs</small>
              </button>
            ))}
            {activeProjects.length === 0 && <p className="fieldResourceEmpty">No Active jobs. Activate a job in Project Management to schedule it.</p>}
          </div> : <div className="fieldJobSchedule">
          <h3>Schedule by selection</h3>
          <form onSubmit={(event) => void scheduleProject(event)}>
            <label>
              Job
              <select aria-label="Job to schedule" required value={selectedProjectId} onChange={(event) => setSelectedProjectId(event.target.value)}>
                <option value="">Choose a project or recurring job</option>
                {activeProjects.map((project) => (
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
            <button type="submit" disabled={!selectedProjectId || isScheduling || activeProjects.length === 0}>
              <Plus size={16} /> Schedule
            </button>
          </form>
          {activeProjects.length === 0 && <p className="fieldResourceEmpty">No Active jobs. Activate a job in Project Management to schedule it.</p>}
        </div>}
          </div>
        </div>
      </fieldset>
      </div>

      {error && <p className="fieldOperationsError" role="alert">{error}</p>}
      {isLoading && <p className="fieldScheduleLoading" role="status">Loading this week&apos;s schedule…</p>}

      <div className={`${styles.dayNavigation} ${boardView === "responsive" ? styles.autoDayNavigation : ""}`} hidden={boardView === "week"} aria-label="Choose schedule day">
        {dates.map((date) => {
          const jobCount = visitsByDate.get(date)?.length ?? 0;
          return <button type="button" key={date} aria-pressed={availabilityDate === date}
            onClick={() => setAvailabilityDate(date)}>
            {dateLabel(date, { weekday: "short" })}<span>{dateLabel(date, { month: "short", day: "numeric" })}</span>
            <small>{jobCount} {jobCount === 1 ? "job" : "jobs"}</small>
          </button>;
        })}
      </div>
      <p className={`${styles.dayHint} ${boardView === "responsive" ? styles.autoDayNavigation : ""}`} hidden={boardView === "week"}>
        Showing {dateLabel(availabilityDate, { weekday: "long", month: "short", day: "numeric" })}. Choose another day above or switch to Week to see all dates.
      </p>
      <div className={`fieldWeekBoard ${styles.board}`} data-view={boardView} aria-label="Job schedule">
        {dates.map((date) => {
          const dayVisits = visitsByDate.get(date) ?? [];
          const plannedHours = dayVisits.reduce((total, visit) => total + visitLaborHours(visit), 0);
          return (
          <section
            className={`fieldDayColumn${availabilityDate === date ? " fieldDaySelected" : ""}`}
            data-selected={availabilityDate === date}
            key={date}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => void dropJob(event, date)}
          >
            <header className="fieldDayHeader">
              <button type="button" className="fieldDaySelect" aria-pressed={availabilityDate === date} onClick={() => setAvailabilityDate(date)}>{dateLabel(date, { weekday: "long" })}</button>
              <span>{dateLabel(date, { month: "short", day: "numeric" })} · {plannedHours.toLocaleString()} assigned labor-hrs</span>
            </header>
            {dayVisits.length === 0 ? (
              <div className="fieldDayEmpty">No scheduled jobs</div>
            ) : (
              dayVisits.map((visit) => {
                const project = projects.find((item) => item.projectId === visit.projectId);
                if (!project || project.projectStatus !== "Active") return null;
                const visitPlannedHours = visitLaborHours(visit);
                const assignments = visit.tasks.flatMap((task) => task.assignments);
                const crewCount = new Set(assignments.filter((item) => item.employeeId !== null).map((item) => item.employeeId)).size;
                const equipmentCount = new Set(assignments.filter((item) => item.equipmentId !== null).map((item) => item.equipmentId)).size;
                const tasksOverEstimate = visit.tasks.filter((task) => task.remainingHours < 0).length;
                return (
                  <article className="fieldScheduledJob" key={visit.serviceVisitId}>
                    <header>
                      <div className="fieldScheduledJobHeader">
                        <strong
                          draggable={canEdit}
                          onDragStart={(event) => startDrag(event, { kind: "visit", serviceVisitId: visit.serviceVisitId })}
                          title={canEdit ? "Drag this occurrence onto another day in this week" : undefined}
                        >{project.projectName}</strong>
                      </div>
                      <span>{project.engagementType === "Service" ? `${frequencyLabel(project) ?? "Recurring"} service` : "Project"} · {visitPlannedHours.toLocaleString()} assigned labor-hrs</span>
                    </header>
                    <p className={styles.crewSummary}>Crew: {crewCount} · Equipment: {equipmentCount}</p>
                    {tasksOverEstimate > 0 && <p className={styles.warning}>{tasksOverEstimate} {tasksOverEstimate === 1 ? "task" : "tasks"} over the labor estimate</p>}
                    <div className={styles.visitActions}>
                      <button type="button" className="fieldAssignOpenButton" disabled={!canEdit || !capacityAvailable || isLoading} onClick={() => setAssigningVisitId(visit.serviceVisitId)}
                        aria-label={`Assign crew and equipment for ${project.projectName} on ${dateLabel(date)}`}>
                        <UserRound size={14} aria-hidden="true" /> Assign crew &amp; equipment
                      </button>
                      {!projectId && <Link className="projectWorkspaceLink" href={`/projects/${project.projectId}`}>Open project</Link>}
                    </div>
                    <details className={styles.disclosure}>
                      <summary>Tasks ({visit.tasks.length})</summary>
                      <p className={styles.saveNotice}>{getEstimatedLaborHours(project.lines).toLocaleString()} estimated labor-hrs (whole job)</p>
                      <div className="fieldTasks">
                        {visit.tasks.length === 0 && <p className="fieldResourceEmpty">No tasks yet. Open assignments to add one.</p>}
                        {visit.tasks.map((task) => {
                          const over = task.remainingHours < 0;
                          return (
                            <div className="fieldTaskSummary" key={task.taskId}>
                              <div className={`fieldTaskSummaryLine${over ? " fieldTaskSummaryOver" : ""}`}>
                                <strong>{task.taskName}</strong>
                                <span title={task.sharedAcrossVisits ? "Estimated hours left across every visit of this job" : "Estimated hours left on this visit"}>
                                  {over ? `${(-task.remainingHours).toLocaleString()}h over` : `${task.remainingHours.toLocaleString()}h left`}
                                </span>
                              </div>
                              {task.assignments.length > 0 && <div className="fieldTaskSummaryChips">
                                {task.assignments.map((assignment) => (
                                  <span key={assignment.assignmentId} className={assignment.employeeId === null ? "fieldEquipmentChip" : undefined}>
                                    {assignment.employeeName ?? assignment.equipmentName ?? "Unknown"} {assignment.hours.toLocaleString()}h
                                  </span>
                                ))}
                              </div>}
                            </div>
                          );
                        })}
                      </div>
                    </details>
                    {canEdit && <details className={styles.disclosure}>
                      <summary>Move / remove visit</summary>
                      <p className={styles.saveNotice}>Affects only this occurrence, not future dates.</p>
                      <label className="fieldVisitMove">
                        Move visit to
                        <select
                          aria-label={`Move ${project.projectName} occurrence from ${dateLabel(date)}`}
                          disabled={isLoading}
                          value={visit.visitDate}
                          onChange={(event) => void moveVisit(visit.serviceVisitId, event.target.value).catch((actionError: unknown) => setError(actionError instanceof Error ? actionError.message : "Unable to move visit"))}
                        >
                          {dates.map((day) => <option key={day} value={day}>{dateLabel(day)}</option>)}
                        </select>
                      </label>
                      <button type="button" className={styles.removeVisit} disabled={isLoading}
                        aria-label={`Remove ${project.projectName} from ${dateLabel(date)}`}
                        onClick={() => void runAction({ action: "unschedule-visit", serviceVisitId: visit.serviceVisitId }).catch((actionError: unknown) => setError(actionError instanceof Error ? actionError.message : "Unable to remove visit"))}>
                        Remove visit
                      </button>
                    </details>}
                  </article>
                );
              })
            )}
          </section>
        );
      })}
      </div>

      {showAvailability && <Modal titleId="fieldAvailabilityTitle" title="Weekly availability" eyebrow="FIELD OPERATIONS"
        onClose={() => setShowAvailability(false)} closeLabel="Close availability" className={styles.availabilityDialog}>
        <p className={styles.saveNotice}>8h/day · 40h/week · Planned capacity, not recorded time. Includes all Active jobs in your organization.</p>
        {!capacityAvailable && <p className="fieldScheduleLoading" role="status">Availability unavailable until the schedule refreshes successfully.</p>}
        <div className="fieldSegmentedToggle" role="group" aria-label="Availability resource type">
          {(["employee", "equipment"] as const).map((kind) => (
            <button key={kind} type="button" aria-pressed={availabilityKind === kind} onClick={() => setAvailabilityKind(kind)}>
              {kind === "employee" ? "Employees" : "Equipment"}
            </button>
          ))}
        </div>
        <AvailabilityTable
          id="fieldWeeklyAvailability"
          label={availabilityKind === "employee" ? "Employee" : "Equipment"}
          resources={availabilityKind === "employee"
            ? employees.map((employee) => ({ id: Number(employee.id), name: employee.name }))
            : equipment.map((item) => ({ id: item.equipmentId, name: item.equipmentName }))}
          capacity={availabilityKind === "employee" ? capacity : equipmentCapacity}
          dates={dates}
          selectedDate={availabilityDate}
          onSelectDate={setAvailabilityDate}
          capacityAvailable={capacityAvailable}
        />
      </Modal>}

      <details className={`${styles.disclosure} ${styles.help}`}>
        <summary>How scheduling works</summary>
        <p>Active recurring jobs are scheduled from their start date and frequency through their expected end date. Set a job to Active in Project Management to make it available here.</p>
        <p>Choose Schedule job to add work by job and date, or switch to drag &amp; drop. In Week view, drag a scheduled job&apos;s title to another day. Move / remove visit also lets you change dates without dragging. Moving or removing a visit affects only that occurrence, not future dates.</p>
        <p>Use Assign crew &amp; equipment for tasks and resource hours. Overbooking is flagged, not blocked. Estimated labor sums approved estimate lines marked Labor and measured in HR. Availability covers all Active jobs in your organization, even in a single-project schedule.</p>
        <p>Changes save immediately. Other open planners refresh every 30 seconds while visible, or when brought back into focus.</p>
      </details>

      {assigningVisit && (
        <TaskAssignmentModal
          visit={assigningVisit}
          projectName={assigningProject?.projectName ?? "Job"}
          dateText={dateLabel(assigningVisit.visitDate, { weekday: "long", month: "short", day: "numeric" })}
          employees={employees}
          roleNames={roleNames}
          equipment={equipment}
          employeeCapacity={capacity}
          equipmentCapacity={equipmentCapacity}
          onAction={runAction}
          onClose={closeAssignment}
        />
      )}
    </section>
  );
}

function AvailabilityTable({
  id,
  label,
  resources,
  capacity,
  dates,
  selectedDate,
  onSelectDate,
  capacityAvailable,
}: {
  id: string;
  label: string;
  resources: Array<{ id: number; name: string }>;
  capacity: Map<number, Map<string, number>>;
  dates: string[];
  selectedDate: string;
  onSelectDate: (date: string) => void;
  capacityAvailable: boolean;
}) {
  return (
    <div id={id} className="fieldCapacityTableWrapper" role="region" aria-label={`Weekly ${label.toLowerCase()} availability`} tabIndex={0}>
      <table className="fieldCapacityTable">
        <caption>Planned availability · Monday–Friday capacity; weekend work counts toward the weekly total</caption>
        <thead><tr><th scope="col">{label}</th>{dates.map((date) => <th scope="col" key={date} className={selectedDate === date ? "fieldCapacitySelected" : ""}>
          <button type="button" aria-pressed={selectedDate === date} onClick={() => onSelectDate(date)}>{dateLabel(date)}</button>
        </th>)}<th scope="col">Week remaining</th></tr></thead>
        <tbody>{resources.map((resource) => {
          const days = capacity.get(resource.id);
          const total = dates.reduce((sum, date) => sum + (days?.get(date) ?? 0), 0);
          return <tr key={resource.id}><th scope="row">{resource.name}</th>{dates.map((date, index) => {
            const hours = days?.get(date) ?? 0;
            return <td key={date} className={`${selectedDate === date ? "fieldCapacitySelected " : ""}${index >= 5 ? "fieldCapacityWeekend" : hours > DAILY_CAPACITY ? "fieldCapacityOver" : hours === DAILY_CAPACITY ? "fieldCapacityFull" : ""}`}>
              {capacityAvailable ? dayCapacityLabel(hours, date) : "Unavailable"}
              {index < 5 && capacityAvailable && <div className="fieldCapacityBar" title={`${hours.toLocaleString()} / ${DAILY_CAPACITY}h assigned`}><span style={{ width: `${Math.min(hours / DAILY_CAPACITY * 100, 100)}%` }} /></div>}
            </td>;
          })}<td className={total > WEEKLY_CAPACITY ? "fieldCapacityOver" : ""}>
            <strong>{capacityAvailable ? capacityLabel(total, WEEKLY_CAPACITY) : "Unavailable"}</strong>
            {capacityAvailable && <small>{total.toLocaleString()} / {WEEKLY_CAPACITY}h assigned</small>}
          </td></tr>;
        })}{resources.length === 0 && <tr><td colSpan={9}>No {label.toLowerCase()} available.</td></tr>}</tbody>
      </table>
      <p className="fieldTaskCapacityHint">Bars show assigned hours / 8h. Daily overages remain visible even when weekly capacity remains.</p>
    </div>
  );
}

// function AddTaskForm({ visit, onAction }: { visit: FieldOperationsVisit; onAction: (action: Record<string, unknown>) => Promise<void> }) {
//   const [taskName, setTaskName] = useState("");
//   const [plannedLaborHours, setPlannedLaborHours] = useState("0");
//   const [error, setError] = useState<string | null>(null);
//   const [busy, setBusy] = useState(false);
//   async function submit(event: FormEvent<HTMLFormElement>) {
//     event.preventDefault();
//     setBusy(true);
//     setError(null);
//     try {
//       await onAction({ action: "add-task", serviceVisitId: visit.serviceVisitId, taskName, plannedLaborHours: Number(plannedLaborHours) });
//       setTaskName("");
//       setPlannedLaborHours("0");
//     } catch (actionError) {
//       setError(actionError instanceof Error ? actionError.message : "Unable to add task");
//     } finally {
//       setBusy(false);
//     }
//   }
//   return (
//     <form className="fieldAddTask" onSubmit={(event) => void submit(event)}>
//       <label>
//         Add task
//         <input aria-label="New task name" placeholder="Task name" maxLength={150} value={taskName} required onChange={(event) => setTaskName(event.target.value)} />
//       </label>
//       <label>
//         Planned hrs
//         <input aria-label="New task planned hours" type="number" min="0" max="100000" step="0.25" value={plannedLaborHours} onChange={(event) => setPlannedLaborHours(event.target.value)} />
//       </label>
//       <button type="submit" disabled={busy}><Plus size={14} /> Add</button>
//       {error && <span className="fieldOperationsError" role="alert">{error}</span>}
//     </form>
//   );
// }
