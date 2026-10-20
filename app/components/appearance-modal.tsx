"use client";

import { useEffect, useState } from "react";
import Modal from "./modal";
import { useAppearance } from "./appearance-provider";
import { THEME_NAMES, defaultAppearance, paletteWarnings, parseAppearance, type Appearance, type ThemeName } from "@/app/lib/appearance";

export default function AppearanceModal({ onClose }: { onClose: () => void }) {
  const { preferences, ready, busy, error, save, preview } = useAppearance();
  const [draft, setDraft] = useState<Appearance>(preferences);
  const [saved, setSaved] = useState(false);
  useEffect(() => () => preview(null), [preview]);
  const change = (next: Appearance) => {
    setDraft(next);
    setSaved(false);
    preview(next);
  };
  const close = () => { if (!busy) { preview(null); onClose(); } };
  const warnings = paletteWarnings(draft.custom);
  const themeSelect = (slot: "slotA" | "slotB", label: string) => <label className="financeImportField">
    {label}
    <select value={draft[slot]} disabled={busy || !ready}
      onChange={event => change({ ...draft, [slot]: event.target.value as ThemeName })}>
      {Object.entries(THEME_NAMES).map(([value, name]) => <option key={value} value={value}>{name}</option>)}
    </select>
  </label>;
  return <Modal titleId="appearanceTitle" title="Visualizations" eyebrow="YOUR PREFERENCES"
    onClose={close} closeDisabled={busy} className="appearanceModal">
    <form className="accountProfileForm" onSubmit={event => {
      event.preventDefault();
      void save(draft).then(ok => { if (ok) setSaved(true); });
    }}>
      <p>Choose two themes for the header toggle. Preferences follow your account across devices.</p>
      {error && <p role="alert" className="financeImportError">{error}</p>}
      {!ready && <p role="status">Appearance preferences are not available yet.</p>}
      {saved && <p role="status">Appearance saved.</p>}
      <fieldset className="financeImportGroup" disabled={busy || !ready}>
        <legend>Theme toggle</legend>
        <label className="appearanceCheck"><input type="checkbox" checked={draft.followSystem}
          onChange={event => change({ ...draft, followSystem: event.target.checked })} /> Follow system (Light / Dark)</label>
        <div className="appearanceGrid">
          {themeSelect("slotA", "Slot A")}
          {themeSelect("slotB", "Slot B")}
          <label className="financeImportField">Active slot
            <select value={draft.activeSlot} disabled={draft.followSystem}
              onChange={event => change({ ...draft, activeSlot: event.target.value === "A" ? "A" : "B" })}>
              <option value="A">A</option><option value="B">B</option>
            </select>
          </label>
        </div>
        <p>Following system ignores the slots. Using the header toggle switches to your selected slots.</p>
      </fieldset>
      <fieldset className="financeImportGroup" disabled={busy || !ready}>
        <legend>Custom palette</legend>
        <p>Select Custom in a slot and activate it to preview these colors throughout the app.</p>
        <div className="appearanceGrid">
          {(["page", "surface", "accent", "text"] as const).map(key => <label key={key} className="financeImportField">
            {{ page: "Page background", surface: "Panel background", accent: "Accent / actions", text: "Text" }[key]}
            <div className="appearanceColor">
              <input type="color" aria-label={`${key} color`} value={draft.custom[key]}
                onChange={event => change({ ...draft, custom: { ...draft.custom, [key]: event.target.value } })} />
              <input aria-label={`${key} hexadecimal color`} value={draft.custom[key]} maxLength={7} pattern="#[0-9a-fA-F]{6}" required
                onChange={event => {
                  const next = { ...draft, custom: { ...draft.custom, [key]: event.target.value } };
                  setDraft(next);
                  setSaved(false);
                  if (parseAppearance(next)) preview(next);
                }} />
            </div>
          </label>)}
        </div>
        {parseAppearance(draft) && warnings.length > 0 && <div role="status" className="appearanceWarning">
          <strong>Custom palette contrast warning</strong>
          <ul>{warnings.map(warning => <li key={warning}>{warning}</li>)}</ul>
          <p>You can still save. Derived muted, hover, and selected states may also need visual review.</p>
        </div>}
      </fieldset>
      <p>High-contrast and color-vision-friendly presets are starting points, not a guarantee for every visual impairment.
        Status labels remain visible. PDF and email styling is unchanged.</p>
      <div className="financeImportActions">
        <button type="button" className="financeImportCancel" disabled={busy || !ready} onClick={() => change(defaultAppearance())}>Reset to defaults</button>
        <button type="button" className="financeImportCancel" disabled={busy} onClick={close}>Cancel / close</button>
        <button type="submit" className="financeImportSubmit" disabled={busy || !ready || !parseAppearance(draft)}>{busy ? "Saving..." : "Save appearance"}</button>
      </div>
    </form>
  </Modal>;
}
