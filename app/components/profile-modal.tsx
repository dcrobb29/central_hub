"use client";

import { useState } from "react";
import Modal from "@/app/components/modal";
import type { AccountSession } from "@/app/lib/account";

export default function ProfileModal({
  session,
  onClose,
  onSessionUpdated,
}: {
  session: AccountSession;
  onClose: () => void;
  onSessionUpdated: (updated: AccountSession) => void;
}) {
  const [displayName, setDisplayName] = useState(session.user.displayName);
  const [phone, setPhone] = useState(session.user.phone ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/account/session", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: session.user.userId,
          displayName,
          phone: phone.trim() || null,
        }),
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to update profile");

      setSuccess("Profile updated successfully.");
      onSessionUpdated(result as AccountSession);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save profile");
    } finally {
      setBusy(false);
    }
  }

  const primaryRole = session.roles.map((r) => r.roleName).join(", ") || "Member";

  return (
    <Modal
      titleId="userProfileModalTitle"
      title="User Profile"
      eyebrow="ACCOUNT &amp; IDENTITY"
      onClose={onClose}
      closeDisabled={busy}
      className="accountProfileModal"
    >
      <form onSubmit={handleSubmit} className="accountProfileForm">
        {error && <p className="financeImportError" role="alert">{error}</p>}
        {success && <p className="billingNotice" role="status">{success}</p>}

        <div className="accountProfileSummaryHeader">
          <img src="/personnelLogo.png" alt="" className="accountProfileSummaryAvatar" />
          <div className="accountProfileSummaryText">
            <h3 className="accountProfileSummaryName">{session.user.displayName}</h3>
            <div className="accountProfileSummaryOrgRole">
              <span className="accountProfileOrgName">{session.organization.organizationName}</span>
              <span className="accountProfileDot">•</span>
              <span className="accountProfileRoleBadge">{primaryRole}</span>
              <span className="accountProfileDot">•</span>
              <span className="accountBadge">{session.organization.status}</span>
            </div>
          </div>
        </div>

        <fieldset className="financeImportGroup">
          <legend>Organization &amp; Roles</legend>
          <div className="accountInfoGrid">
            <div>
              <span className="accountInfoLabel">Organization</span>
              <strong className="accountInfoValue">{session.organization.organizationName}</strong>
            </div>
            <div>
              <span className="accountInfoLabel">Account Status</span>
              <span className="accountBadge">{session.organization.status}</span>
            </div>
            <div>
              <span className="accountInfoLabel">Assigned Role(s)</span>
              <div className="accountRolesList">
                {session.roles.map((r) => (
                  <span key={r.accessRoleId} className="accountRolePill">
                    {r.roleName}
                  </span>
                ))}
              </div>
            </div>
            <div>
              <span className="accountInfoLabel">Linked Personnel / Field Record</span>
              <div className="accountLinkedInfo">
                {session.linkedEmployee ? (
                  <>
                    <strong>{session.linkedEmployee.name}</strong> ({session.linkedEmployee.roleName})
                    {session.linkedEmployee.managerName && (
                      <small className="accountMeta">Reports to: {session.linkedEmployee.managerName}</small>
                    )}
                  </>
                ) : (
                  <span className="accountMeta">Not linked to a personnel hierarchy entry</span>
                )}
              </div>
            </div>
          </div>
        </fieldset>

        <fieldset className="financeImportGroup">
          <legend>Contact Information</legend>
          <div className="financeImportFields">
            <label className="financeImportField">
              Email (read-only login identity)
              <input value={session.user.email} disabled readOnly />
            </label>
            <label className="financeImportField">
              Display Name *
              <input
                value={displayName}
                maxLength={150}
                required
                disabled={busy}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </label>
            <label className="financeImportField">
              Phone Number
              <input
                value={phone}
                maxLength={50}
                placeholder="(555) 000-0000"
                disabled={busy}
                onChange={(e) => setPhone(e.target.value)}
              />
            </label>
          </div>
        </fieldset>

        <div className="financeImportActions">
          <button type="button" className="financeImportCancel" disabled={busy} onClick={onClose}>
            Close
          </button>
          <button type="submit" className="financeImportSubmit" disabled={busy}>
            {busy ? "Saving..." : "Save changes"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
