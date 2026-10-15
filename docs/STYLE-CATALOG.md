# Central Hub style catalog

This developer-only document is the central index for the application's shared
visual language. The actual shared CSS lives in
[design-system.css](../app/design-system.css), with component-specific layout
modules indexed below. There is no style-reference page or menu in the app.

This pass consolidates foundations, not the brand redesign. Existing variants
are documented so differences can be chosen deliberately rather than accidentally
spread. No business features or API contracts have been removed.

## Where to change a style

| Responsibility | Source |
| --- | --- |
| Semantic color, radius, spacing and action tokens; shared action recipes and compatibility aliases | [design-system.css](../app/design-system.css) |
| Typed native button with semantic variants | [button.tsx](../app/components/button.tsx) |
| Workspace heading, search row, filter launcher/dialog, local record navigation | [workspace-ui.tsx](../app/components/workspace-ui.tsx), [workspace-ui.module.css](../app/components/workspace-ui.module.css) |
| Portfolio page, summary card, empty state, record-opening action and responsive layout | [record-workspace.module.css](../app/components/record-workspace.module.css) |
| Shared modal and nested Escape dismissal | [modal.tsx](../app/components/modal.tsx) |
| Projects/Sales status + sort controls | [list-view-controls.tsx](../app/components/list-view-controls.tsx) |
| Search/filter/sort/page mechanics | [use-filterable-table.ts](../app/lib/use-filterable-table.ts) |
| Pagination controls | [table-pagination.tsx](../app/components/table-pagination.tsx) |
| Shell, fallback interaction/focus styles, remaining legacy recipes | [styles.css](../app/styles.css) |

Global import order in [layout.tsx](../app/layout.tsx) is Tailwind/globals,
design-system, then existing application styles. Compatibility rules were
moved, not copied; tile-specific overrides continue to apply. Do not add a
second copy of a shared recipe to a tile stylesheet.

## Buttons and links: compare these together

The table below groups shared and tile-specific action variants together.
Use their source files to compare geometry, colors and interaction states;
verify changes on the actual tiles, including enabled, disabled, saving,
hover and keyboard-focus states.

### Shared semantic API

```tsx
<Button onClick={openCreate}>New record</Button>
<Button variant="secondary" onClick={close}>Cancel</Button>
<Button variant="danger" type="submit" disabled={saving}>Delete</Button>
<Button variant="text" onClick={openDetails}>View details</Button>
<Button variant="dangerText" onClick={confirmDelete}>Delete record</Button>
```

`Button` accepts native button props, including `type`, `disabled`, accessible
labels, `aria-busy`, events and form attributes. It defaults to `type="button"`;
submission must be explicit. It does not infer permissions, mutate records or
swallow errors. For icon-only controls, provide an accessible name. Loading
labels and disabled states remain owned by each business workflow.

| Family / current name | Appearance | Current usage / decision |
| --- | --- | --- |
| `Button`: primary | Filled green `#1f604e`, 40px minimum, 12px action type | Sales New estimate; Files Import, Import files and Create folder. Default for new primary actions. |
| `Button`: secondary | White surface, green outline/text | Files folder-form Cancel; shared companion recipe for new actions. |
| `Button`: danger | Filled red `#8a2f29` | Available semantic recipe; existing delete confirmations use the compatibility alias below. |
| `Button`: text / dangerText | Underlined green / red, transparent surface | Available semantic utility recipes. New controls retain a 40px interaction area; legacy compact inline actions remain compact. |
| `financeImportButton` | Filled primary, inline icon gap, 36px base, 12px horizontal padding | Sales, Finance and shared imports. Workspaces may raise height to 40px. Now shares the central primary recipe. |
| `financeImportSubmit` | Filled primary, 36px base, 13px horizontal padding | Existing shared forms and filter-dialog Done. Central compatibility alias. |
| `financeImportCancel` | White/green, same compact geometry as Submit | Existing dialog Cancel and Reset. Central compatibility alias. |
| `financeImportDanger` | Red/white, same compact geometry | Existing delete confirmations. Central compatibility alias. |
| `estimateTextAction` / `estimateWinAction` | Underlined green, no padding/border, 12px type | Sales inline record utilities. Shared text-action recipe, preserved density. Win retains its existing wait cursor when disabled. |
| `estimateDangerAction` | Underlined red | Sales inline deletion; same shared recipe with danger color. |
| `personnelButtonPrimary` / `personnelButtonSecondary` | Darker green `#183e35`, 13px type, 38px base / 40px in workspace | People Add person, Manage roles and forms. Deliberately retained as a visible legacy difference, not a second recommended default. |
| `openRecord` (shared module) | Filled `#176347`, 13px type, icon gap, 4px radius | Projects, Sales, People, Finance, Files portfolio cards. A real link when navigating, a real button for local workspace state. Kept distinct from form actions for now. |
| `projectWorkspaceLink` | Outlined green, padded, no underline | Projects/Field navigation; Files folder/back/download actions. Files adds a 40px minimum and wrapping. |
| Finance `textButton` | Underlined name, inherited type | Finance card names open local records. Keep native button semantics. |
| Files `name` | Underlined name plus file/folder icon | Files folder and preview names. Kept separate from Finance name layout. |
| `fieldIconButton`, `fieldAddTaskButton` | Compact outline; dashed outline for adding tasks | Planner-specific controls. Do not flatten drag/drop and nested task controls into portfolio buttons. |
| `listFilterButton` | Outlined utility with sliders icon and active dot | All common filter launchers now use `FilterButton`. Active state has an accessible label, not just color. |
| Standard hyperlink | Green, underlined; stronger underline on hover | Inline navigation. Do not remove its affordance or use a clickable span. |

