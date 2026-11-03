import { NextRequest, NextResponse } from "next/server";
import { phoneValue } from "@/app/lib/contact-input";
import { parseInvoiceSettings } from "@/app/lib/invoice-settings-input";
import { booleanValue, describeValidationError, emailValue, fieldValue, integerValue, textValue, ValidationError } from "@/app/lib/validation";
import {
  getOrganizationSettings,
  updateOrganizationName,
  addOrganizationMember,
  updateOrganizationMember,
  linkMembershipEmployee,
  unlinkMembershipEmployee,
  setEmployeeActiveStatus,
  deleteOrArchiveEmployee,
} from "@/app/lib/account";
import { updateOrganizationInvoiceSettings } from "@/app/lib/invoice-settings";
import { ProjectAccessError, requireProjectSession } from "@/app/lib/project-access";

export async function GET(request: NextRequest) {
  try {
    const session = await requireProjectSession(request, "organization.manage");
    const orgId = session.organization.organizationId;
    const requestedId = request.nextUrl.searchParams.get("organizationId");
    if (requestedId !== null && Number(requestedId) !== orgId) {
      throw new ProjectAccessError("You do not have access to this organization.", 403);
    }
    const settings = await getOrganizationSettings(orgId);
    return NextResponse.json(settings, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof ProjectAccessError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("Unable to load organization settings", error);
    return NextResponse.json(
      { error: "Unable to load settings" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireProjectSession(request, "organization.manage");
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Invalid request payload" }, { status: 400 });
    }

    const organizationId = session.organization.organizationId;
    if (body.organizationId !== undefined && Number(body.organizationId) !== organizationId) {
      throw new ProjectAccessError("You do not have access to this organization.", 403);
    }
    const action = body.action;
    if (["add-member", "update-member", "link-employee", "unlink-employee"].includes(action)
        && !session.permissions.includes("members.manage")) {
      throw new ProjectAccessError("You do not have permission to manage members.", 403);
    }
    if ((["link-employee", "unlink-employee", "toggle-employee-active", "delete-employee"].includes(action)
        || (action === "add-member" && body.linkEmployeeId != null))
        && !session.permissions.includes("personnel.write")) {
      throw new ProjectAccessError("You do not have permission to manage personnel.", 403);
    }
    if (action === "update-invoice-settings" && !session.permissions.includes("finances.write")) {
      throw new ProjectAccessError("You do not have permission to change invoice settings.", 403);
    }

    if (action === "update-organization-name") {
      const name = fieldValue("Organization name (up to 150 characters)", () => textValue(body.name, 150, true));
      await updateOrganizationName(organizationId, name);
      const settings = await getOrganizationSettings(organizationId);
      return NextResponse.json(settings);
    }

    if (action === "add-member") {
      const email = fieldValue("Email", () => emailValue(body.email, true));
      const displayName = fieldValue("Display name (up to 150 characters)", () => textValue(body.displayName, 150, true));
      const phone = phoneValue(body.phone);
      const accessRoleId = integerValue(body.accessRoleId, "Access role");
      const linkEmployeeId = body.linkEmployeeId == null || body.linkEmployeeId === "" ? null : integerValue(body.linkEmployeeId, "Employee");

      if (!email || !displayName || !Number.isInteger(accessRoleId)) {
        return NextResponse.json({ error: "Email, display name, and role are required" }, { status: 400 });
      }

      await addOrganizationMember(organizationId, {
        email,
        displayName,
        phone,
        accessRoleId,
        linkEmployeeId,
      });

      const settings = await getOrganizationSettings(organizationId);
      return NextResponse.json(settings, { status: 201 });
    }

    if (action === "update-member") {
      const membershipId = integerValue(body.membershipId, "Membership");
      if (!Number.isInteger(membershipId)) {
        return NextResponse.json({ error: "Membership ID is required" }, { status: 400 });
      }

      const accessRoleId = body.accessRoleId !== undefined ? integerValue(body.accessRoleId, "Access role") : undefined;
      const isActive = body.isActive !== undefined ? booleanValue(body.isActive, "Active status") : undefined;

      await updateOrganizationMember(organizationId, membershipId, { accessRoleId, isActive });
      const settings = await getOrganizationSettings(organizationId);
      return NextResponse.json(settings);
    }

    if (action === "link-employee") {
      const membershipId = integerValue(body.membershipId, "Membership");
      const employeeId = integerValue(body.employeeId, "Employee");
      if (!Number.isInteger(membershipId) || !Number.isInteger(employeeId)) {
        return NextResponse.json({ error: "Membership ID and employee ID are required" }, { status: 400 });
      }

      await linkMembershipEmployee(organizationId, membershipId, employeeId);
      const settings = await getOrganizationSettings(organizationId);
      return NextResponse.json(settings);
    }

    if (action === "unlink-employee") {
      const membershipId = integerValue(body.membershipId, "Membership");
      if (!Number.isInteger(membershipId)) {
        return NextResponse.json({ error: "Membership ID is required" }, { status: 400 });
      }

      await unlinkMembershipEmployee(organizationId, membershipId);
      const settings = await getOrganizationSettings(organizationId);
      return NextResponse.json(settings);
    }

    if (action === "toggle-employee-active") {
      const employeeId = integerValue(body.employeeId, "Employee");
      const isActive = booleanValue(body.isActive, "Active status");
      if (!Number.isInteger(employeeId)) {
        return NextResponse.json({ error: "Employee ID is required" }, { status: 400 });
      }

      await setEmployeeActiveStatus(organizationId, employeeId, isActive);
      const settings = await getOrganizationSettings(organizationId);
      return NextResponse.json(settings);
    }

    if (action === "delete-employee") {
      const employeeId = integerValue(body.employeeId, "Employee");
      if (!Number.isInteger(employeeId)) {
        return NextResponse.json({ error: "Employee ID is required" }, { status: 400 });
      }

      const result = await deleteOrArchiveEmployee(organizationId, employeeId);
      const settings = await getOrganizationSettings(organizationId);
      return NextResponse.json({ ...settings, notification: result.message });
    }

    if (action === "update-invoice-settings") {
      const invoiceSettings = body.invoiceSettings;
      if (!invoiceSettings || typeof invoiceSettings !== "object") {
        return NextResponse.json({ error: "Invoice settings are required" }, { status: 400 });
      }

      await updateOrganizationInvoiceSettings(organizationId, parseInvoiceSettings(invoiceSettings));
      const settings = await getOrganizationSettings(organizationId);
      return NextResponse.json({ ...settings, notification: "Invoice template settings updated successfully." });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    if (error instanceof ProjectAccessError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof ValidationError) return NextResponse.json({ error: describeValidationError(error) }, { status: 400 });
    console.error("Unable to process organization settings", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to process settings request" },
      { status: 400 },
    );
  }
}
