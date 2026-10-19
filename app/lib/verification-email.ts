import { DefaultAzureCredential, ManagedIdentityCredential } from "@azure/identity";
import { EmailClient } from "@azure/communication-email";

let emailClient: EmailClient | undefined;

function configuredEmailClient() {
  const endpoint = process.env.AZURE_COMMUNICATION_EMAIL_ENDPOINT?.trim();
  const sender = process.env.AZURE_COMMUNICATION_EMAIL_SENDER?.trim();
  if (!endpoint || !sender) throw new Error("Verification email delivery is not configured.");
  const url = new URL(endpoint);
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/"
    || url.search || url.hash || !/^[^\s@]+@[^\s@]+$/.test(sender)) {
    throw new Error("Verification email delivery configuration is invalid.");
  }
  if (!emailClient) {
    const credential = process.env.WEBSITE_INSTANCE_ID
      ? new ManagedIdentityCredential()
      : new DefaultAzureCredential();
    emailClient = new EmailClient(url.origin, credential);
  }
  return { client: emailClient, sender };
}

export async function sendVerificationEmail(to: string, verificationUrl: string): Promise<boolean> {
  const { client, sender } = configuredEmailClient();
  const poller = await client.beginSend({
    senderAddress: sender,
    recipients: { to: [{ address: to }] },
    content: {
      subject: "Verify your Overhead account",
      plainText: [
        "Finish creating your Overhead account by verifying this email address.",
        "",
        verificationUrl,
        "",
        "This link expires in 30 minutes and can only be used once.",
        "If you did not request this, you can ignore this email.",
      ].join("\n"),
    },
  });
  const result = await poller.pollUntilDone();
  if (result.status !== "Succeeded") {
    console.error("Verification email delivery did not succeed", { status: result.status, errorCode: result.error?.code });
    return false;
  }
  return true;
}
