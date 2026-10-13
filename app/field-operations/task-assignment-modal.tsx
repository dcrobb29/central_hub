"use client";

import { useState, type DragEvent, type FormEvent, type KeyboardEvent } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import Modal from "@/app/components/modal";
import type { FieldOperationsAssignment, FieldOperationsEquipment, FieldOperationsTask, FieldOperationsVisit } from "@/app/lib/field-operations";
import type { Person } from "@/app/lib/personnel";
import {
  DAILY_CAPACITY,
  DAILY_LOCK_HOURS,
  fullJobHours,
  type AssignmentHoursMode,
  type ResourceKind,
} from "@/app/lib/field-capacity";

type ModalDragPayload =
  | { kind: "modal-resource"; resourceType: ResourceKind; resourceId: number }
  | { kind: "modal-assignment"; assignmentId: number; taskId: number };

type PoolResource = { kind: ResourceKind; id: number; name: string; detail: string };

const MODE_LABELS: Array<[AssignmentHoursMode, string]> = [
  ["FullDay", "Full Day"],
  ["HalfDay", "Half Day"],
  ["FullJob", "Full Job"],
  ["Split", "Split Evenly"],
  ["Custom", "Custom"],
];

const hoursText = (hours: number) => `${hours.toLocaleString(undefined, { maximumFractionDigits: 2 })}h`;

function readPayload(event: DragEvent<HTMLElement>): ModalDragPayload | null {
  try {
    const payload: unknown = JSON.parse(event.dataTransfer.getData("application/json"));
    if (typeof payload !== "object" || payload === null || !("kind" in payload)) return null;
    return payload.kind === "modal-resource" || payload.kind === "modal-assignment" ? payload as ModalDragPayload : null;
  } catch {
    return null;
  }
}

function resourceOf(assignment: FieldOperationsAssignment): { kind: ResourceKind; id: number; name: string } {
  return assignment.employeeId !== null
    ? { kind: "employee", id: assignment.employeeId, name: assignment.employeeName ?? "Unknown employee" }
    : { kind: "equipment", id: assignment.equipmentId ?? 0, name: assignment.equipmentName ?? "Unknown equipment" };
}

