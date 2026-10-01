"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { EmployeeHistoryEntry, Person, PersonnelRole } from "@/app/lib/personnel";
import PersonnelChart from "./personnel-chart";

type PersonnelState = { people: Person[]; roles: PersonnelRole[]; createdPersonId?: string };
type DialogMode = "person" | "role" | null;
type EmployeeHistoryState = {
  employeeId: string;
  entries?: EmployeeHistoryEntry[];
  error?: string;
};

function getToday() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
}

async function readResponse(response: Response): Promise<PersonnelState> {
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error ?? "Request failed");
  return body as PersonnelState;
}

export default function PersonnelWorkspace() {
  const [data, setData] = useState<PersonnelState>({ people: [], roles: [] });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogMode>(null);
  const [editingPerson, setEditingPerson] = useState<Person | null>(null);
  const [name, setName] = useState("");
  const [roleId, setRoleId] = useState("");
  const [relationType, setRelationType] = useState("none");
  const [relationPersonId, setRelationPersonId] = useState("");
  const [roleName, setRoleName] = useState("");
  const [historyState, setHistoryState] = useState<EmployeeHistoryState | null>(null);
  const [historyDate, setHistoryDate] = useState(getToday);
  const [historyNotes, setHistoryNotes] = useState("");
  const [historySaving, setHistorySaving] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/personnel")
      .then(readResponse)
      .then(setData)
      .catch((requestError: unknown) => {
        setError(requestError instanceof Error ? requestError.message : "Unable to load personnel");
      })
      .finally(() => setLoading(false));
  }, []);

  const selectedPerson = data.people.find((person) => person.id === selectedId) ?? null;
  const rolesById = new Map(data.roles.map((role) => [role.id, role.name]));
  const reports = selectedPerson
    ? data.people.filter((person) => person.managerId === selectedPerson.id)
    : [];

  useEffect(() => {
    if (!selectedId) return;
    const controller = new AbortController();
    fetch(`/api/personnel/history?employeeId=${encodeURIComponent(selectedId)}`, { signal: controller.signal })
      .then(async (response) => {
        const body = await response.json().catch(() => null);
        if (!response.ok) throw new Error(body?.error ?? "Unable to load employee history");
        return body as { entries: EmployeeHistoryEntry[] };
      })
      .then((body) => setHistoryState({ employeeId: selectedId, entries: body.entries }))
      .catch((requestError: unknown) => {
        if (requestError instanceof Error && requestError.name === "AbortError") return;
        setHistoryState({
          employeeId: selectedId,
          error: requestError instanceof Error ? requestError.message : "Unable to load employee history",
        });
      });
    return () => controller.abort();
  }, [selectedId]);

  function openPersonDialog(person?: Person) {
    setError(null);
    setEditingPerson(person ?? null);
    setName(person?.name ?? "");
    setRoleId(person?.roleId ?? data.roles[0]?.id ?? "");
    setRelationType("none");
    setRelationPersonId(person?.managerId ?? "");
    setDialog("person");
  }

  function closeDialog() {
    setDialog(null);
    setEditingPerson(null);
    setError(null);
  }

  async function submitRole(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/personnel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add-role", name: roleName }),
      });
      const nextData = await readResponse(response);
      setData(nextData);
      setRoleId(nextData.roles.find((role) => role.name.toLowerCase() === roleName.trim().toLowerCase())?.id ?? "");
      setRoleName("");
      closeDialog();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to add role");
    } finally {
      setSaving(false);
    }
  }

  async function submitPerson(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const response = editingPerson
        ? await fetch("/api/personnel", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id: editingPerson.id,
              name,
              roleId,
              managerId: relationPersonId || null,
            }),
          })
        : await fetch("/api/personnel", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "add-person",
              name,
              roleId,
              relationType,
              relationPersonId: relationType === "none" ? "" : relationPersonId,
            }),
          });
      const nextData = await readResponse(response);
      setData(nextData);
      if (!editingPerson) setSelectedId(nextData.createdPersonId ?? null);
      closeDialog();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to save person");
    } finally {
      setSaving(false);
    }
  }

  async function submitHistory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedPerson) return;
    setHistorySaving(true);
    setHistoryError(null);
    try {
      const response = await fetch("/api/personnel/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId: selectedPerson.id, eventDate: historyDate, notes: historyNotes }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? "Unable to save history");
      setHistoryState({ employeeId: selectedPerson.id, entries: body.entries as EmployeeHistoryEntry[] });
      setHistoryNotes("");
      setHistoryDate(getToday());
    } catch (requestError) {
      setHistoryError(requestError instanceof Error ? requestError.message : "Unable to save history");
    } finally {
      setHistorySaving(false);
    }
  }

  return (
    <section className="personnelWorkspace">
      <header className="personnelToolbar">
        <div>
          <p className="personnelEyebrow">PEOPLE & REPORTING</p>
          <h1>Organization</h1>
        </div>
        <div className="personnelActions">
          <button className="personnelButton personnelButtonSecondary" onClick={() => { setRoleName(""); setError(null); setDialog("role"); }}>
            Add role
          </button>
          <button className="personnelButton personnelButtonPrimary" onClick={() => openPersonDialog()} disabled={data.roles.length === 0}>
            Add person
          </button>
        </div>
      </header>

      <div className="personnelRoleBar">
        <span className="personnelRoleLabel">Roles</span>
        {data.roles.length === 0 ? (
          <span className="personnelMuted">No roles defined yet</span>
        ) : (
          data.roles.map((role, index) => (
            <span className={`personnelRoleTag personnelRoleTag${index % 5}`} key={role.id}>{role.name}</span>
          ))
        )}
      </div>

      {error && !dialog && <p className="personnelNotice personnelNoticeError">{error}</p>}
      {loading ? (
        <div className="personnelEmptyState">Loading people...</div>
      ) : data.people.length === 0 ? (
        <div className="personnelEmptyState">
          <div className="personnelEmptyMark">ORG</div>
          <h2>Start your organization chart</h2>
          <p>Define roles, then add people and connect reporting relationships when you’re ready.</p>
          <div className="personnelActions">
            <button className="personnelButton personnelButtonSecondary" onClick={() => { setRoleName(""); setError(null); setDialog("role"); }}>Create a role</button>
            <button className="personnelButton personnelButtonPrimary" onClick={() => openPersonDialog()} disabled={data.roles.length === 0}>Add a person</button>
          </div>
        </div>
      ) : (
        <div className="personnelMain">
          <PersonnelChart people={data.people} roles={data.roles} onSelectPerson={setSelectedId} />
          <aside className="personnelInspector">
            {selectedPerson ? (
              <>
                <div className="personnelInspectorTop">
                  <span className="personnelAvatar">{selectedPerson.name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("")}</span>
                  <div className="personnelInspectorActions">
                    <button className="personnelTextButton" onClick={() => openPersonDialog(selectedPerson)}>Edit</button>
                  </div>
                </div>
                <h2>{selectedPerson.name}</h2>
                <p className="personnelInspectorRole">{rolesById.get(selectedPerson.roleId) ?? "Role not set"}</p>
                <dl className="personnelFacts">
                  <div><dt>Reports to</dt><dd>{data.people.find((person) => person.id === selectedPerson.managerId)?.name ?? "No manager"}</dd></div>
                  <div><dt>Direct reports</dt><dd>{reports.length}</dd></div>
                </dl>
                {reports.length > 0 && (
                  <div className="personnelReportList">
                    <h3>Direct reports</h3>
                    {reports.map((person) => <button key={person.id} onClick={() => setSelectedId(person.id)}>{person.name}<span>{rolesById.get(person.roleId) ?? "Role not set"}</span></button>)}
                  </div>
                )}
                <section className="personnelHistorySection">
                  <h3>Employee history</h3>
                  {historyState?.employeeId !== selectedPerson.id ? (
                    <p className="personnelHistoryEmpty">Loading history...</p>
                  ) : historyState.error ? (
                    <p className="personnelHistoryError">{historyState.error}</p>
                  ) : historyState.entries?.length ? (
                    <ol className="personnelHistoryList">
                      {historyState.entries.map((entry) => (
                        <li key={entry.id}>
                          <time dateTime={entry.eventDate}>{new Date(`${entry.eventDate}T12:00:00`).toLocaleDateString()}</time>
                          <p>{entry.notes}</p>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="personnelHistoryEmpty">No history recorded.</p>
                  )}
                  <form className="personnelHistoryForm" onSubmit={submitHistory}>
                    <label className="personnelField">Event date<input type="date" value={historyDate} onChange={(event) => setHistoryDate(event.target.value)} required /></label>
                    <label className="personnelField">Note<textarea value={historyNotes} onChange={(event) => setHistoryNotes(event.target.value)} placeholder="Add an employee event" required maxLength={8000} rows={3} /></label>
                    {historyError && <p className="personnelHistoryError" role="alert">{historyError}</p>}
                    <button className="personnelButton personnelButtonPrimary" type="submit" disabled={historySaving}>{historySaving ? "Saving..." : "Add history"}</button>
                  </form>
                </section>
              </>
            ) : (
              <div className="personnelInspectorHint"><span>01</span><p>Select a person on the chart to view their reporting details.</p></div>
            )}
          </aside>
        </div>
      )}

      {dialog && (
        <div className="personnelModalBackdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeDialog(); }}>
          <section className="personnelModal" role="dialog" aria-modal="true" aria-labelledby="personnelModalTitle">
            <div className="personnelModalHeader">
              <div>
                <p className="personnelEyebrow">ORGANIZATION</p>
                <h2 id="personnelModalTitle">{dialog === "role" ? "Add a role" : editingPerson ? "Edit person" : "Add a person"}</h2>
              </div>
              <button className="personnelCloseButton" onClick={closeDialog} aria-label="Close dialog">×</button>
            </div>

            {dialog === "role" ? (
              <form onSubmit={submitRole}>
                <label className="personnelField">Role name<input autoFocus value={roleName} onChange={(event) => setRoleName(event.target.value)} placeholder="e.g. Operations Manager" required maxLength={80} /></label>
                {error && <p className="personnelNotice personnelNoticeError">{error}</p>}
                <div className="personnelModalActions"><button type="button" className="personnelButton personnelButtonSecondary" onClick={closeDialog}>Cancel</button><button className="personnelButton personnelButtonPrimary" disabled={saving}>{saving ? "Saving..." : "Add role"}</button></div>
              </form>
            ) : (
              <form onSubmit={submitPerson}>
                <label className="personnelField">Name<input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Full name" required maxLength={120} /></label>
                <label className="personnelField">Role<select value={roleId} onChange={(event) => setRoleId(event.target.value)} required><option value="" disabled>Select a role</option>{data.roles.map((role) => <option value={role.id} key={role.id}>{role.name}</option>)}</select></label>
                {editingPerson ? (
                  <label className="personnelField">Reports to<select value={relationPersonId} onChange={(event) => setRelationPersonId(event.target.value)}><option value="">No manager</option>{data.people.filter((person) => person.id !== editingPerson.id).map((person) => <option value={person.id} key={person.id}>{person.name} · {rolesById.get(person.roleId) ?? "Role not set"}</option>)}</select></label>
                ) : (
                  <>
                    <label className="personnelField">Reporting relationship<select value={relationType} onChange={(event) => { setRelationType(event.target.value); setRelationPersonId(""); }}><option value="none">No connection yet</option><option value="reportsTo">Reports to someone</option><option value="manages">Manages someone</option></select></label>
                    {relationType !== "none" && <label className="personnelField">{relationType === "reportsTo" ? "Reports to" : "Manages"}<select value={relationPersonId} onChange={(event) => setRelationPersonId(event.target.value)} required><option value="" disabled>Select a person</option>{data.people.map((person) => <option value={person.id} key={person.id}>{person.name} · {rolesById.get(person.roleId) ?? "Role not set"}</option>)}</select></label>}
                  </>
                )}
                {error && <p className="personnelNotice personnelNoticeError">{error}</p>}
                <div className="personnelModalActions"><button type="button" className="personnelButton personnelButtonSecondary" onClick={closeDialog}>Cancel</button><button className="personnelButton personnelButtonPrimary" disabled={saving || !data.roles.length}>{saving ? "Saving..." : editingPerson ? "Save changes" : "Add person"}</button></div>
              </form>
            )}
          </section>
        </div>
      )}
    </section>
  );
}
