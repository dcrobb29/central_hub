"use client";

import { useEffect, useState } from "react";
import Modal from "@/app/components/modal";
import type { AccountSession, OrganizationSettingsData } from "@/app/lib/account";

type Tab = "overview" | "members" | "personnel" | "roles";

export default function SettingsModal({
  session,
  onClose,
  onOrganizationRenamed,
}: {
  session: AccountSession;
  onClose: () => void;
  onOrganizationRenamed: (name: string) => void;
}) {
  const [tab, setTab] = useState<Tab>("overview");
  const [data, setData] = useState<OrganizationSettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Edit Org Name
  const [orgName, setOrgName] = useState(session.organization.organizationName);

  // Add Member Form
  const [isAddingMember, setIsAddingMember] = useState(false);
  const [newMemberEmail, setNewMemberEmail] = useState("");
  const [newMemberName, setNewMemberName] = useState("");
  const [newMemberPhone, setNewMemberPhone] = useState("");
  const [newMemberRole, setNewMemberRole] = useState<number>(1);
  const [newMemberLinkEmp, setNewMemberLinkEmp] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/account/settings?organizationId=${session.organization.organizationId}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Unable to load settings");
        if (!cancelled) {
          setData(json as OrganizationSettingsData);
          setOrgName((json as OrganizationSettingsData).organization.organizationName);
          if ((json as OrganizationSettingsData).accessRoles.length > 0) {
            setNewMemberRole((json as OrganizationSettingsData).accessRoles[0].accessRoleId);
          }
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load organization settings");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [session.organization.organizationId]);

  async function postAction(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/account/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId: session.organization.organizationId,
          ...body,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Operation failed");
      setData(json as OrganizationSettingsData);
      if (json.notification) setNotice(json.notification);
      return json as OrganizationSettingsData;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
      throw err;
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveOrgName(e: React.FormEvent) {
    e.preventDefault();
    try {
      await postAction({ action: "update-organization-name", name: orgName });
      setNotice("Organization name updated.");
      onOrganizationRenamed(orgName.trim());
    } catch {
      // Error handled in postAction
    }
  }

  async function handleAddMember(e: React.FormEvent) {
    e.preventDefault();
    try {
      await postAction({
        action: "add-member",
        email: newMemberEmail,
        displayName: newMemberName,
        phone: newMemberPhone.trim() || null,
        accessRoleId: newMemberRole,
        linkEmployeeId: newMemberLinkEmp ? Number(newMemberLinkEmp) : null,
      });
      setNotice(`Added ${newMemberName} to the organization.`);
      setIsAddingMember(false);
      setNewMemberEmail("");
      setNewMemberName("");
      setNewMemberPhone("");
      setNewMemberLinkEmp("");
    } catch {
      // Error handled
    }
  }

  async function handleMemberRoleChange(membershipId: number, accessRoleId: number) {
    try {
      await postAction({ action: "update-member", membershipId, accessRoleId });
      setNotice("Member role updated.");
    } catch {
      // Error handled
    }
  }

  async function handleToggleMemberActive(membershipId: number, currentActive: boolean) {
    try {
      await postAction({ action: "update-member", membershipId, isActive: !currentActive });
      setNotice(`Member ${currentActive ? "deactivated" : "activated"}.`);
    } catch {
      // Error handled
    }
  }

  async function handleLinkEmployee(membershipId: number, employeeIdStr: string) {
    try {
      if (!employeeIdStr) {
        await postAction({ action: "unlink-employee", membershipId });
        setNotice("Personnel hierarchy link removed.");
      } else {
        await postAction({ action: "link-employee", membershipId, employeeId: Number(employeeIdStr) });
        setNotice("Linked member with personnel hierarchy profile.");
      }
    } catch {
      // Error handled
    }
  }

  async function handleToggleEmployeeActive(employeeId: number, currentActive: boolean) {
    try {
      await postAction({ action: "toggle-employee-active", employeeId, isActive: !currentActive });
      setNotice(`Personnel ${currentActive ? "archived" : "restored"}.`);
    } catch {
      // Error handled
    }
  }

  async function handleDeleteEmployee(employeeId: number) {
    if (!confirm("Are you sure? If this person has project assignments, task history, or reports, they will be archived instead of permanently deleted.")) {
      return;
    }
    try {
      await postAction({ action: "delete-employee", employeeId });
    } catch {
      // Error handled
    }
  }

  return (
    <Modal
      titleId="settingsModalTitle"
      title={`${session.organization.organizationName} Settings`}
      eyebrow="ORGANIZATION &amp; TEAM"
      onClose={onClose}
      closeDisabled={busy}
      className="accountSettingsModal"
    >
      <div className="fieldSegmentedToggle billingTabs" role="tablist" aria-label="Settings tabs">
        {(["overview", "members", "personnel", "roles"] as const).map((t) => (
          <button
            type="button"
            key={t}
            role="tab"
            aria-selected={tab === t}
            disabled={busy}
            className={tab === t ? "fieldSegmentedToggleActive" : ""}
            onClick={() => setTab(t)}
          >
            {t === "overview"
              ? "Organization Overview"
              : t === "members"
              ? `Team Members (${data?.members.length ?? 0})`
              : t === "personnel"
              ? `Personnel & Field (${data?.employees.length ?? 0})`
              : "Roles & Permissions"}
          </button>
        ))}
      </div>

      {loading && <p role="status">Loading organization details...</p>}
      {error && <p className="financeImportError" role="alert">{error}</p>}
      {notice && <p className="billingNotice" role="status">{notice}</p>}

      {data && tab === "overview" && (
        <div className="accountSettingsContent">
          <form onSubmit={handleSaveOrgName} className="accountFormSection">
            <fieldset className="financeImportGroup">
              <legend>Company Profile</legend>
              <div className="financeImportFields">
                <label className="financeImportField">
                  Organization Identifier
                  <input value={data.organization.organizationKey} disabled readOnly />
                </label>
                <label className="financeImportField">
                  Company / Organization Name *
                  <input
                    value={orgName}
                    maxLength={150}
                    required
                    disabled={busy}
                    onChange={(e) => setOrgName(e.target.value)}
                  />
                </label>
              </div>
              <div style={{ marginTop: "10px" }}>
                <button type="submit" className="financeImportSubmit" disabled={busy || orgName.trim() === data.organization.organizationName}>
                  {busy ? "Saving..." : "Update company name"}
                </button>
              </div>
            </fieldset>
          </form>

          <fieldset className="financeImportGroup">
            <legend>SaaS Subscription &amp; Licenses</legend>
            <div className="accountInfoGrid">
              <div>
                <span className="accountInfoLabel">Subscription Plan</span>
                <strong className="accountInfoValue">{data.subscription?.planName ?? "Test Trial"}</strong>
              </div>
              <div>
                <span className="accountInfoLabel">Status</span>
                <span className="accountBadge">{data.subscription?.status ?? "Trial"}</span>
              </div>
              <div>
                <span className="accountInfoLabel">Admin / Licensed Seats</span>
                <strong className="accountInfoValue">
                  {data.members.filter((m) => m.isActive).length} active licensed user(s)
                </strong>
              </div>
              <div>
                <span className="accountInfoLabel">Field Personnel (Unlicensed)</span>
                <span className="accountMeta">
                  {data.employees.filter((e) => !e.linkedMembershipId).length} field crew member(s) listed without portal licenses
                </span>
              </div>
            </div>
            <p className="financeImportHint">
              Field personnel can be created in the organization hierarchy for scheduling, task assignment, and job tracking without consuming a SaaS user license.
            </p>
          </fieldset>
        </div>
      )}

      {data && tab === "members" && (
        <div className="accountSettingsContent">
          <div className="accountSectionHeader">
            <p className="financeImportHint">
              Portal members have logins and security roles within this organization.
            </p>
            <button
              type="button"
              className="importButton"
              disabled={busy}
              onClick={() => setIsAddingMember((v) => !v)}
            >
              {isAddingMember ? "Cancel" : "Add member"}
            </button>
          </div>

          {isAddingMember && (
            <form onSubmit={handleAddMember} className="accountAddMemberForm">
              <fieldset className="financeImportGroup">
                <legend>New Organization Member</legend>
                <div className="financeImportFields">
                  <label className="financeImportField">
                    Email *
                    <input
                      type="email"
                      value={newMemberEmail}
                      required
                      placeholder="user@example.com"
                      disabled={busy}
                      onChange={(e) => setNewMemberEmail(e.target.value)}
                    />
                  </label>
                  <label className="financeImportField">
                    Display Name *
                    <input
                      value={newMemberName}
                      required
                      placeholder="John Doe"
                      disabled={busy}
                      onChange={(e) => setNewMemberName(e.target.value)}
                    />
                  </label>
                  <label className="financeImportField">
                    Phone
                    <input
                      value={newMemberPhone}
                      placeholder="(555) 000-0000"
                      disabled={busy}
                      onChange={(e) => setNewMemberPhone(e.target.value)}
                    />
                  </label>
                  <label className="financeImportField">
                    Access Role *
                    <select
                      value={newMemberRole}
                      disabled={busy}
                      onChange={(e) => setNewMemberRole(Number(e.target.value))}
                    >
                      {data.accessRoles.map((r) => (
                        <option key={r.accessRoleId} value={r.accessRoleId}>
                          {r.roleName}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="financeImportField">
                    Link with Existing Personnel Hierarchy Person
                    <select
                      value={newMemberLinkEmp}
                      disabled={busy}
                      onChange={(e) => setNewMemberLinkEmp(e.target.value)}
                    >
                      <option value="">Do not link (create pure login user)</option>
                      {data.employees
                        .filter((emp) => !emp.linkedMembershipId)
                        .map((emp) => (
                          <option key={emp.employeeId} value={emp.employeeId}>
                            {emp.name} ({emp.roleName})
                          </option>
                        ))}
                    </select>
                  </label>
                </div>
                <div className="financeImportActions">
                  <button
                    type="button"
                    className="financeImportCancel"
                    disabled={busy}
                    onClick={() => setIsAddingMember(false)}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="financeImportSubmit" disabled={busy}>
                    {busy ? "Adding..." : "Add to organization"}
                  </button>
                </div>
              </fieldset>
            </form>
          )}

          <div className="billingTableWrap">
            <table className="invoiceTable billingTable">
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Contact</th>
                  <th>Role</th>
                  <th>Linked Hierarchy Person</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.members.map((m) => (
                  <tr key={m.membershipId}>
                    <td>
                      <strong>{m.displayName}</strong>
                      {m.userId === session.user.userId && <span className="accountYouBadge">You</span>}
                    </td>
                    <td>
                      <div>{m.email}</div>
                      {m.phone && <small className="accountMeta">{m.phone}</small>}
                    </td>
                    <td>
                      <select
                        aria-label={`Role for ${m.displayName}`}
                        value={m.roles[0]?.accessRoleId ?? ""}
                        disabled={busy || m.userId === session.user.userId}
                        onChange={(e) => handleMemberRoleChange(m.membershipId, Number(e.target.value))}
                      >
                        {data.accessRoles.map((r) => (
                          <option key={r.accessRoleId} value={r.accessRoleId}>
                            {r.roleName}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <select
                        aria-label={`Link hierarchy person for ${m.displayName}`}
                        value={m.linkedEmployee?.employeeId ?? ""}
                        disabled={busy}
                        onChange={(e) => handleLinkEmployee(m.membershipId, e.target.value)}
                      >
                        <option value="">Unlinked (portal only)</option>
                        {data.employees
                          .filter((e) => !e.linkedMembershipId || e.linkedMembershipId === m.membershipId)
                          .map((e) => (
                            <option key={e.employeeId} value={e.employeeId}>
                              {e.name} ({e.roleName})
                            </option>
                          ))}
                      </select>
                    </td>
                    <td>
                      <span className={m.isActive ? "accountBadgeActive" : "accountBadgeInactive"}>
                        {m.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td>
                      {m.userId !== session.user.userId && (
                        <button
                          type="button"
                          className="estimateTextAction"
                          disabled={busy}
                          onClick={() => handleToggleMemberActive(m.membershipId, m.isActive)}
                        >
                          {m.isActive ? "Deactivate" : "Activate"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {data && tab === "personnel" && (
        <div className="accountSettingsContent">
          <p className="financeImportHint">
            Two-way shared roster: Field personnel created here or in the Personnel hierarchy chart can be merged/linked to user accounts, archived when inactive, or deleted if they have no historical task records.
          </p>

          <div className="billingTableWrap">
            <table className="invoiceTable billingTable">
              <thead>
                <tr>
                  <th>Employee / Field Name</th>
                  <th>Hierarchy Job Title</th>
                  <th>Manager</th>
                  <th>Linked User Login</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.employees.map((e) => (
                  <tr key={e.employeeId} className={!e.isActive ? "billingRowArchived" : ""}>
                    <td>
                      <strong>{e.name}</strong>
                    </td>
                    <td>{e.roleName}</td>
                    <td>{e.managerName ?? "Top of tree / None"}</td>
                    <td>
                      {e.linkedUserDisplayName ? (
                        <span>
                          <strong>{e.linkedUserDisplayName}</strong> ({e.linkedUserEmail})
                        </span>
                      ) : (
                        <span className="accountMeta">Unlinked field personnel</span>
                      )}
                    </td>
                    <td>
                      <span className={e.isActive ? "accountBadgeActive" : "accountBadgeInactive"}>
                        {e.isActive ? "Active" : "Archived"}
                      </span>
                    </td>
                    <td>
                      <div className="accountActionRow">
                        <button
                          type="button"
                          className="estimateTextAction"
                          disabled={busy}
                          onClick={() => handleToggleEmployeeActive(e.employeeId, e.isActive)}
                        >
                          {e.isActive ? "Archive" : "Restore"}
                        </button>
                        <button
                          type="button"
                          className="estimateTextAction estimateTextActionDanger"
                          disabled={busy}
                          onClick={() => handleDeleteEmployee(e.employeeId)}
                        >
                          Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {data && tab === "roles" && (
        <div className="accountSettingsContent">
          <p className="financeImportHint">
            Access roles are organization-defined. A role in Contoso only grants permissions assigned explicitly below.
          </p>

          <div className="accountRolesGrid">
            {data.accessRoles.map((r) => (
              <div key={r.accessRoleId} className="accountRoleCard">
                <div className="accountRoleHeader">
                  <strong>{r.roleName}</strong>
                  <span className="accountMeta">Code: {r.roleKey}</span>
                </div>
                <div className="accountRolePermCount">
                  {r.permissions.length} granted permission(s)
                </div>
                <ul className="accountPermList">
                  {r.permissions.map((p) => (
                    <li key={p.permissionKey}>
                      <strong>{p.permissionKey}</strong>: {p.description}
                    </li>
                  ))}
                  {r.permissions.length === 0 && (
                    <li className="accountMeta">No permissions granted (read-only / restricted).</li>
                  )}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="financeImportActions" style={{ marginTop: "20px" }}>
        <button type="button" className="financeImportCancel" disabled={busy} onClick={onClose}>
          Close settings
        </button>
      </div>
    </Modal>
  );
}
