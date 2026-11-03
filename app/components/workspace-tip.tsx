"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Info } from "lucide-react";
import styles from "./workspace-ui.module.css";

export default function WorkspaceTip({ label, children }: { label: string; children: ReactNode }) {
  const id = useId();
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const hovered = useRef(false);
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);

  function cancelClose() { clearTimeout(timer.current); }
  function close() {
    cancelClose();
    setOpen(false);
    setPinned(false);
  }
  function enter() {
    hovered.current = true;
    cancelClose();
    setOpen(true);
  }
  function leave() {
    hovered.current = false;
    cancelClose();
    timer.current = setTimeout(() => {
      if (!pinned && document.activeElement !== button.current) setOpen(false);
    }, 150);
  }

  useLayoutEffect(() => {
    const content = panel.current;
    if (!open || !content) return;
    // The native popover top layer avoids clipping inside scrollable dialogs.
    content.showPopover();
    function position() {
      if (!button.current || !content) return;
      const anchor = button.current.getBoundingClientRect();
      const bounds = content.getBoundingClientRect();
      const left = Math.max(12, Math.min(anchor.left, window.innerWidth - bounds.width - 12));
      const below = anchor.bottom + 6;
      const top = below + bounds.height <= window.innerHeight - 12 ? below : Math.max(12, anchor.top - bounds.height - 6);
      content.style.left = `${left}px`;
      content.style.top = `${top}px`;
    }
    position();
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    return () => {
      content.hidePopover();
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function outside(event: PointerEvent) {
      if (event.target instanceof Node && !button.current?.contains(event.target) && !panel.current?.contains(event.target)) {
        setOpen(false);
        setPinned(false);
      }
    }
    function escape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      // Dismiss the tip before an enclosing modal handles the same Escape.
      event.stopPropagation();
      setOpen(false);
      setPinned(false);
    }
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape, true);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape, true);
    };
  }, [open]);
  useEffect(() => () => clearTimeout(timer.current), []);

  return <span className={styles.tip}>
    <button ref={button} type="button" className={styles.tipButton} aria-label={`${label} information`}
      aria-expanded={open} aria-controls={id} aria-describedby={open ? id : undefined}
      onMouseEnter={enter} onMouseLeave={leave}
      onFocus={() => { cancelClose(); setOpen(true); }}
      onBlur={() => { if (!pinned && !hovered.current) setOpen(false); }}
      onClick={() => { if (pinned) close(); else { cancelClose(); setPinned(true); setOpen(true); } }}>
      <Info size={14} aria-hidden="true" />
    </button>
    <div ref={panel} id={id} popover="manual" role="tooltip" className={styles.tipPanel}
      onMouseEnter={enter} onMouseLeave={leave}>{children}</div>
  </span>;
}
