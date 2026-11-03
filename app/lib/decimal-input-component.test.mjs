import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { test } from "node:test";
import ts from "typescript";

// Exercise event handlers and controlled draft state without a DOM dependency.
const state = { value: undefined, dirty: false };
globalThis.decimalInputComponentTest = state;
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/app/lib/")) return nextResolve(new URL(`./${specifier.slice(10)}.ts`, import.meta.url).href, context);
    if (specifier === "./decimal-input" && context.parentURL?.endsWith("validated-input.tsx")) return nextResolve(new URL("../components/decimal-input.tsx", import.meta.url).href, context);
    if (specifier.startsWith("./") && !/\.[a-z]+$/.test(specifier)) return nextResolve(`${specifier}.ts`, context);
    if (specifier === "react") return { url: "test:decimal-react", shortCircuit: true };
    if (specifier === "react/jsx-runtime") return { url: "test:decimal-jsx", shortCircuit: true };
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === "test:decimal-react") return {
      format: "module", shortCircuit: true,
      source: `export function useId() { return "test-error"; }
      export function useState(initial) {
        const state = globalThis.decimalInputComponentTest;
        if (state.value === undefined) state.value = initial;
        return [state.value, value => { state.value = value; state.dirty = true; }];
      }`,
    };
    if (url === "test:decimal-jsx") return {
      format: "module", shortCircuit: true, source: "export const jsx = (type, props) => ({ type, props }); export const jsxs = jsx; export const Fragment = 'fragment';",
    };
    if (/\/components\/(decimal|validated)-input\.tsx$/.test(url)) return {
      format: "module", shortCircuit: true,
      source: ts.transpileModule(readFileSync(new URL(url), "utf8"), {
        compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
      }).outputText,
    };
    return nextLoad(url, context);
  },
});
const { default: DecimalInput } = await import("../components/decimal-input.tsx");
const { default: ValidatedInput } = await import("../components/validated-input.tsx");

function harness(initial, extra = {}) {
  state.value = undefined;
  let value = initial;
  let validity;
  let element;
  let field;
  const onChange = event => { value = typeof initial === "number" ? Number(event.target.value) : event.target.value; };
  function render() {
    do {
      state.dirty = false;
      field = DecimalInput({ value, onChange, ...extra });
      element = field.props.children[0];
    } while (state.dirty);
    element.props.ref({ setCustomValidity(message) { validity = message; } });
  }
  render();
  return {
    change(raw) { element.props.onChange({ target: { value: raw } }); render(); },
    blur() { element.props.onBlur({ target: { value: element.props.value } }); render(); },
    external(next) { value = next; render(); },
    get text() { return element.props.value; },
    get value() { return value; },
    get error() { return validity; },
    get field() { return field; },
  };
}

test("numeric state preserves a decimal draft and normalizes leading zeros only on blur", () => {
  const input = harness(0, { min: 0 });
  input.change("045");
  assert.equal(input.text, "045");
  assert.equal(input.value, 45);
  input.blur();
  assert.equal(input.text, "45");
  input.change("45.");
  assert.equal(input.text, "45.");
  input.change("45.67");
  assert.equal(input.value, 45.67);
  input.change("45.678");
  assert.match(input.error, /2 decimal/);
  assert.equal(input.field.type, "span");
  assert.equal(input.field.props.className, "decimalInputField");
  assert.equal(input.field.props.children[1].props.role, "alert", "error stays within the same grid cell as its input");
  assert.equal(input.text, "45.678", "invalid precision must not be silently rounded");
  input.change("45.67");
  assert.equal(input.error, "");
});

test("scientific notation is blocked and external record changes replace the draft", () => {
  const input = harness("12.34");
  input.change("1e3");
  assert.equal(input.text, "12.34");
  input.external("99.50");
  assert.equal(input.text, "99.50");
});

test("fractional quantities and four-decimal tax are independent of currency precision", () => {
  const input = harness(0, { places: 4, min: 0, max: 100 });
  input.change(".");
  assert.equal(input.value, 0, "partial drafts must not propagate NaN into calculations");
  input.change(".005");
  input.blur();
  assert.equal(input.text, "0.005");
  input.change("8.1234");
  assert.equal(input.error, "");
  input.change("100.0001");
  assert.match(input.error, /no greater than 100/);
});

test("currency normalizes US grouping but preserves invalid pasted amounts for correction", () => {
  const input = harness(0, { currency: true });
  input.change("$1,234.56");
  assert.equal(input.text, "1234.56");
  assert.equal(input.value, 1234.56);
  input.change("$12,34.56");
  assert.match(input.error, /decimal number/);
  assert.equal(input.value, 1234.56, "invalid text does not enter calculations");
  input.blur();
  assert.equal(input.text, "$12,34.56");
  input.change("1234.56");
  assert.equal(input.error, "");
});

test("a cleared required number stays visibly blank instead of being restored to zero", () => {
  const input = harness(5, { required: true });
  input.change("");
  assert.equal(input.text, "");
  input.blur();
  assert.equal(input.text, "", "native required validity must still see an empty input");
  input.change("0");
  assert.equal(input.text, "0", "explicit zero is distinct from a blank draft");
});

test("state selectors preserve legacy values and offer standard US choices", () => {
  state.value = undefined;
  let selected;
  const select = ValidatedInput({ field: "billingAddressState", value: "Florida",
    onChange: event => { selected = event.target.value; } });
  assert.equal(select.type, "select");
  assert.equal(select.props.value, "Florida");
  const options = select.props.children.flat().filter(Boolean);
  assert.ok(options.some(option => option.props.value === "Florida"), "stored legacy value is not silently replaced");
  assert.ok(options.some(option => option.props.value === "FL"));
  assert.ok(options.some(option => option.props.value === "AE"));
  select.props.onChange({ target: { value: "FL" } });
  assert.equal(selected, "FL");
});

test("shared ZIP control removes/reinserts separators and exposes invalid digit counts", () => {
  state.value = undefined;
  let value = "01234-5";
  let input;
  let validity;
  function render() {
    input = ValidatedInput({ field: "billingAddressZip", value,
      onChange: event => { value = event.target.value; } }).props.children[0];
    input.props.ref({ setCustomValidity(message) { validity = message; } });
  }
  render();
  input.props.onChange({ target: { value: "01234-" } });
  render();
  assert.equal(value, "01234");
  assert.equal(validity, "");
  input.props.onChange({ target: { value: `${value}5` } });
  render();
  assert.equal(value, "01234-5");
  assert.match(validity, /5-digit/);
  input.props.onBlur({ target: { value } });
  render();
  assert.equal(input.props["aria-invalid"], true);
  assert.equal(input.props["aria-describedby"], "test-error");
});