Additional legacy surfaces remain in [styles.css](../app/styles.css): table
header/sort/filter controls, account/menu controls, old `importButton`, billing
toggles and scheduler-specific remove/assign controls. They are not new
recommended button families and have not been indiscriminately restyled.
This document is a shared-workspace catalog, not an exhaustive inventory of every
nested editor, export and account setting.

## Cross-tile component coverage

| Surface | Projects | Sales | Field | People | Finances | Files |
| --- | --- | --- | --- | --- | --- | --- |
| Compact portfolio cards / shared CSS | Yes | Yes | Specialized week/day cards | Yes | Yes | Yes |
| `WorkspaceHeading` | Existing portfolio heading retained | Yes | Week navigation retained | Directory | Collection + focused record | Folder + focused preview |
| `SearchToolbar` | Existing collection controls | Existing collection controls | Planner controls | Directory | All four collections | Current folder |
| `FilterButton` / `FiltersDialog` | Via ListViewControls | Via ListViewControls | Planner dialogs retained | Directory | All four collections | Type + name order |
| Shared Modal | Yes | Yes | Yes | Yes | Yes | Yes |
| Shared semantic Button API | Existing aliases/styles | New estimate | Existing styles | Existing styles | Existing aliases/styles | Import + folder form |
| Central action recipes via legacy aliases | Existing dialogs | Yes | Existing dialogs | Existing dialogs | Yes | Yes |
| Record-section navigation | URL links | URL links | Planner views | URL links | `RecordTabs` local buttons | Preview/back, no artificial tabs |
| Existing shared pagination | Where already used | Where already used | Not applicable | Directory has no paging | Yes | Folder has no paging |

### What was actually consolidated

- Removed duplicate action recipes from the large global stylesheet and put
  their shared definitions/semantic variants in the central foundation file.
  Existing class names continue to work, including in forms not converted to
  the typed Button API.
- Replaced separately maintained heading, search row and filter dialog markup
  on the surfaces marked above with real shared components.
- Removed superseded Finance/Files heading and search-sizing rules and Sales'
  duplicate header layout rule.
- Kept Finance collection/search algorithms, upload state, People data loading
  and the Projects/Sales query/filter logic in their existing owners.
- Tokenized the shared card/empty-state/open-record styles and selected
  workspace backgrounds/gaps. Preserved current palette values.

The only small normalization for migrated Button instances is a 40px minimum
interaction area, including the Files folder form and import-file chooser.
Compact legacy dialog aliases remain 36px unless a workspace overrides them.

## Navigation and progressive disclosure

