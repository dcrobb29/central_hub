import { NextRequest, NextResponse } from "next/server";
import { optionalCustomerId, parseCustomerDetails } from "@/app/lib/customer-fields";
import { CustomerError, getCustomers, saveCustomer, setCustomerActive } from "@/app/lib/customers";
import { ValidationError } from "@/app/lib/validation";

export async function GET() {
  try {
    return NextResponse.json({ customers: await getCustomers() });
  } catch (error) {
    console.error("Customer directory load failed", error);
    return NextResponse.json({ error: "Unable to load customers. Check the database connection and customers migration." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const body: unknown = await request.json().catch(() => null);
  try {
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new ValidationError("invalid");
    const input = body as Record<string, unknown>;
    const customerId = optionalCustomerId(input.customerId);
    if (input.action === "set-active") {
      if (customerId === null || typeof input.isActive !== "boolean") throw new ValidationError("invalid");
      await setCustomerActive(customerId, input.isActive);
      return NextResponse.json({ customerId });
    }
    if (input.action !== "save") throw new ValidationError("invalid");
    return NextResponse.json({ customerId: await saveCustomer(parseCustomerDetails(input), customerId) }, { status: customerId === null ? 201 : 200 });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: "Enter a contact name, a valid email if provided, and details within the field limits." }, { status: 400 });
    }
    if (error instanceof CustomerError) return NextResponse.json({ error: error.message }, { status: 404 });
    console.error("Customer directory update failed", error);
    return NextResponse.json({ error: "Unable to save customer. Check the database connection and customers migration." }, { status: 500 });
  }
}
