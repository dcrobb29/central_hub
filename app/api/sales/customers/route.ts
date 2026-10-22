import { NextRequest, NextResponse } from "next/server";
import { customerBillingAddressText, customerEstimateName, parseCustomerDetails } from "@/app/lib/customer-fields";
import { findSimilarCustomers, saveCustomer, searchCustomers, type CustomerSearchResult } from "@/app/lib/customers";
import { ProjectAccessError, requireProjectSession } from "@/app/lib/project-access";
import { ValidationError } from "@/app/lib/validation";

export async function GET(request: NextRequest) {
  try {
    const session = await requireProjectSession(request, "sales.read");
    const query = request.nextUrl.searchParams.get("q") ?? "";
    return NextResponse.json({ customers: await searchCustomers(session.organization.organizationId, query) });
  } catch (error) {
    if (error instanceof ProjectAccessError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("Customer search failed", error);
    return NextResponse.json({ error: "Unable to search customers." }, { status: 500 });
  }
}

// Creating a customer from an estimate needs both estimate and customer write access.
export async function POST(request: NextRequest) {
  let organizationId: number;
  try {
    await requireProjectSession(request, "sales.write");
    organizationId = (await requireProjectSession(request, "finances.write")).organization.organizationId;
  } catch (error) {
    if (error instanceof ProjectAccessError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
  const body: unknown = await request.json().catch(() => null);
  try {
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new ValidationError("invalid");
    const input = body as Record<string, unknown>;
    const details = parseCustomerDetails(input);
    if (input.confirmSimilar !== true) {
      const similar = await findSimilarCustomers(organizationId, details);
      if (similar.length) return NextResponse.json({ similar }, { status: 409 });
    }
    const customerId = await saveCustomer(details, null, organizationId);
    const customer: CustomerSearchResult = {
      customerId,
      displayName: customerEstimateName(details),
      contactName: [details.firstName, details.lastName].filter(Boolean).join(" "),
      email: details.email,
      address: customerBillingAddressText(details),
    };
    return NextResponse.json({ customer }, { status: 201 });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: "Enter a contact name, a valid email if provided, and details within the field limits." }, { status: 400 });
    }
    console.error("Customer create from estimate failed", error);
    return NextResponse.json({ error: "Unable to save customer." }, { status: 500 });
  }
}
