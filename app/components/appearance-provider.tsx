//Name of palette preferences commented out. Uncomment if it starts to confuse users

"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useAccountSession } from "./account-session-context";
import { Sun, Moon } from "lucide-react";
import {
  APPEARANCE_CACHE_KEY, accentForeground, activeTheme, defaultAppearance, paletteIsDark,
  parseAppearance, themePalette, toggledAppearance, THEME_NAMES, type Appearance,
} from "@/app/lib/appearance";

function applyTheme(preferences: Appearance) {
  const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const palette = themePalette(preferences, dark);
  const root = document.documentElement;
  for (const key of ["page", "surface", "accent", "text"] as const) root.style.setProperty(`--theme-${key}`, palette[key]);
  root.style.setProperty("--theme-on-accent", accentForeground(palette));
  root.dataset.theme = activeTheme(preferences, dark);
  root.dataset.tone = paletteIsDark(palette) ? "dark" : "light";
}

type AppearanceContextValue = {
  preferences: Appearance;
  ready: boolean;
  busy: boolean;
  error: string | null;
  save: (preferences: Appearance) => Promise<boolean>;
  preview: (preferences: Appearance | null) => void;
};
const AppearanceContext = createContext<AppearanceContextValue | null>(null);

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const { session, loading } = useAccountSession();
  const userId = session?.user.userId;
  const currentUser = useRef(userId);
  const [preferences, setPreferences] = useState(defaultAppearance);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const previewRef = useRef<Appearance | null>(null);
  const savedRef = useRef(preferences);
  useEffect(() => { currentUser.current = userId; }, [userId]);

  const commit = useCallback((value: Appearance) => {
    savedRef.current = value;
    setPreferences(value);
    applyTheme(value);
    try {
      localStorage.setItem(APPEARANCE_CACHE_KEY, JSON.stringify(value));
    } catch {
      console.warn("Unable to cache appearance on this browser");
    }
  }, []);

  useEffect(() => {
    if (loading) return;
    let cancelled = false;
    const controller = new AbortController();
    previewRef.current = null;
    async function load() {
      setReady(false);
      setError(null);
      if (!userId) {
        try {
          const cached = localStorage.getItem(APPEARANCE_CACHE_KEY);
          commit(cached ? parseAppearance(JSON.parse(cached)) ?? defaultAppearance() : defaultAppearance());
        } catch {
          console.warn("Unable to read appearance cache");
          commit(defaultAppearance());
        }
        setReady(true);
        return;
      }
      // Never use another account's browser cache as this user's saved preferences.
      applyTheme(defaultAppearance());
      try {
        const response = await fetch("/api/account/appearance", { cache: "no-store", signal: controller.signal });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Unable to load appearance preferences.");
        const value = parseAppearance(body);
        if (!value) throw new Error("Invalid appearance response.");
        if (!cancelled) {
          commit(value);
          setReady(true);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unable to load appearance preferences.");
          console.error("Appearance preferences could not be loaded");
        }
      }
    }
    void load();
    return () => { cancelled = true; controller.abort(); };
  }, [loading, userId, commit]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const changed = () => applyTheme(previewRef.current ?? savedRef.current);
    media.addEventListener("change", changed);
    return () => media.removeEventListener("change", changed);
  }, []);

  const save = useCallback(async (value: Appearance) => {
    if (!ready || busy) return false;
    setBusy(true);
    setError(null);
    const savingUser = userId;
    try {
      let saved = value;
      if (savingUser) {
        const response = await fetch("/api/account/appearance", {
          method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(value),
        });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Unable to save appearance preferences.");
        const parsed = parseAppearance(body);
        if (!parsed) throw new Error("Invalid appearance response.");
        saved = parsed;
      }
      if (currentUser.current !== savingUser) return false;
      previewRef.current = null;
      commit(saved);
      return true;
    } catch (err) {
      if (currentUser.current === savingUser) setError(err instanceof Error ? err.message : "Unable to save appearance preferences.");
      return false;
    } finally {
      setBusy(false);
    }
  }, [ready, busy, userId, commit]);

  const preview = useCallback((value: Appearance | null) => {
    previewRef.current = value;
    applyTheme(value ?? savedRef.current);
  }, []);

  return <AppearanceContext.Provider value={{ preferences, ready, busy, error, save, preview }}>
    {children}
  </AppearanceContext.Provider>;
}

export function useAppearance() {
  const context = useContext(AppearanceContext);
  if (!context) throw new Error("AppearanceProvider is required.");
  return context;
}

export function ThemeToggle() {
  const { preferences, ready, busy, error, save } = useAppearance();
  const { session } = useAccountSession();
  return <div className="appearanceQuick">
    <button type="button" className="appearanceToggle" disabled={!ready || busy}
      aria-label="Switch appearance to the other theme slot"
      title={preferences.followSystem ? "Following system; switch to your saved themes" : `Current theme: ${THEME_NAMES[preferences.activeSlot === "A" ? preferences.slotA : preferences.slotB]}`}
      onClick={() => void save(toggledAppearance(preferences, window.matchMedia("(prefers-color-scheme: dark)").matches))}>
      <Sun size={16} aria-hidden="true" />
      {/* <span>{THEME_NAMES[preferences.slotA]}</span> */}
      <span className="appearanceSwitch" aria-hidden="true" data-slot={preferences.followSystem ? "system" : preferences.activeSlot}><span /></span>
      {/* <span>{THEME_NAMES[preferences.slotB]}</span> */}
      <Moon size={16} aria-hidden="true" />
    </button>
    {error && <span className="appearanceError" role="alert">{error}{session ? " Reopen the page to retry." : ""}</span>}
  </div>;
}
