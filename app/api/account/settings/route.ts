import { NextRequest, NextResponse } from "next/server";
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

export async function GET(request: NextRequest) {
  try {
    const orgId = Number(request.nextUrl.searchParams.get("organizationId")) || 1;
    const settings = await getOrganizationSettings(orgId);
    return NextResponse.json(settings);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load settings" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request payload" }, { status: 400 });
    }

    const organizationId = Number(body.organizationId) || 1;
    const action = body.action;

    if (action === "update-organization-name") {
      const name = typeof body.name === "string" ? body.name : "";
      await updateOrganizationName(organizationId, name);
      const settings = await getOrganizationSettings(organizationId);
      return NextResponse.json(settings);
    }

    if (action === "add-member") {
      const email = typeof body.email === "string" ? body.email : "";
      const displayName = typeof body.displayName === "string" ? body.displayName : "";
      const phone = body.phone ? String(body.phone) : null;
      const accessRoleId = Number(body.accessRoleId);
      const linkEmployeeId = body.linkEmployeeId ? Number(body.linkEmployeeId) : null;

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
      const membershipId = Number(body.membershipId);
      if (!Number.isInteger(membershipId)) {
        return NextResponse.json({ error: "Membership ID is required" }, { status: 400 });
      }

      const accessRoleId = body.accessRoleId !== undefined ? Number(body.accessRoleId) : undefined;
      const isActive = body.isActive !== undefined ? Boolean(body.isActive) : undefined;

      await updateOrganizationMember(organizationId, membershipId, { accessRoleId, isActive });
      const settings = await getOrganizationSettings(organizationId);
      return NextResponse.json(settings);
    }

    if (action === "link-employee") {
      const membershipId = Number(body.membershipId);
      const employeeId = Number(body.employeeId);
      if (!Number.isInteger(membershipId) || !Number.isInteger(employeeId)) {
        return NextResponse.json({ error: "Membership ID and employee ID are required" }, { status: 400 });
      }

      await linkMembershipEmployee(organizationId, membershipId, employeeId);
      const settings = await getOrganizationSettings(organizationId);
      return NextResponse.json(settings);
    }

    if (action === "unlink-employee") {
      const membershipId = Number(body.membershipId);
      if (!Number.isInteger(membershipId)) {
        return NextResponse.json({ error: "Membership ID is required" }, { status: 400 });
      }

      await unlinkMembershipEmployee(organizationId, membershipId);
      const settings = await getOrganizationSettings(organizationId);
      return NextResponse.json(settings);
    }

    if (action === "toggle-employee-active") {
      const employeeId = Number(body.employeeId);
      const isActive = Boolean(body.isActive);
      if (!Number.isInteger(employeeId)) {
        return NextResponse.json({ error: "Employee ID is required" }, { status: 400 });
      }

      await setEmployeeActiveStatus(organizationId, employeeId, isActive);
      const settings = await getOrganizationSettings(organizationId);
      return NextResponse.json(settings);
    }

    if (action === "delete-employee") {
      const employeeId = Number(body.employeeId);
      if (!Number.isInteger(employeeId)) {
        return NextResponse.json({ error: "Employee ID is required" }, { status: 400 });
      }

      const result = await deleteOrArchiveEmployee(organizationId, employeeId);
      const settings = await getOrganizationSettings(organizationId);
      return NextResponse.json({ ...settings, notification: result.message });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to process settings request" },
      { status: 400 },
    );
  }
}
