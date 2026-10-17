import { NextRequest, NextResponse } from "next/server";
import { optionalCustomerId, parseCustomerDetails } from "@/app/lib/customer-fields";
import { CustomerError, getCustomers, saveCustomer, setCustomerActive } from "@/app/lib/customers";
import { ValidationError } from "@/app/lib/validation";
import { ProjectAccessError, requireProjectSession } from "@/app/lib/project-access";

export async function GET(request: NextRequest) {
  try {
    const session = await requireProjectSession(request, "finances.read");
    return NextResponse.json({ customers: await getCustomers(session.organization.organizationId) });
  } catch (error) {
    if (error instanceof ProjectAccessError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("Customer directory load failed", error);
    return NextResponse.json({ error: "Unable to load customers. Check the database connection and customers migration." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  let organizationId: number;
  try {
    organizationId = (await requireProjectSession(request, "finances.write")).organization.organizationId;
  } catch (error) {
    if (error instanceof ProjectAccessError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
  const body: unknown = await request.json().catch(() => null);
  try {
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new ValidationError("invalid");
    const input = body as Record<string, unknown>;
    const customerId = optionalCustomerId(input.customerId);
    if (input.action === "set-active") {
      if (customerId === null || typeof input.isActive !== "boolean") throw new ValidationError("invalid");
      await setCustomerActive(customerId, input.isActive, organizationId);
      return NextResponse.json({ customerId });
    }
    if (input.action !== "save") throw new ValidationError("invalid");
    return NextResponse.json({ customerId: await saveCustomer(parseCustomerDetails(input), customerId, organizationId) }, { status: customerId === null ? 201 : 200 });
  } catch (error) {
    if (error instanceof ProjectAccessError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: "Enter a contact name, a valid email if provided, and details within the field limits." }, { status: 400 });
    }
    if (error instanceof CustomerError) return NextResponse.json({ error: error.message }, { status: 404 });
    console.error("Customer directory update failed", error);
    return NextResponse.json({ error: "Unable to save customer. Check the database connection and customers migration." }, { status: 500 });
  }
}
