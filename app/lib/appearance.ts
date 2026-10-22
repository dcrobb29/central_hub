export const THEME_NAMES = {
  light: "Light",
  dark: "Dark",
  custom: "Custom",
  "contrast-light": "High-contrast Light",
  "contrast-dark": "High-contrast Dark",
  vision: "Color-vision-friendly",
} as const;

export type ThemeName = keyof typeof THEME_NAMES;
export type Palette = { page: string; surface: string; accent: string; text: string };
export type Appearance = {
  followSystem: boolean;
  slotA: ThemeName;
  slotB: ThemeName;
  activeSlot: "A" | "B";
  custom: Palette;
};

export const PALETTES: Record<Exclude<ThemeName, "custom">, Palette> = {
  light: { page: "#eaf0ed", surface: "#ffffff", accent: "#1f604e", text: "#20362d" },
  dark: { page: "#101916", surface: "#1b2923", accent: "#80cfb0", text: "#edf5f0" },
  "contrast-light": { page: "#ffffff", surface: "#ffffff", accent: "#003c88", text: "#000000" },
  "contrast-dark": { page: "#000000", surface: "#000000", accent: "#ffdf00", text: "#ffffff" },
  vision: { page: "#f4f4f4", surface: "#ffffff", accent: "#005a8d", text: "#18232d" },
};

export function defaultAppearance(): Appearance {
  return { followSystem: true, slotA: "light", slotB: "dark", activeSlot: "A", custom: { ...PALETTES.light } };
}

export function parseAppearance(value: unknown): Appearance | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  const keys = ["followSystem", "slotA", "slotB", "activeSlot", "custom"];
  if (Object.keys(v).length !== keys.length || Object.keys(v).some(key => !keys.includes(key))) return null;
  const isTheme = (name: unknown): name is ThemeName => typeof name === "string" && Object.hasOwn(THEME_NAMES, name);
  if (typeof v.followSystem !== "boolean" || !isTheme(v.slotA) || !isTheme(v.slotB)
    || (v.activeSlot !== "A" && v.activeSlot !== "B")
    || !v.custom || typeof v.custom !== "object" || Array.isArray(v.custom)) return null;
  const custom = v.custom as Record<string, unknown>;
  const colors = ["page", "surface", "accent", "text"] as const;
  if (Object.keys(custom).length !== 4 || colors.some(key => typeof custom[key] !== "string" || !/^#[0-9a-f]{6}$/i.test(custom[key]))) return null;
  return {
    followSystem: v.followSystem, slotA: v.slotA, slotB: v.slotB, activeSlot: v.activeSlot,
    custom: {
      page: String(custom.page).toLowerCase(), surface: String(custom.surface).toLowerCase(),
      accent: String(custom.accent).toLowerCase(), text: String(custom.text).toLowerCase(),
    },
  };
}

export function activeTheme(preferences: Appearance, systemDark: boolean): ThemeName {
  return preferences.followSystem ? (systemDark ? "dark" : "light")
    : preferences.activeSlot === "A" ? preferences.slotA : preferences.slotB;
}

export function toggledAppearance(preferences: Appearance, systemDark: boolean): Appearance {
  const active = activeTheme(preferences, systemDark);
  const activeSlot = preferences.followSystem
    ? (active === preferences.slotB ? "A" : "B")
    : (preferences.activeSlot === "A" ? "B" : "A");
  return { ...preferences, followSystem: false, activeSlot };
}

export function themePalette(preferences: Appearance, systemDark: boolean): Palette {
  const theme = activeTheme(preferences, systemDark);
  return theme === "custom" ? preferences.custom : PALETTES[theme];
}

function luminance(color: string): number {
  const channels = [1, 3, 5].map(start => {
    const c = parseInt(color.slice(start, start + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

export function contrastRatio(a: string, b: string): number {
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

export function paletteWarnings(palette: Palette): string[] {
  const warnings: string[] = [];
  for (const [label, foreground, background, minimum] of [
    ["Text on page", palette.text, palette.page, 4.5],
    ["Text on panels", palette.text, palette.surface, 4.5],
    ["Accent links on page", palette.accent, palette.page, 4.5],
    ["Accent links on panels", palette.accent, palette.surface, 4.5],
  ] as const) {
    const ratio = contrastRatio(foreground, background);
    if (ratio < minimum) warnings.push(`${label}: ${ratio.toFixed(2)}:1 (recommended ${minimum}:1).`);
  }
  return warnings;
}

export function paletteIsDark(palette: Palette): boolean {
  return luminance(palette.surface) < 0.179;
}

export function accentForeground(palette: Palette): string {
  return contrastRatio(palette.accent, "#ffffff") >= contrastRatio(palette.accent, "#000000") ? "#ffffff" : "#000000";
}

// Signed-out preferences are separate from account preferences and only support Light/Dark.
export const APPEARANCE_CACHE_KEY = "overhead-signed-out-appearance-v1";

export function signedOutAppearance(value: unknown): Appearance {
  const parsed = parseAppearance(value);
  if (!parsed || parsed.slotA !== "light" || parsed.slotB !== "dark") return defaultAppearance();
  return { ...defaultAppearance(), followSystem: parsed.followSystem, activeSlot: parsed.activeSlot };
}

// Runs before hydration; keep its dependencies inside this function.
function bootstrap(palettes: typeof PALETTES, cacheKey: string) {
  try {
    const root = document.documentElement;
    const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    let palette = palettes[systemDark ? "dark" : "light"];
    let theme: string = systemDark ? "dark" : "light";
    const raw = localStorage.getItem(cacheKey);
    if (raw) {
      const p = JSON.parse(raw);
      if (p && typeof p.followSystem === "boolean" && ["A", "B"].includes(p.activeSlot)
        && p.slotA === "light" && p.slotB === "dark") {
        const name = p.followSystem ? theme : p[p.activeSlot === "A" ? "slotA" : "slotB"];
        if (name === "light" || name === "dark") {
          const candidate = name === "dark" ? palettes.dark : palettes.light;
          if (candidate && ["page", "surface", "accent", "text"].every(key => /^#[0-9a-f]{6}$/i.test(candidate[key as keyof Palette]))) {
            palette = candidate;
            theme = name;
          }
        }
      }
    }
    for (const key of ["page", "surface", "accent", "text"] as const) root.style.setProperty(`--theme-${key}`, palette[key]);
    const lum = (hex: string) => {
      const c = [1, 3, 5].map(i => {
        const x = parseInt(hex.slice(i, i + 2), 16) / 255;
        return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
      });
      return c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;
    };
    const accent = lum(palette.accent);
    root.style.setProperty("--theme-on-accent", (1.05 / (accent + 0.05)) >= ((accent + 0.05) / 0.05) ? "#ffffff" : "#000000");
    root.dataset.theme = theme;
    root.dataset.tone = lum(palette.surface) < 0.179 ? "dark" : "light";
  } catch {
    console.warn("Unable to load cached appearance; using system theme");
  }
}

export const APPEARANCE_BOOTSTRAP = `(${bootstrap.toString()})(${JSON.stringify(PALETTES)},${JSON.stringify(APPEARANCE_CACHE_KEY)});`;
