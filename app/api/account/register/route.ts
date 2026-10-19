import { after, NextResponse, type NextRequest } from "next/server";
import { accountSignupEnabled, consumeRateLimit, createVerificationToken, parseRegistrationInput, removePendingVerification, requestAccountVerification, requestAddress } from "@/app/lib/account-registration";
import { sendVerificationEmail } from "@/app/lib/verification-email";
import { verifyTurnstileToken } from "@/app/lib/turnstile";

const GENERIC_RESPONSE = { message: "If registration is available for this address, verification instructions will be sent." };

function publicBaseUrl() {
  const configured = process.env.PUBLIC_APP_URL?.trim();
  if (!configured) throw new Error("PUBLIC_APP_URL is not configured.");
  const url = new URL(configured);
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash
    || (process.env.NODE_ENV === "production" && url.protocol !== "https:")) {
    throw new Error("PUBLIC_APP_URL must be an HTTPS origin.");
  }
  return url.origin;
}

export async function POST(request: NextRequest) {
  if (!accountSignupEnabled()) return NextResponse.json({ error: "Account registration is not available." }, { status: 404 });

  const body = await request.json().catch(() => null);
  const input = parseRegistrationInput(body);
  if (!input) return NextResponse.json({ error: "Enter a valid name, company name, and email address." }, { status: 400 });
  const turnstileToken = body && typeof body === "object" && "turnstileToken" in body
    && typeof body.turnstileToken === "string" ? body.turnstileToken : "";
  if (!turnstileToken || turnstileToken.length > 2048) {
    return NextResponse.json({ error: "Complete the security check and try again." }, { status: 400 });
  }

  try {
    const address = requestAddress(request);
    const ipAllowed = await consumeRateLimit("signup-ip", address, 5, 3600);
    const emailAllowed = await consumeRateLimit("signup-email", input.email, 3, 3600);
    if (!ipAllowed || !emailAllowed) return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
    if (!await verifyTurnstileToken(turnstileToken)) {
      return NextResponse.json({ error: "The security check could not be verified. Please try again." }, { status: 400 });
    }

    const baseUrl = publicBaseUrl();
    const { token, hash } = createVerificationToken();
    const created = await requestAccountVerification(input, hash);
    if (!created) return NextResponse.json(GENERIC_RESPONSE, { status: 202 });

    const verificationUrl = new URL("/verify-email", baseUrl);
    verificationUrl.hash = new URLSearchParams({ token }).toString();
    after(async () => {
      let delivered = false;
      try {
        delivered = await sendVerificationEmail(input.email, verificationUrl.toString());
      } catch (error) {
        console.error("Verification email request failed", error instanceof Error ? error.name : "UnknownError");
      }
      if (!delivered) {
        try {
          await removePendingVerification(hash);
        } catch (error) {
          console.error("Unable to remove undelivered account verification", error instanceof Error ? error.name : "UnknownError");
        }
      }
    });
    return NextResponse.json(GENERIC_RESPONSE, { status: 202 });
  } catch (error) {
    console.error("Unable to process account registration", error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json({ error: "Registration is unavailable. Please try again later." }, { status: 503 });
  }
}