export default function TaskAssignmentModal({
  visit,
  projectName,
  dateText,
  employees,
  roleNames,
  equipment,
  employeeCapacity,
  equipmentCapacity,
  onAction,
  onClose,
}: {
  visit: FieldOperationsVisit;
  projectName: string;
  dateText: string;
  employees: Person[];
  roleNames: Record<string, string>;
  equipment: FieldOperationsEquipment[];
  employeeCapacity: Map<number, Map<string, number>>;
  equipmentCapacity: Map<number, Map<string, number>>;
  onAction: (action: Record<string, unknown>) => Promise<void>;
  onClose: () => void;
}) {
  const [poolKind, setPoolKind] = useState<ResourceKind>("employee");
  const [selected, setSelected] = useState<PoolResource | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragTaskId, setDragTaskId] = useState<number | null>(null);
  const [addingTask, setAddingTask] = useState(false);

  const dayHours = (kind: ResourceKind, id: number) =>
    (kind === "employee" ? employeeCapacity : equipmentCapacity).get(id)?.get(visit.visitDate) ?? 0;

  const pool: PoolResource[] = poolKind === "employee"
    ? employees.map((employee) => ({ kind: "employee", id: Number(employee.id), name: employee.name, detail: roleNames[employee.roleId] ?? "Employee" }))
    : equipment.map((item) => ({ kind: "equipment", id: item.equipmentId, name: item.equipmentName, detail: [item.equipmentType, item.assetTag].filter(Boolean).join(" · ") || "Equipment" }));

  async function run(action: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      await onAction(action);
      return true;
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Unable to update assignments");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function addResource(task: FieldOperationsTask, resource: { kind: ResourceKind; id: number }) {
    const alreadyAssigned = task.assignments.some((assignment) =>
      resource.kind === "employee" ? assignment.employeeId === resource.id : assignment.equipmentId === resource.id);
    if (alreadyAssigned) {
      setError("That resource is already assigned to this task");
      return;
    }
    if (dayHours(resource.kind, resource.id) >= DAILY_LOCK_HOURS) {
      setError(`That resource already has ${DAILY_LOCK_HOURS}h or more booked on this day`);
      return;
    }
    if (await run({ action: "assign-resource", taskId: task.taskId, resourceType: resource.kind, resourceId: resource.id })) setSelected(null);
  }

  function dropOnTask(event: DragEvent<HTMLElement>, task: FieldOperationsTask) {
    event.preventDefault();
    setDragTaskId(null);
    if (busy) return;
    const payload = readPayload(event);
    if (payload?.kind === "modal-resource") void addResource(task, { kind: payload.resourceType, id: payload.resourceId });
    else if (payload?.kind === "modal-assignment" && payload.taskId !== task.taskId) {
      void run({ action: "move-assignment", assignmentId: payload.assignmentId, taskId: task.taskId });
    }
  }

  return (
    <Modal
      titleId="fieldAssignModalTitle"
      eyebrow="ASSIGN CREW & EQUIPMENT"
      title={`${projectName} — ${dateText}`}
      onClose={onClose}
      className="fieldAssignModal"
    >
      <p className="fieldAssignIntro">Drag people or equipment into a task, or select one and choose “Add here”. Changes save immediately.</p>
      {error && <p className="fieldOperationsError" role="alert">{error}</p>}
      <div className="fieldAssignLayout" aria-busy={busy}>
        <aside className="fieldAssignPool">
          <div className="fieldSegmentedToggle" role="group" aria-label="Resource type">
            {(["employee", "equipment"] as const).map((kind) => (
              <button key={kind} type="button" aria-pressed={poolKind === kind} onClick={() => { setPoolKind(kind); setSelected(null); }}>
                {kind === "employee" ? "Employees" : "Equipment"}
              </button>
            ))}
          </div>
          <p className="fieldTaskCapacityHint">Hours already booked on this day. {DAILY_LOCK_HOURS}h or more is locked.</p>
          <div className="fieldAssignPoolList">
            {pool.map((resource) => {
              const hours = dayHours(resource.kind, resource.id);
              const locked = hours >= DAILY_LOCK_HOURS;
              const isSelected = selected?.kind === resource.kind && selected.id === resource.id;
              return (
                <button
                  key={`${resource.kind}-${resource.id}`}
                  type="button"
                  className={`fieldAssignResource${resource.kind === "equipment" ? " fieldAssignResourceEquipment" : ""}${hours > DAILY_CAPACITY && !locked ? " fieldAssignResourceWarn" : ""}`}
                  draggable={!locked && !busy}
                  disabled={locked}
                  aria-pressed={isSelected}
                  title={locked ? `Booked ${hoursText(hours)} on this day` : "Drag into a task, or select and choose “Add here”"}
                  onClick={() => setSelected(isSelected ? null : resource)}
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = "copy";
                    event.dataTransfer.setData("application/json", JSON.stringify({ kind: "modal-resource", resourceType: resource.kind, resourceId: resource.id } satisfies ModalDragPayload));
                  }}
                >
                  <span><strong>{resource.name}</strong><small>{resource.detail}</small></span>
                  <em>{hoursText(hours)}/{DAILY_CAPACITY}h</em>
                </button>
              );
            })}
            {pool.length === 0 && <p className="fieldResourceEmpty">{poolKind === "employee" ? "No employees are in the organization chart yet." : "No equipment has been added yet."}</p>}
          </div>
        </aside>

        <div className="fieldAssignTasks">
          {visit.tasks.map((task) => (
            <TaskZone
              key={task.taskId}
              task={task}
              busy={busy}
              selected={selected}
              isDragTarget={dragTaskId === task.taskId}
              dayHours={dayHours}
              onDragOver={(event) => { event.preventDefault(); setDragTaskId(task.taskId); }}
              onDragLeave={() => setDragTaskId((current) => current === task.taskId ? null : current)}
              onDrop={(event) => dropOnTask(event, task)}
              onAddSelected={() => { if (selected) void addResource(task, selected); }}
              run={run}
            />
          ))}
          {visit.tasks.length === 0 && <p className="fieldResourceEmpty">This visit has no tasks yet. Add one below.</p>}
          {addingTask
            ? <TaskForm submitLabel="Add task" busy={busy} onCancel={() => setAddingTask(false)}
              onSubmit={async (taskName, plannedLaborHours) => {
                if (await run({ action: "add-task", serviceVisitId: visit.serviceVisitId, taskName, plannedLaborHours })) setAddingTask(false);
              }} />
            : <button type="button" className="fieldAddTaskButton" disabled={busy} onClick={() => setAddingTask(true)}><Plus size={14} /> Add task</button>}
          <p className="fieldTaskCapacityHint">
            Full Day = 8h · Half Day = 4h · Full Job takes the task&apos;s remaining hours (only when 8h or less remain) · Split Evenly shares the remaining hours and recalculates as people are added or removed · Custom lets you enter hours.
            Red marks a task over its estimate or a resource over 8h on this day; it is allowed but flagged. Equipment hours are tracked separately and don&apos;t use up labor hours.
          </p>
        </div>
      </div>
    </Modal>
  );
}