| Pattern | Use | Intentional difference |
| --- | --- | --- |
| Status/collection switch | Projects/Sales status filter; Finance card/table choice | Pressed/selected states must remain visible; domain counts stay in callers. |
| Local record sections | Finance Overview / All details | `RecordTabs` renders buttons with `aria-pressed`; no misleading URL navigation. |
| Route-backed record sections | Projects, Sales, People | Keep Next links, `aria-current` and bookmarkable query/path state. Do not convert them to local-only buttons to share markup. |
| Filter dialog | Projects/Sales/People/Finance/Files | Shared launcher, title, Reset/Done row; field contents, reset behavior and help text stay domain-specific. |
| Advanced details | Scope, allocations, metadata, secondary configuration | Native details/summary. Hidden by default when secondary, never removed. |
| Anchored library disclosure | Sales Libraries | Retains its anchored popout instead of forcing it into a large dialog. |
| Planner day/week/availability controls | Field Operations | Time navigation and resource assignment are task-specific, not ordinary record tabs. |

## Cards, type, fields and feedback

- Portfolio cards expose identity, status, a key value, then named actions.
  Avoid entire-card hidden click targets.
- `WorkspaceHeading` owns the eyebrow/title/action-row markup. People keeps a
  muted eyebrow. Existing focused heading refs and programmatic focus survive.
- Labeled fields use the existing `financeImportField` recipe and native
  validation. This pass does not replace business forms with a schema engine.
- Errors remain explicit and separate from success/loading. Recovery is a named
  action. Empty states are not success-shaped substitutes for failed requests.
- Main workspace titles remain 24px; card identity is generally 16px; common
  actions are 12px/600 Arial, legacy People and open-record actions 13px.
  The application uses its existing Geist setup elsewhere. Font unification is
  a later deliberate design decision, not silently mixed into this refactor.
- Modal remains the existing shared dialog, including nested Escape dismissal
  and close-disabled behavior. A new focus-trap/inert-background implementation
  has not been added as part of this styling pass.

## Token reference

| Token | Current value / purpose |
| --- | --- |
| `--ui-color-page` | `#eaf0ed`, shared page background |
| `--ui-color-surface` | `#fff`, shared cards/dialog actions |
| `--ui-color-text` / `--ui-color-muted` | `#20362d` / `#53675d` |
| `--ui-color-border` | `#d0dad4`, shared card/empty borders |
| `--ui-color-primary` / `--ui-color-primary-hover` | `#1f604e` / `#164b3b` |
| `--ui-color-record-action` | `#176347`, open-record/link/focus accent |
| `--ui-color-people-action` | `#183e35`, retained People exception |
| `--ui-color-danger` | `#8a2f29` |
| `--ui-color-eyebrow` / `--ui-color-people-eyebrow` | `#80502f` / `#58716a` |
| `--ui-control-height` | `40px`, new Button minimum |
| `--ui-radius-control` / `--ui-radius-panel` | `3px` / `6px` |
| `--ui-space-workspace` | `20px`, shared portfolio / Finance / Files gaps |
| `--ui-font-action` | `600 12px Arial, sans-serif` |

**Not every CSS literal is tokenized yet.** Specialized editors, scheduler
colors, table geometry, PDF styles, older forms and tile-only details still have
local styling. Changing a token only affects its actual consumers. Keep
intentional variants documented here rather than claiming a universal theme
switch that does not yet exist.

## Responsive and interaction contract

- Compact: below 640px; small: 640px+; medium: 768px+; large: 1024px+;
  XL: 1280px+. Existing portfolio card/metadata breakpoints are retained.
- Controls wrap, long names do not force viewport overflow, and touch targets
  remain visible. Tables may scroll inside their own container.
- The shell stays viewport-contained: header/footer do not require outer-page
  scrolling. Long content scrolls inside the application.
- Buttons perform actions; anchors navigate/download; disclosure summaries
  expand. All must remain visibly interactive and keyboard identifiable.
- Use actual tile checks at 320px, 640px, 768px, 1024px, 1280px
  and 1920px when changing shared styles. Check hover, focus, disabled,
  active/selected, loading, errors, empty content and long labels.

## Next visual-design decisions

1. Choose whether People/form/open-record greens should become one accent or
   remain documented semantic levels.
2. Choose a uniform typography and control-radius scale.
3. Apply that decision to the shared recipes first, compare affected tiles, then
   migrate documented local exceptions in bounded passes.
4. Keep scheduling, charts, document previews and customer PDF presentation
   separate where their job genuinely differs.

For any new shared variant, update the production CSS recipe and this usage
matrix. Prefer extending a real shared component over adding
another near-identical tile class.
