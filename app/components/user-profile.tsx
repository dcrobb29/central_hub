"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import ProfileModal from "./profile-modal";
import SettingsModal from "./settings-modal";
import AppearanceModal from "./appearance-modal";
import { useAccountSession } from "./account-session-context";

export default function UserProfile() {
  const { session, loading, refreshSession, updateSessionLocally } = useAccountSession();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [activeModal, setActiveModal] = useState<"profile" | "settings" | "appearance" | null>(null);

  const menuRoot = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isMenuOpen) return;
    function dismissMenu(event: PointerEvent) {
      if (event.target instanceof Node && !menuRoot.current?.contains(event.target)) {
        setIsMenuOpen(false);
      }
    }
    function dismissOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setIsMenuOpen(false);
    }
    document.addEventListener("pointerdown", dismissMenu);
    document.addEventListener("keydown", dismissOnEscape);
    return () => {
      document.removeEventListener("pointerdown", dismissMenu);
      document.removeEventListener("keydown", dismissOnEscape);
    };
  }, [isMenuOpen]);

  async function handleSignOut() {
    setIsMenuOpen(false);
    try {
      await fetch("/api/account/logout", { method: "POST" });
    } catch {
      // Ignore network errors on logout
    }
    updateSessionLocally(() => null);
    window.location.href = "/login";
  }

  if (loading) {
    return (
      <div className="userProfile">
        <span className="userName" style={{ opacity: 0.6 }}>Loading...</span>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="userProfile">
        <Link href="/login" className="userProfileSignInLink">
          Sign in
        </Link>
      </div>
    );
  }

  const firstName = session.user.displayName.trim().split(/\s+/)[0] || session.user.displayName;
  const primaryRole = session.roles.map((r) => r.roleName).join(", ") || "Member";

  return (
    <div className="userProfile">
      <span className="userName">{firstName}</span>
      <div className="userAvatarControl" ref={menuRoot}>
        <button
          type="button"
          className="userAvatarButton"
          aria-label="Open account menu"
          aria-haspopup="menu"
          aria-expanded={isMenuOpen}
          aria-controls="userAccountMenu"
          onClick={() => setIsMenuOpen((open) => !open)}
        >
          <img className="userAvatar" src="/personnelLogo.png" alt="" />
        </button>
        {isMenuOpen && (
          <div id="userAccountMenu" role="menu" className="userAccountMenu">
            <div className="userAccountMenuHeader">
              <span className="userAccountMenuName">{session.user.displayName}</span>
              <span className="userAccountMenuOrg">{session.organization.organizationName}</span>
              <span className="userAccountMenuRole">{primaryRole}</span>
            </div>
            <button
              type="button"
              role="menuitem"
              className="userAccountMenuItem"
              onClick={() => {
                setIsMenuOpen(false);
                setActiveModal("profile");
              }}
            >
              Profile
            </button>
            {session.permissions.includes("organization.manage") && <button
              type="button"
              role="menuitem"
              className="userAccountMenuItem"
              onClick={() => {
                setIsMenuOpen(false);
                setActiveModal("settings");
              }}
            >
              Settings
            </button>}
            <button
              type="button"
              role="menuitem"
              className="userAccountMenuItem"
              onClick={() => void handleSignOut()}
            >
              Sign out
            </button>
          </div>
        )}
      </div>

      {activeModal === "appearance" && <AppearanceModal onClose={() => setActiveModal(null)} />}
      {activeModal === "profile" && (
        <ProfileModal
          session={session}
          onClose={() => setActiveModal(null)}
          onSessionUpdated={(updated) => updateSessionLocally(() => updated)}
          onVisualizations={() => setActiveModal("appearance")}
        />
      )}

      {activeModal === "settings" && session.permissions.includes("organization.manage") && (
        <SettingsModal
          session={session}
          onClose={() => {
            setActiveModal(null);
            void refreshSession();
          }}
          onOrganizationRenamed={(name) => {
            updateSessionLocally((prev) =>
              prev
                ? {
                    ...prev,
                    organization: { ...prev.organization, organizationName: name },
                  }
                : null,
            );
          }}
        />
      )}
    </div>
  );
}