function TaskZone({
  task,
  busy,
  selected,
  isDragTarget,
  dayHours,
  onDragOver,
  onDragLeave,
  onDrop,
  onAddSelected,
  run,
}: {
  task: FieldOperationsTask;
  busy: boolean;
  selected: PoolResource | null;
  isDragTarget: boolean;
  dayHours: (kind: ResourceKind, id: number) => number;
  onDragOver: (event: DragEvent<HTMLElement>) => void;
  onDragLeave: () => void;
  onDrop: (event: DragEvent<HTMLElement>) => void;
  onAddSelected: () => void;
  run: (action: Record<string, unknown>) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const over = task.remainingHours < 0;
  const scope = task.sharedAcrossVisits ? "all visits" : "this visit";
  return (
    <section
      className={`fieldAssignZone${isDragTarget ? " fieldAssignZoneTarget" : ""}${over ? " fieldAssignZoneOver" : ""}`}
      aria-label={`Task ${task.taskName}`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {editing ? (
        <TaskForm submitLabel="Save" busy={busy} initialName={task.taskName} initialHours={task.plannedLaborHours}
          onCancel={() => setEditing(false)}
          onSubmit={async (taskName, plannedLaborHours) => {
            if (await run({ action: "update-task", taskId: task.taskId, taskName, plannedLaborHours })) setEditing(false);
          }} />
      ) : (
        <header className="fieldAssignZoneHeader">
          <h3>{task.taskName}{task.estimateLineItemId !== null && <small>From estimate</small>}</h3>
          <span className="fieldAssignRemaining">
            {hoursText(task.plannedLaborHours)} estimated · {over ? `${hoursText(-task.remainingHours)} over` : `${hoursText(task.remainingHours)} left`} ({scope})
          </span>
          {task.estimateLineItemId === null && <span className="fieldAssignZoneActions">
            <button type="button" className="fieldIconButton" disabled={busy} aria-label={`Edit ${task.taskName}`} title="Rename or change hours" onClick={() => setEditing(true)}><Pencil size={13} /></button>
            <button type="button" className="fieldIconButton fieldRemoveButton" disabled={busy} aria-label={`Remove ${task.taskName}`} title="Remove task"
              onClick={() => void run({ action: "delete-task", taskId: task.taskId })}><Trash2 size={13} /></button>
          </span>}
        </header>
      )}
      {task.assignments.map((assignment) => (
        <AssigneeRow key={`${assignment.assignmentId}:${assignment.hoursMode}:${assignment.customHours}`} task={task} assignment={assignment} busy={busy}
          overDay={dayHours(resourceOf(assignment).kind, resourceOf(assignment).id) > DAILY_CAPACITY} run={run} />
      ))}
      {task.assignments.length === 0 && <p className="fieldAssignEmpty">Drop employees or equipment here</p>}
      {selected && (
        <button type="button" className="fieldAssignAddHere" disabled={busy} onClick={onAddSelected}>
          <Plus size={13} /> Add {selected.name} here
        </button>
      )}
    </section>
  );
}

function AssigneeRow({
  task,
  assignment,
  busy,
  overDay,
  run,
}: {
  task: FieldOperationsTask;
  assignment: FieldOperationsAssignment;
  busy: boolean;
  overDay: boolean;
  run: (action: Record<string, unknown>) => Promise<boolean>;
}) {
  const resource = resourceOf(assignment);
  const activeMode: AssignmentHoursMode = assignment.hoursMode ?? "Custom";
  const [customDraft, setCustomDraft] = useState(String(assignment.customHours ?? assignment.hours));
  const remaining = resource.kind === "employee" ? task.remainingHours : task.equipmentRemainingHours;
  const fullJobTooLarge = activeMode !== "FullJob" && fullJobHours(remaining, assignment.hours) > DAILY_CAPACITY;

  function setMode(mode: AssignmentHoursMode) {
    if (mode === activeMode && mode !== "Custom") return;
    const customHours = mode === "Custom" ? Math.min(24, Math.max(0, assignment.hours)) : null;
    if (mode === "Custom") setCustomDraft(String(customHours));
    void run({ action: "set-assignment-hours", assignmentId: assignment.assignmentId, hoursMode: mode, customHours });
  }

  function commitCustom() {
    const value = Number(customDraft);
    if (customDraft.trim() === "" || !Number.isFinite(value)) {
      setCustomDraft(String(assignment.customHours ?? assignment.hours));
      return;
    }
    if (assignment.hoursMode === "Custom" && value === assignment.customHours) return;
    void run({ action: "set-assignment-hours", assignmentId: assignment.assignmentId, hoursMode: "Custom", customHours: value });
  }

  return (
    <div
      className={`fieldAssignee${overDay ? " fieldAssigneeOver" : ""}${resource.kind === "equipment" ? " fieldAssigneeEquipment" : ""}`}
      draggable={!busy}
      title="Drag to another task to move this assignment"
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("application/json", JSON.stringify({ kind: "modal-assignment", assignmentId: assignment.assignmentId, taskId: task.taskId } satisfies ModalDragPayload));
      }}
    >
      <span className="fieldAssigneeName" title={overDay ? "Over 8h on this day" : undefined}>
        {resource.name}{overDay && <span aria-label="Over 8 hours on this day"> ⚠</span>}
      </span>
      <div className="fieldAssigneeModes" role="group" aria-label={`Hours for ${resource.name}`}>
        {MODE_LABELS.map(([mode, label]) => (
          <button key={mode} type="button" aria-pressed={activeMode === mode} disabled={busy || (mode === "FullJob" && fullJobTooLarge)}
            title={mode === "FullJob" && fullJobTooLarge ? "More than 8h remain on this task" : undefined}
            onClick={() => setMode(mode)}>{label}</button>
        ))}
        {activeMode === "Custom" && (
          <input type="number" min="0" max="24" step="0.25" aria-label={`Custom hours for ${resource.name}`} value={customDraft} disabled={busy}
            onChange={(event) => setCustomDraft(event.target.value)}
            onBlur={commitCustom}
            onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => { if (event.key === "Enter") event.currentTarget.blur(); }} />
        )}
      </div>
      <strong className="fieldAssigneeHours">{hoursText(assignment.hours)}</strong>
      <button type="button" className="fieldAssigneeRemove" disabled={busy} aria-label={`Remove ${resource.name} from ${task.taskName}`}
        onClick={() => void run({ action: "remove-assignment", assignmentId: assignment.assignmentId })}>×</button>
    </div>
  );
}

function TaskForm({
  submitLabel,
  busy,
  initialName = "",
  initialHours = 0,
  onSubmit,
  onCancel,
}: {
  submitLabel: string;
  busy: boolean;
  initialName?: string;
  initialHours?: number;
  onSubmit: (taskName: string, plannedLaborHours: number) => Promise<void>;
  onCancel: () => void;
}) {
  const [taskName, setTaskName] = useState(initialName);
  const [hours, setHours] = useState(String(initialHours));
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void onSubmit(taskName.trim(), Number(hours));
  }
  return (
    <form className="fieldAssignTaskForm" onSubmit={submit}>
      <label>Task<input value={taskName} maxLength={150} required autoFocus onChange={(event) => setTaskName(event.target.value)} /></label>
      <label>Estimated hrs<input type="number" min="0" max="100000" step="0.25" value={hours} required onChange={(event) => setHours(event.target.value)} /></label>
      <button type="submit" disabled={busy}>{submitLabel}</button>
      <button type="button" disabled={busy} onClick={onCancel}>Cancel</button>
    </form>
  );
}
