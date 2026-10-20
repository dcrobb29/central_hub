"use client";

import { useEffect, useState } from "react";
import Modal from "@/app/components/modal";
import type { AccountSession, OrganizationSettingsData } from "@/app/lib/account";
import type { TemplateStyle } from "@/app/lib/invoice-settings";

type Tab = "overview" | "members" | "personnel" | "roles" | "invoices";

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
  const canManageMembers = session.permissions.includes("members.manage");
  const canManagePersonnel = session.permissions.includes("personnel.write");
  const canManageInvoices = session.permissions.includes("finances.write");

  // Edit Org Name
  const [orgName, setOrgName] = useState(session.organization.organizationName);

  // Add Member Form
  const [isAddingMember, setIsAddingMember] = useState(false);
  const [newMemberEmail, setNewMemberEmail] = useState("");
  const [newMemberName, setNewMemberName] = useState("");
  const [newMemberPhone, setNewMemberPhone] = useState("");
  const [newMemberRole, setNewMemberRole] = useState<number>(1);
  const [newMemberLinkEmp, setNewMemberLinkEmp] = useState<string>("");

  // Invoice Template Form
  const [invoiceStyle, setInvoiceStyle] = useState<TemplateStyle>("modern");
  const [accentColor, setAccentColor] = useState("#0284c7");
  const [invoiceTitle, setInvoiceTitle] = useState("INVOICE");
  const [invCompanyName, setInvCompanyName] = useState("");
  const [invAddr1, setInvAddr1] = useState("");
  const [invAddr2, setInvAddr2] = useState("");
  const [invCity, setInvCity] = useState("");
  const [invState, setInvState] = useState("");
  const [invZip, setInvZip] = useState("");
  const [invPhone, setInvPhone] = useState("");
  const [invEmail, setInvEmail] = useState("");
  const [invWebsite, setInvWebsite] = useState("");
  const [invTaxNumber, setInvTaxNumber] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("Net 30");
  const [paymentInstructions, setPaymentInstructions] = useState("");
  const [defaultNotes, setDefaultNotes] = useState("");
  const [emailSubjectTemplate, setEmailSubjectTemplate] = useState("");
  const [emailBodyTemplate, setEmailBodyTemplate] = useState("");
  const [showShipping, setShowShipping] = useState(true);
  const [showProject, setShowProject] = useState(true);
  const [showScopes, setShowScopes] = useState(true);
  const [isPreviewingPdf, setIsPreviewingPdf] = useState(false);

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
          const orgData = json as OrganizationSettingsData;
          setData(orgData);
          setOrgName(orgData.organization.organizationName);
          if (orgData.accessRoles.length > 0) {
            setNewMemberRole(orgData.accessRoles[0].accessRoleId);
          }
          if (orgData.invoiceSettings) {
            const s = orgData.invoiceSettings;
            setInvoiceStyle(s.templateStyle || "modern");
            setAccentColor(s.accentColor || "#0284c7");
            setInvoiceTitle(s.invoiceTitle || "INVOICE");
            setInvCompanyName(s.companyName || orgData.organization.organizationName || "");
            setInvAddr1(s.companyAddressLine1 || "");
            setInvAddr2(s.companyAddressLine2 || "");
            setInvCity(s.companyCity || "");
            setInvState(s.companyState || "");
            setInvZip(s.companyZip || "");
            setInvPhone(s.companyPhone || "");
            setInvEmail(s.companyEmail || "");
            setInvWebsite(s.companyWebsite || "");
            setInvTaxNumber(s.taxNumber || "");
            setPaymentTerms(s.paymentTerms || "Net 30");
            setPaymentInstructions(s.paymentInstructions || "");
            setDefaultNotes(s.defaultCustomerNotes || "");
            setEmailSubjectTemplate(s.emailSubjectTemplate || "Invoice {invoiceNo} from {companyName}");
            setEmailBodyTemplate(s.emailBodyTemplate || "");
            setShowShipping(s.showShippingAddress ?? true);
            setShowProject(s.showProjectName ?? true);
            setShowScopes(s.showItemizedScopes ?? true);
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

  async function handleSaveInvoiceSettings(e: React.FormEvent) {
    e.preventDefault();
    try {
      await postAction({
        action: "update-invoice-settings",
        invoiceSettings: {
          templateStyle: invoiceStyle,
          accentColor,
          invoiceTitle,
          companyName: invCompanyName,
          companyAddressLine1: invAddr1,
          companyAddressLine2: invAddr2,
          companyCity: invCity,
          companyState: invState,
          companyZip: invZip,
          companyPhone: invPhone,
          companyEmail: invEmail,
          companyWebsite: invWebsite,
          taxNumber: invTaxNumber,
          paymentTerms,
          paymentInstructions,
          defaultCustomerNotes: defaultNotes,
          emailSubjectTemplate,
          emailBodyTemplate,
          showShippingAddress: showShipping,
          showProjectName: showProject,
          showItemizedScopes: showScopes,
        },
      });
      setNotice("Invoice template settings saved successfully.");
    } catch {
      // Handled in postAction
    }
  }

  async function handlePreviewPdf() {
    setIsPreviewingPdf(true);
    setError(null);
    try {
      const res = await fetch("/api/account/settings/invoice-template/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId: session.organization.organizationId,
          templateStyle: invoiceStyle,
          accentColor,
          invoiceTitle,
          companyName: invCompanyName,
          companyAddressLine1: invAddr1,
          companyAddressLine2: invAddr2,
          companyCity: invCity,
          companyState: invState,
          companyZip: invZip,
          companyPhone: invPhone,
          companyEmail: invEmail,
          companyWebsite: invWebsite,
          taxNumber: invTaxNumber,
          paymentTerms,
          paymentInstructions,
          defaultCustomerNotes: defaultNotes,
          emailSubjectTemplate,
          emailBodyTemplate,
          showShippingAddress: showShipping,
          showProjectName: showProject,
          showItemizedScopes: showScopes,
        }),
      });
      if (!res.ok) throw new Error("Failed to render invoice preview PDF");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to generate preview PDF");
    } finally {
      setIsPreviewingPdf(false);
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
        {(["overview", "members", "personnel", "roles", "invoices"] as const).map((t) => (
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
              : t === "roles"
              ? "Roles & Permissions"
              : "Invoice Template"}
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
              disabled={busy || !canManageMembers}
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
                      disabled={busy || !canManagePersonnel}
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
                        disabled={busy || !canManageMembers || m.userId === session.user.userId}
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
                        disabled={busy || !canManageMembers || !canManagePersonnel}
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
                          disabled={busy || !canManageMembers}
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
                          disabled={busy || !canManagePersonnel}
                          onClick={() => handleToggleEmployeeActive(e.employeeId, e.isActive)}
                        >
                          {e.isActive ? "Archive" : "Restore"}
                        </button>
                        <button
                          type="button"
                          className="estimateTextAction estimateTextActionDanger"
                          disabled={busy || !canManagePersonnel}
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

      {data && tab === "invoices" && (
        <div className="accountSettingsContent">
          <div className="accountSectionHeader">
            <div>
              <p className="financeImportHint" style={{ margin: 0 }}>
                Customize your organization&apos;s invoice PDF style, branding colors, letterhead contact info, payment remittance instructions, and email notifications.
              </p>
            </div>
            <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
              <button
                type="button"
                className="estimateTextAction"
                disabled={busy || isPreviewingPdf}
                onClick={() => void handlePreviewPdf()}
                style={{ padding: "6px 12px", border: "1px solid var(--ui-color-border)", borderRadius: "4px" }}
              >
                {isPreviewingPdf ? "Generating PDF..." : "Preview Sample PDF"}
              </button>
            </div>
          </div>

          <form onSubmit={handleSaveInvoiceSettings} className="accountFormSection">
            {/* Template Style Preset */}
            <fieldset className="financeImportGroup">
              <legend>Template Layout Style</legend>
              <p className="financeImportHint">
                Choose the structural preset that best fits your company&apos;s branding and project scope.
              </p>
              <div className="invoiceStylePresetGrid">
                {[
                  {
                    key: "modern" as const,
                    name: "Modern",
                    desc: "Crisp top accent bar, structured two-column bill-to layout, highlighted total callout.",
                  },
                  {
                    key: "classic" as const,
                    name: "Classic",
                    desc: "Formal corporate letterhead with fine horizontal rules, traditional typography, and double-rule summary.",
                  },
                  {
                    key: "compact" as const,
                    name: "Compact",
                    desc: "High-density spacing and narrower margins to fit maximum line items on fewer pages for large contracts.",
                  },
                  {
                    key: "minimal" as const,
                    name: "Minimal",
                    desc: "Clean contemporary aesthetic, light hairlines, generous whitespace, and borderless totals.",
                  },
                ].map((s) => (
                  <label
                    key={s.key}
                    className={`invoiceStylePresetCard ${invoiceStyle === s.key ? "invoiceStylePresetCardSelected" : ""}`}
                    onClick={() => setInvoiceStyle(s.key)}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <input
                        type="radio"
                        name="templateStyle"
                        value={s.key}
                        checked={invoiceStyle === s.key}
                        onChange={() => setInvoiceStyle(s.key)}
                        disabled={busy}
                      />
                      <strong style={{ marginLeft: 6, fontSize: "14px" }}>{s.name}</strong>
                      {invoiceStyle === s.key && (
                        <span className="accountYouBadge" style={{ background: accentColor }}>Active</span>
                      )}
                    </div>
                    <p style={{ margin: "6px 0 0 0", fontSize: "12px", color: "var(--ui-color-muted)", lineHeight: 1.4 }}>
                      {s.desc}
                    </p>
                  </label>
                ))}
              </div>
            </fieldset>

            {/* Brand Colors & Header Title */}
            <fieldset className="financeImportGroup">
              <legend>Brand Accent Color &amp; Document Title</legend>
              <div className="financeImportFields">
                <div className="financeImportField">
                  <label htmlFor="invoiceAccentColorInput">
                    Primary Brand Color
                  </label>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "4px" }}>
                    <input
                      id="invoiceAccentColorInput"
                      type="color"
                      value={accentColor}
                      disabled={busy}
                      onChange={(e) => setAccentColor(e.target.value)}
                      style={{ width: "42px", height: "36px", padding: "2px", border: "1px solid var(--ui-color-border)", borderRadius: "4px", cursor: "pointer" }}
                    />
                    <input
                      type="text"
                      value={accentColor}
                      maxLength={7}
                      disabled={busy}
                      onChange={(e) => setAccentColor(e.target.value)}
                      style={{ width: "100px", fontFamily: "monospace" }}
                      placeholder="#0284c7"
                    />
                    <div className="invoiceColorSwatches">
                      {[
                        { label: "Teal", hex: "#0284c7" },
                        { label: "Navy", hex: "#1e3a8a" },
                        { label: "Emerald", hex: "#059669" },
                        { label: "Slate", hex: "#334155" },
                        { label: "Crimson", hex: "#dc2626" },
                        { label: "Amber", hex: "#d97706" },
                        { label: "Charcoal", hex: "#27272a" },
                      ].map((c) => (
                        <button
                          key={c.hex}
                          type="button"
                          title={c.label}
                          disabled={busy}
                          onClick={() => setAccentColor(c.hex)}
                          className={`invoiceColorSwatch ${accentColor.toLowerCase() === c.hex.toLowerCase() ? "invoiceColorSwatchActive" : ""}`}
                          style={{ backgroundColor: c.hex }}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                <label className="financeImportField">
                  Invoice Header Title
                  <input
                    type="text"
                    value={invoiceTitle}
                    maxLength={64}
                    disabled={busy}
                    onChange={(e) => setInvoiceTitle(e.target.value)}
                    placeholder="INVOICE (e.g. TAX INVOICE, BILLING STATEMENT)"
                  />
                </label>
              </div>
            </fieldset>

            {/* Company / Letterhead Info */}
            <fieldset className="financeImportGroup">
              <legend>Company Remittance / Letterhead Info</legend>
              <div className="financeImportFields">
                <label className="financeImportField">
                  Company / Organization Display Name
                  <input
                    type="text"
                    value={invCompanyName}
                    maxLength={150}
                    disabled={busy}
                    onChange={(e) => setInvCompanyName(e.target.value)}
                    placeholder={data.organization.organizationName}
                  />
                </label>

                <label className="financeImportField">
                  Tax ID / Contractor License # (Optional)
                  <input
                    type="text"
                    value={invTaxNumber}
                    maxLength={50}
                    disabled={busy}
                    onChange={(e) => setInvTaxNumber(e.target.value)}
                    placeholder="e.g. EIN 12-3456789 or Lic #WA-99234"
                  />
                </label>

                <label className="financeImportField">
                  Address Line 1
                  <input
                    type="text"
                    value={invAddr1}
                    maxLength={200}
                    disabled={busy}
                    onChange={(e) => setInvAddr1(e.target.value)}
                    placeholder="123 Commercial Blvd, Suite 200"
                  />
                </label>

                <label className="financeImportField">
                  Address Line 2
                  <input
                    type="text"
                    value={invAddr2}
                    maxLength={200}
                    disabled={busy}
                    onChange={(e) => setInvAddr2(e.target.value)}
                    placeholder="Floor 4 / Dock 3"
                  />
                </label>

                <label className="financeImportField">
                  City
                  <input
                    type="text"
                    value={invCity}
                    maxLength={100}
                    disabled={busy}
                    onChange={(e) => setInvCity(e.target.value)}
                    placeholder="Seattle"
                  />
                </label>

                <label className="financeImportField">
                  State / Province
                  <input
                    type="text"
                    value={invState}
                    maxLength={50}
                    disabled={busy}
                    onChange={(e) => setInvState(e.target.value)}
                    placeholder="WA"
                  />
                </label>

                <label className="financeImportField">
                  ZIP / Postal Code
                  <input
                    type="text"
                    value={invZip}
                    maxLength={20}
                    disabled={busy}
                    onChange={(e) => setInvZip(e.target.value)}
                    placeholder="98101"
                  />
                </label>

                <label className="financeImportField">
                  Phone
                  <input
                    type="tel"
                    value={invPhone}
                    maxLength={50}
                    disabled={busy}
                    onChange={(e) => setInvPhone(e.target.value)}
                    placeholder="(206) 555-0199"
                  />
                </label>

                <label className="financeImportField">
                  Billing Email
                  <input
                    type="email"
                    value={invEmail}
                    maxLength={254}
                    disabled={busy}
                    onChange={(e) => setInvEmail(e.target.value)}
                    placeholder="billing@example.com"
                  />
                </label>

                <label className="financeImportField">
                  Website
                  <input
                    type="text"
                    value={invWebsite}
                    maxLength={200}
                    disabled={busy}
                    onChange={(e) => setInvWebsite(e.target.value)}
                    placeholder="www.example.com"
                  />
                </label>
              </div>
            </fieldset>

            {/* Payment Terms & Instructions */}
            <fieldset className="financeImportGroup">
              <legend>Payment Terms &amp; Remittance Instructions</legend>
              <div className="financeImportFields">
                <label className="financeImportField">
                  Default Payment Terms
                  <input
                    type="text"
                    value={paymentTerms}
                    maxLength={100}
                    disabled={busy}
                    onChange={(e) => setPaymentTerms(e.target.value)}
                    placeholder="Net 30, Due upon receipt, Net 15, Net 60"
                  />
                </label>
              </div>

              <div style={{ marginTop: "10px" }}>
                <label className="financeImportField">
                  Remittance / Payment Instructions
                  <textarea
                    rows={3}
                    value={paymentInstructions}
                    disabled={busy}
                    onChange={(e) => setPaymentInstructions(e.target.value)}
                    placeholder="e.g. Please send checks payable to Acme Corp. For ACH / Wire transfers: Bank of America, Routing #123456789, Acct #987654321."
                    style={{ width: "100%", padding: "8px", fontSize: "13px", borderRadius: "4px", border: "1px solid var(--ui-color-border)" }}
                  />
                </label>
              </div>

              <div style={{ marginTop: "10px" }}>
                <label className="financeImportField">
                  Default Customer Appreciation Note / Footer
                  <textarea
                    rows={2}
                    value={defaultNotes}
                    disabled={busy}
                    onChange={(e) => setDefaultNotes(e.target.value)}
                    placeholder="e.g. Thank you for your business! Please direct questions to our billing department."
                    style={{ width: "100%", padding: "8px", fontSize: "13px", borderRadius: "4px", border: "1px solid var(--ui-color-border)" }}
                  />
                </label>
              </div>
            </fieldset>

            {/* Display Options */}
            <fieldset className="financeImportGroup">
              <legend>Document Display Toggles</legend>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "4px" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "13px" }}>
                  <input
                    type="checkbox"
                    checked={showShipping}
                    disabled={busy}
                    onChange={(e) => setShowShipping(e.target.checked)}
                  />
                  <span>Show Shipping Address on invoice (when provided)</span>
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "13px" }}>
                  <input
                    type="checkbox"
                    checked={showProject}
                    disabled={busy}
                    onChange={(e) => setShowProject(e.target.checked)}
                  />
                  <span>Show Project Name header on invoice</span>
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "13px" }}>
                  <input
                    type="checkbox"
                    checked={showScopes}
                    disabled={busy}
                    onChange={(e) => setShowScopes(e.target.checked)}
                  />
                  <span>Show itemized scope allocations for project billing invoices</span>
                </label>
              </div>
            </fieldset>

            {/* Email Notification Templates */}
            <fieldset className="financeImportGroup">
              <legend>Customer Email Notification Template</legend>
              <p className="financeImportHint">
                Available placeholders: <code>{"{invoiceNo}"}</code>, <code>{"{companyName}"}</code>, <code>{"{customerName}"}</code>, <code>{"{projectName}"}</code>, <code>{"{amount}"}</code>, <code>{"{dueDate}"}</code>
              </p>
              <div className="financeImportFields">
                <label className="financeImportField" style={{ gridColumn: "1 / -1" }}>
                  Email Subject Line
                  <input
                    type="text"
                    value={emailSubjectTemplate}
                    maxLength={250}
                    disabled={busy}
                    onChange={(e) => setEmailSubjectTemplate(e.target.value)}
                    placeholder="Invoice {invoiceNo} from {companyName}"
                  />
                </label>
              </div>
              <div style={{ marginTop: "10px" }}>
                <label className="financeImportField">
                  Email Message Body
                  <textarea
                    rows={6}
                    value={emailBodyTemplate}
                    disabled={busy}
                    onChange={(e) => setEmailBodyTemplate(e.target.value)}
                    placeholder="Hello {customerName},&#10;&#10;Please find attached Invoice {invoiceNo} for {amount}.&#10;Project: {projectName}&#10;Due date: {dueDate}&#10;&#10;Thank you for your business!&#10;&#10;Sincerely,&#10;{companyName}"
                    style={{ width: "100%", padding: "8px", fontSize: "13px", fontFamily: "monospace", borderRadius: "4px", border: "1px solid var(--ui-color-border)" }}
                  />
                </label>
              </div>
            </fieldset>

            <div className="financeImportActions" style={{ marginTop: "16px" }}>
              <button
                type="button"
                className="financeImportCancel"
                disabled={busy || isPreviewingPdf}
                onClick={() => void handlePreviewPdf()}
              >
                {isPreviewingPdf ? "Generating..." : "Preview Sample PDF"}
              </button>
              <button
                type="submit"
                className="financeImportSubmit"
                disabled={busy || !canManageInvoices}
              >
                {busy ? "Saving..." : "Save Invoice Settings"}
              </button>
            </div>
          </form>
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
