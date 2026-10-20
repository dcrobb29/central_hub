import assert from "node:assert/strict";
import { test } from "node:test";
import vm from "node:vm";
import fs from "node:fs";
import {
  APPEARANCE_BOOTSTRAP, APPEARANCE_CACHE_KEY, PALETTES, accentForeground, activeTheme,
  contrastRatio, defaultAppearance, paletteWarnings, parseAppearance, themePalette, toggledAppearance,
} from "./appearance.ts";

test("appearance defaults follow the system and the toggle exits system mode in either direction", () => {
  const p = defaultAppearance();
  assert.equal(activeTheme(p, false), "light");
  assert.equal(activeTheme(p, true), "dark");
  assert.equal(activeTheme(toggledAppearance(p, true), true), "light");
  assert.equal(activeTheme(toggledAppearance(p, false), false), "dark");
  p.followSystem = false;
  p.slotB = "custom";
  assert.deepEqual(themePalette(toggledAppearance(p, false), false), p.custom);
  assert.equal(toggledAppearance(toggledAppearance(p, false), false).activeSlot, "A");
});

test("validation accepts only the complete preference shape and safe six-digit colors", () => {
  assert.deepEqual(parseAppearance(defaultAppearance()), defaultAppearance());
  for (const patch of [
    { userId: 99 }, { slotA: "__proto__" }, { followSystem: "true" }, { activeSlot: "C" },
    { custom: { ...PALETTES.light, text: "red; background:url(https://example.com)" } },
    { custom: { ...PALETTES.light, text: "#fff" } }, { custom: [] },
    { custom: { ...PALETTES.light, unexpected: "#000000" } },
  ]) assert.equal(parseAppearance({ ...defaultAppearance(), ...patch }), null);
  assert.equal(parseAppearance(null), null);
});

test("contrast calculations warn without blocking low-contrast valid palettes", () => {
  assert.equal(contrastRatio("#ffffff", "#000000"), 21);
  assert.equal(contrastRatio("#ffffff", "#ffffff"), 1);
  const custom = { page: "#ffffff", surface: "#ffffff", accent: "#ffffff", text: "#ffffff" };
  assert.equal(paletteWarnings(custom).length, 4);
  assert.ok(parseAppearance({ ...defaultAppearance(), custom }));
  for (const palette of Object.values(PALETTES)) {
    assert.deepEqual(paletteWarnings(palette), []);
    assert.ok(contrastRatio(palette.accent, accentForeground(palette)) >= 4.5);
  }
  assert.notEqual(defaultAppearance().custom, defaultAppearance().custom);
});

function bootstrap(cached, systemDark = false) {
  const properties = {};
  const root = { dataset: {}, style: { setProperty(key, value) { properties[key] = value; } } };
  vm.runInNewContext(APPEARANCE_BOOTSTRAP, {
    document: { documentElement: root },
    window: { matchMedia: () => ({ matches: systemDark }) },
    localStorage: { getItem: key => { assert.equal(key, APPEARANCE_CACHE_KEY); return cached; } },
    console: { warn() {} },
  });
  return { properties, root };
}

test("prepaint bootstrap follows system or validated cache and cannot inject CSS", () => {
  assert.equal(bootstrap(null, true).root.dataset.theme, "dark");
  const p = { ...defaultAppearance(), followSystem: false, slotA: "custom" };
  p.custom.accent = "#123456";
  const result = bootstrap(JSON.stringify(p), true);
  assert.equal(result.properties["--theme-accent"], "#123456");
  assert.equal(result.root.dataset.theme, "custom");
  p.custom.accent = "url(https://example.com)";
  assert.equal(bootstrap(JSON.stringify(p)).properties["--theme-accent"], PALETTES.light.accent);
  assert.equal(bootstrap("invalid JSON").root.dataset.theme, undefined);
});

test("legacy stylesheets use theme tokens rather than literal UI colors", () => {
  const root = new URL("../", import.meta.url);
  for (const file of fs.readdirSync(root, { recursive: true })) {
    if (!file.endsWith(".css") || ["appearance.css", "design-system.css"].includes(file)) continue;
    const css = fs.readFileSync(new URL(file.replaceAll("\\", "/"), root), "utf8");
    assert.doesNotMatch(css.replace(/\/\*[\s\S]*?\*\//g, ""), /#[0-9a-f]{3,8}\b|rgba?\(/i, file);
  }
});
