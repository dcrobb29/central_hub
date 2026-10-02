"use client";

import { useEffect, useRef, useState } from "react";

function UserProfile() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  // Wraps the avatar button *and* the popout menu so the outside-click check
  // below doesn't treat a click on the avatar itself as "outside".
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

  return (
    <div className="userProfile">
      <span className="userName">User Name</span>
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
            {/* Account data/actions aren't defined yet — these are stubbed in so the menu is ready to wire up. */}
            <button type="button" role="menuitem" className="userAccountMenuItem" disabled title="Coming soon">Profile</button>
            <button type="button" role="menuitem" className="userAccountMenuItem" disabled title="Coming soon">Settings</button>
            <button type="button" role="menuitem" className="userAccountMenuItem" disabled title="Coming soon">Sign out</button>
          </div>
        )}
      </div>
    </div>
  );
}

export default UserProfile;
