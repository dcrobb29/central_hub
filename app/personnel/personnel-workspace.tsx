"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Plus } from "lucide-react";
import type { EmployeeHistoryEntry, Person, PersonnelRole } from "@/app/lib/personnel";
import PersonnelChart from "./personnel-chart";
import Modal from "@/app/components/modal";
import { WorkspaceHeading, SearchToolbar, FilterButton, FiltersDialog } from "@/app/components/workspace-ui";
import recordStyles from "@/app/components/record-workspace.module.css";
import styles from "./personnel-workspace.module.css";

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

export default function PersonnelWorkspace({ selectedId, selectedTab, view }: {
  selectedId: string | null;
  selectedTab?: string;
  view: "directory" | "chart";
}) {
  const router = useRouter();
  const [data, setData] = useState<PersonnelState>({ people: [], roles: [] });
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [sort, setSort] = useState("asc");
  const [showFilters, setShowFilters] = useState(false);
  const [showRoles, setShowRoles] = useState(false);
  const [showHistoryForm, setShowHistoryForm] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [historyAttempt, setHistoryAttempt] = useState(0);
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
    const controller = new AbortController();
    fetch("/api/personnel", { signal: controller.signal })
      .then(readResponse)
      .then(setData)
      .catch((requestError: unknown) => {
        if (controller.signal.aborted) return;
        setError(requestError instanceof Error ? requestError.message : "Unable to load personnel");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [loadAttempt]);

  const listHref = view === "chart" ? "/personnel?view=chart" : "/personnel";
  const personHref = (id: string, tab = "overview") => `/personnel?personId=${encodeURIComponent(id)}&tab=${tab}&view=${view}`;
  const tab = selectedTab === "history" ? "history" : "overview";
  const selectedPerson = data.people.find((person) => person.id === selectedId) ?? null;
  const rolesById = new Map(data.roles.map((role) => [role.id, role.name]));
  const reports = selectedPerson
    ? data.people.filter((person) => person.managerId === selectedPerson.id)
    : [];
  const peopleById = new Map(data.people.map((person) => [person.id, person]));
  const manager = selectedPerson?.managerId ? peopleById.get(selectedPerson.managerId) : undefined;
  const visiblePeople = data.people.filter((person) =>
    (!roleFilter || person.roleId === roleFilter)
    && [person.name, rolesById.get(person.roleId), peopleById.get(person.managerId ?? "")?.name]
      .some((value) => value?.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())))
    .sort((a, b) => (sort === "desc" ? -1 : 1) * a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));

  useEffect(() => {
    if (!selectedId || tab !== "history") return;
    const controller = new AbortController();
    fetch(`/api/personnel/history?employeeId=${encodeURIComponent(selectedId)}`, { signal: controller.signal })
      .then(async (response) => {
        const body = await response.json().catch(() => null);
        if (!response.ok) throw new Error(body?.error ?? "Unable to load employee history");
        return body as { entries: EmployeeHistoryEntry[] };
      })
      .then((body) => { if (!controller.signal.aborted) setHistoryState({ employeeId: selectedId, entries: body.entries }); })
      .catch((requestError: unknown) => {
        if (requestError instanceof Error && requestError.name === "AbortError") return;
        setHistoryState({
          employeeId: selectedId,
          error: requestError instanceof Error ? requestError.message : "Unable to load employee history",
        });
      });
    return () => controller.abort();
  }, [selectedId, tab, historyAttempt]);

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
    if (saving) return;
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
      setDialog(null);
      setEditingPerson(null);
      setError(null);
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
      if (!editingPerson && nextData.createdPersonId) router.push(personHref(nextData.createdPersonId));
      setDialog(null);
      setEditingPerson(null);
      setError(null);
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
      setShowHistoryForm(false);
    } catch (requestError) {
      setHistoryError(requestError instanceof Error ? requestError.message : "Unable to save history");
    } finally {
      setHistorySaving(false);
    }
  }

  return (
    <section className={`${recordStyles.workspace} ${styles.workspace}`}>
      {!selectedId && <>
      <WorkspaceHeading title="People" eyebrow="PEOPLE & REPORTING" muted className="personnelToolbar" actions={<>
          <button type="button" className="projectWorkspaceLink" aria-haspopup="dialog" onClick={() => setShowRoles(true)}>
            Roles ({data.roles.length})
          </button>
          <button className="personnelButton personnelButtonPrimary" onClick={() => openPersonDialog()} disabled={data.roles.length === 0}>
            <Plus size={15} aria-hidden="true" /> Add person
          </button>
      </>} />

      <p className={recordStyles.intro}>People at a glance. Open a person for reporting relationships and employee history.</p>
      <div className="listViewToolbar">
        <nav className="engagementTabs" aria-label="People views">
          <Link className={`engagementTab${view === "directory" ? " engagementTabActive" : ""}`} href="/personnel" aria-current={view === "directory" ? "page" : undefined}>Directory ({data.people.length})</Link>
          <Link className={`engagementTab${view === "chart" ? " engagementTabActive" : ""}`} href="/personnel?view=chart" aria-current={view === "chart" ? "page" : undefined}>Organization chart</Link>
        </nav>
        {view === "directory" && <FilterButton active={Boolean(roleFilter || sort !== "asc")} onClick={() => setShowFilters(true)} />}
      </div>
      </>}

      {error && !dialog && <div><p className="personnelNotice personnelNoticeError" role="alert">{error}</p>
        <button type="button" className="projectWorkspaceLink" onClick={() => { setError(null); setLoading(true); setLoadAttempt((value) => value + 1); }}>Retry loading people</button></div>}
      {loading ? (
        <div className="personnelEmptyState" role="status">Loading people...</div>
      ) : selectedId ? selectedPerson ? (
        <div className={`projectHub ${styles.record}`}>
          <nav className="projectHubBreadcrumb" aria-label="Breadcrumb"><Link href={listHref}>People</Link><span> / {selectedPerson.name}</span></nav>
          <header className="projectHubHeader"><div><p className="salesEyebrow">PERSON WORKSPACE</p><h1>{selectedPerson.name}</h1></div>
            <button type="button" className="financeImportButton" onClick={() => openPersonDialog(selectedPerson)}>Edit person</button></header>
          <nav className="projectHubTabs" aria-label="Person sections">
            <Link href={personHref(selectedId)} aria-current={tab === "overview" ? "page" : undefined}>Overview</Link>
            <Link href={personHref(selectedId, "history")} aria-current={tab === "history" ? "page" : undefined}>History</Link>
          </nav>
          {tab === "overview" ? <section className="projectHubSection">
            <h2>Person overview</h2>
            <dl className="projectHubFacts">
              <div><dt>Role</dt><dd>{rolesById.get(selectedPerson.roleId) ?? "Role not set"}</dd></div>
              <div><dt>Reports to</dt><dd>{manager
                ? <Link href={personHref(manager.id)}>{manager.name}</Link> : "No manager"}</dd></div>
              <div><dt>Direct reports</dt><dd>{reports.length}</dd></div>
            </dl>
            {reports.length > 0 && <div className={styles.reports}><h3>Direct reports</h3>{reports.map((person) =>
              <Link className="projectWorkspaceLink" key={person.id} href={personHref(person.id)}>{person.name} - {rolesById.get(person.roleId) ?? "Role not set"}</Link>)}</div>}
          </section> : <section className={`projectHubSection ${styles.history}`}>
            <div className={styles.sectionHeading}><h2>Employee history</h2>
              <button type="button" className="financeImportButton" aria-haspopup="dialog" onClick={() => {
                setHistoryDate(getToday()); setHistoryNotes(""); setHistoryError(null); setShowHistoryForm(true);
              }}>Add history</button></div>
            {historyState?.employeeId !== selectedPerson.id ? <p role="status">Loading history...</p>
              : historyState.error ? <div><p className="personnelHistoryError" role="alert">{historyState.error}</p>
                <button type="button" className="projectWorkspaceLink" onClick={() => {
                  setHistoryState(null); setHistoryAttempt((value) => value + 1);
                }}>Retry loading history</button></div>
                : historyState.entries?.length ? <ol className="personnelHistoryList">{historyState.entries.map((entry) =>
                  <li key={entry.id}><time dateTime={entry.eventDate}>{new Date(`${entry.eventDate}T12:00:00`).toLocaleDateString()}</time><p>{entry.notes}</p></li>)}</ol>
                  : <p className="personnelHistoryEmpty">No history recorded.</p>}
          </section>}
        </div>
      ) : !error && <section className={recordStyles.empty}><h1>Person not found</h1><p role="alert">This person is not in the current directory.</p><Link href={listHref}>Back to People</Link></section>
      : data.people.length === 0 && !error ? (
        <div className="personnelEmptyState">
          <div className="personnelEmptyMark">ORG</div>
          <h2>Start your people directory</h2>
          <p>Define roles, then add people and connect reporting relationships when you’re ready.</p>
          <div className="personnelActions">
            <button className="personnelButton personnelButtonSecondary" onClick={() => { setRoleName(""); setError(null); setDialog("role"); }}>Create a role</button>
            <button className="personnelButton personnelButtonPrimary" onClick={() => openPersonDialog()} disabled={data.roles.length === 0}>Add a person</button>
          </div>
        </div>
      ) : view === "chart" ? (
        <section className={styles.chart}><p className={recordStyles.intro}>Select a person to open their overview and history. Use the chart controls to zoom or fit the organization.</p>
          <PersonnelChart people={data.people} roles={data.roles} personHref={personHref}
            onSelectPerson={(id) => { if (id) router.push(personHref(id)); }} /></section>
      ) : (
        <>
          <SearchToolbar label="Search people" value={search} onChange={setSearch} placeholder="Name, role, or manager"
            count={`${visiblePeople.length} of ${data.people.length} people`}
            onClear={search || roleFilter || sort !== "asc" ? () => { setSearch(""); setRoleFilter(""); setSort("asc"); } : undefined} />
          <div className={recordStyles.list}>
            {!visiblePeople.length && !error && <p className={recordStyles.empty}>No people match these filters.</p>}
            {visiblePeople.map((person) => <article className={recordStyles.card} key={person.id} aria-label={person.name}>
              <div className={recordStyles.identity}><h2><Link href={personHref(person.id)}>{person.name}</Link></h2><p>{rolesById.get(person.roleId) ?? "Role not set"}</p></div>
              <div className={`${recordStyles.status} ${styles.manager}`}><span className={recordStyles.label}>Reports to</span><span>{peopleById.get(person.managerId ?? "")?.name ?? "No manager"}</span></div>
              <div className={recordStyles.status}><span className={recordStyles.label}>Direct reports</span><span>{data.people.filter((report) => report.managerId === person.id).length}</span></div>
              <div className={recordStyles.actions}><Link className={recordStyles.openRecord} href={personHref(person.id)} aria-label={`Open person: ${person.name}`}>Open person <ArrowUpRight size={14} aria-hidden="true" /></Link></div>
            </article>)}
          </div>
        </>
      )}

      {showRoles && <Modal titleId="personnelRolesTitle" title="Roles" eyebrow="PEOPLE & REPORTING" onClose={() => setShowRoles(false)} closeLabel="Close roles">
        <p className={recordStyles.intro}>Roles are shared across the directory and organization chart.</p>
        <ul className={styles.roles}>{data.roles.map((role) => <li key={role.id}>{role.name}</li>)}</ul>
        {!data.roles.length && <p>No roles defined yet. Add a role before adding people.</p>}
        <button type="button" className="financeImportButton" onClick={() => { setShowRoles(false); setRoleName(""); setError(null); setDialog("role"); }}>Add role</button>
      </Modal>}
      {showFilters && <FiltersDialog id="personnel" label="PEOPLE" onClose={() => setShowFilters(false)}
        onReset={() => { setRoleFilter(""); setSort("asc"); setSearch(""); }} hint="Changes apply immediately to the directory.">
        <label className="financeImportField">Role<select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}>
          <option value="">All roles</option>{data.roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select></label>
        <label className="financeImportField">Sort by<select value={sort} onChange={(event) => setSort(event.target.value)}><option value="asc">Name: A to Z</option><option value="desc">Name: Z to A</option></select></label>
      </FiltersDialog>}
      {showHistoryForm && selectedPerson && <Modal titleId="personnelHistoryTitle" title={`Add history for ${selectedPerson.name}`} eyebrow="PEOPLE" closeDisabled={historySaving}
        onClose={() => { if (!historySaving) setShowHistoryForm(false); }} closeLabel="Close history form">
        <form className="personnelHistoryForm" onSubmit={submitHistory}>
          <label className="personnelField">Event date<input autoFocus type="date" value={historyDate} onChange={(event) => setHistoryDate(event.target.value)} required /></label>
          <label className="personnelField">Note<textarea value={historyNotes} onChange={(event) => setHistoryNotes(event.target.value)} placeholder="Add an employee event" required maxLength={8000} rows={3} /></label>
          {historyError && <p className="personnelHistoryError" role="alert">{historyError}</p>}
          <div className="financeImportActions"><button type="button" className="financeImportCancel" disabled={historySaving} onClick={() => setShowHistoryForm(false)}>Cancel</button>
            <button className="financeImportSubmit" type="submit" disabled={historySaving}>{historySaving ? "Saving..." : "Save history"}</button></div>
        </form>
      </Modal>}
      {dialog && (
        <Modal titleId="personnelModalTitle" title={dialog === "role" ? "Add a role" : editingPerson ? "Edit person" : "Add a person"}
          eyebrow="PEOPLE & REPORTING" onClose={closeDialog} closeDisabled={saving} closeLabel="Close person or role form">

            {dialog === "role" ? (
              <form onSubmit={submitRole}>
                <label className="personnelField">Role name<input autoFocus value={roleName} onChange={(event) => setRoleName(event.target.value)} placeholder="e.g. Operations Manager" required maxLength={80} /></label>
                {error && <p className="personnelNotice personnelNoticeError" role="alert">{error}</p>}
                <div className="personnelModalActions"><button type="button" className="personnelButton personnelButtonSecondary" disabled={saving} onClick={closeDialog}>Cancel</button><button className="personnelButton personnelButtonPrimary" disabled={saving}>{saving ? "Saving..." : "Add role"}</button></div>
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
                {error && <p className="personnelNotice personnelNoticeError" role="alert">{error}</p>}
                <div className="personnelModalActions"><button type="button" className="personnelButton personnelButtonSecondary" disabled={saving} onClick={closeDialog}>Cancel</button><button className="personnelButton personnelButtonPrimary" disabled={saving || !data.roles.length}>{saving ? "Saving..." : editingPerson ? "Save changes" : "Add person"}</button></div>
              </form>
            )}
        </Modal>
      )}
    </section>
  );
}
