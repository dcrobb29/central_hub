import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";

const names = ["AZURE_COMMUNICATION_EMAIL_ENDPOINT", "AZURE_COMMUNICATION_EMAIL_SENDER", "WEBSITE_INSTANCE_ID"];
const original = Object.fromEntries(names.map(name => [name, process.env[name]]));
process.env.AZURE_COMMUNICATION_EMAIL_ENDPOINT = "https://overhead-communication.unitedstates.communication.azure.com";
process.env.AZURE_COMMUNICATION_EMAIL_SENDER = "DoNotReply@example.azurecomm.net";
process.env.WEBSITE_INSTANCE_ID = "test-instance";
const state = { credential: "", endpoint: "", message: null, status: "Succeeded" };
globalThis.verificationEmailTest = state;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@azure/identity" || specifier === "@azure/communication-email") {
      return { url: new URL(`./${specifier.replaceAll("/", "-")}-stub.mjs`, import.meta.url).href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === new URL("./@azure-identity-stub.mjs", import.meta.url).href) {
      return { format: "module", shortCircuit: true, source: `
        export class ManagedIdentityCredential { constructor() { globalThis.verificationEmailTest.credential = "managed"; } }
        export class DefaultAzureCredential { constructor() { globalThis.verificationEmailTest.credential = "default"; } }` };
    }
    if (url === new URL("./@azure-communication-email-stub.mjs", import.meta.url).href) {
      return { format: "module", shortCircuit: true, source: `
        export class EmailClient {
          constructor(endpoint, credential) {
            globalThis.verificationEmailTest.endpoint = endpoint;
            if (!credential) throw new Error("Missing credential");
          }
          async beginSend(message) {
            globalThis.verificationEmailTest.message = message;
            return { pollUntilDone: async () => ({ status: globalThis.verificationEmailTest.status }) };
          }
        }` };
    }
    return nextLoad(url, context);
  },
});

const { sendVerificationEmail } = await import("./verification-email.ts");
test.after(() => {
  for (const name of names) {
    if (original[name] === undefined) delete process.env[name];
    else process.env[name] = original[name];
  }
});

test("verification delivery uses managed identity and the configured sender", async () => {
  assert.equal(await sendVerificationEmail("tester@example.com", "https://overhead.example/verify-email#token=synthetic"), true);
  assert.equal(state.credential, "managed");
  assert.equal(state.endpoint, "https://overhead-communication.unitedstates.communication.azure.com");
  assert.deepEqual(state.message.recipients.to, [{ address: "tester@example.com" }]);
  assert.equal(state.message.senderAddress, "DoNotReply@example.azurecomm.net");
  assert.match(state.message.content.plainText, /#token=synthetic/);
  assert.equal("html" in state.message.content, false);
});

test("verification delivery does not report simulated success or accept invalid configuration", async () => {
  state.status = "Failed";
  assert.equal(await sendVerificationEmail("tester@example.com", "https://overhead.example/verify-email#token=synthetic"), false);
  process.env.AZURE_COMMUNICATION_EMAIL_ENDPOINT = "http://insecure.example";
  await assert.rejects(() => sendVerificationEmail("tester@example.com", "https://overhead.example/verify-email#token=synthetic"), /configuration is invalid/);
  delete process.env.AZURE_COMMUNICATION_EMAIL_SENDER;
  await assert.rejects(() => sendVerificationEmail("tester@example.com", "https://overhead.example/verify-email#token=synthetic"), /not configured/);
});
