import { getPool, sql } from "@/app/lib/db";

export type TemplateStyle = "modern" | "classic" | "compact" | "minimal";

export type OrganizationInvoiceSettings = {
  organizationId: number;
  templateStyle: TemplateStyle;
  accentColor: string;
  invoiceTitle: string;
  companyName: string | null;
  companyAddressLine1: string | null;
  companyAddressLine2: string | null;
  companyCity: string | null;
  companyState: string | null;
  companyZip: string | null;
  companyPhone: string | null;
  companyEmail: string | null;
  companyWebsite: string | null;
  taxNumber: string | null;
  paymentTerms: string;
  paymentInstructions: string | null;
  defaultCustomerNotes: string | null;
  emailSubjectTemplate: string;
  emailBodyTemplate: string;
  showShippingAddress: boolean;
  showProjectName: boolean;
  showItemizedScopes: boolean;
  nextInvoiceSequence?: number;
  updatedAt?: string;
};

export const DEFAULT_INVOICE_SETTINGS: Omit<OrganizationInvoiceSettings, "organizationId"> = {
  templateStyle: "modern",
  accentColor: "#0284c7",
  invoiceTitle: "INVOICE",
  companyName: "Contoso",
  companyAddressLine1: "1000 Innovation Way, Suite 400",
  companyAddressLine2: null,
  companyCity: "Seattle",
  companyState: "WA",
  companyZip: "98101",
  companyPhone: "(206) 555-0199",
  companyEmail: "billing@contoso.com",
  companyWebsite: "www.contoso.com",
  taxNumber: null,
  paymentTerms: "Net 30",
  paymentInstructions:
    "Please remit payments via check or ACH direct deposit to Accounts Receivable. Reference invoice number with payment.",
  defaultCustomerNotes:
    "Thank you for your business! If you have any questions regarding this invoice, please contact our billing department.",
  emailSubjectTemplate: "Invoice {invoiceNo} from {companyName}",
  emailBodyTemplate: `Hello {customerName},

Please find attached Invoice {invoiceNo} for {invoiceAmount}.
Project: {projectName}
Due date: {dueDate}

Thank you for your business!

Sincerely,
{companyName}`,
  showShippingAddress: true,
  showProjectName: true,
  showItemizedScopes: true,
  nextInvoiceSequence: 1,
};

export function interpolateEmailTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    return vars[key] !== undefined ? vars[key] : match;
  });
}

export async function getOrganizationInvoiceSettings(
  organizationId: number
): Promise<OrganizationInvoiceSettings> {
  const pool = await getPool();
  const res = await pool
    .request()
    .input("organizationId", sql.Int, organizationId)
    .query<{
      OrganizationID: number;
      TemplateStyle: string;
      AccentColor: string;
      InvoiceTitle: string;
      CompanyName: string | null;
      CompanyAddressLine1: string | null;
      CompanyAddressLine2: string | null;
      CompanyCity: string | null;
      CompanyState: string | null;
      CompanyZip: string | null;
      CompanyPhone: string | null;
      CompanyEmail: string | null;
      CompanyWebsite: string | null;
      TaxNumber: string | null;
      PaymentTerms: string;
      PaymentInstructions: string | null;
      DefaultCustomerNotes: string | null;
      EmailSubjectTemplate: string;
      EmailBodyTemplate: string;
      ShowShippingAddress: boolean;
      ShowProjectName: boolean;
      ShowItemizedScopes: boolean;
      NextInvoiceSequence: number | null;
      UpdatedAt: Date;
    }>(`
      SELECT TOP (1)
        OrganizationID,
        TemplateStyle,
        AccentColor,
        InvoiceTitle,
        CompanyName,
        CompanyAddressLine1,
        CompanyAddressLine2,
        CompanyCity,
        CompanyState,
        CompanyZip,
        CompanyPhone,
        CompanyEmail,
        CompanyWebsite,
        TaxNumber,
        PaymentTerms,
        PaymentInstructions,
        DefaultCustomerNotes,
        EmailSubjectTemplate,
        EmailBodyTemplate,
        ShowShippingAddress,
        ShowProjectName,
        ShowItemizedScopes,
        NextInvoiceSequence,
        UpdatedAt
      FROM dbo.OrganizationInvoiceSettings
      WHERE OrganizationID = @organizationId
    `);

  const row = res.recordset[0];
  if (!row) {
    return {
      organizationId,
      ...DEFAULT_INVOICE_SETTINGS,
    };
  }

  const validStyles: TemplateStyle[] = ["modern", "classic", "compact", "minimal"];
  const templateStyle = validStyles.includes(row.TemplateStyle as TemplateStyle)
    ? (row.TemplateStyle as TemplateStyle)
    : "modern";

  return {
    organizationId: row.OrganizationID,
    templateStyle,
    accentColor: row.AccentColor || DEFAULT_INVOICE_SETTINGS.accentColor,
    invoiceTitle: row.InvoiceTitle || DEFAULT_INVOICE_SETTINGS.invoiceTitle,
    companyName: row.CompanyName,
    companyAddressLine1: row.CompanyAddressLine1,
    companyAddressLine2: row.CompanyAddressLine2,
    companyCity: row.CompanyCity,
    companyState: row.CompanyState,
    companyZip: row.CompanyZip,
    companyPhone: row.CompanyPhone,
    companyEmail: row.CompanyEmail,
    companyWebsite: row.CompanyWebsite,
    taxNumber: row.TaxNumber,
    paymentTerms: row.PaymentTerms || DEFAULT_INVOICE_SETTINGS.paymentTerms,
    paymentInstructions: row.PaymentInstructions,
    defaultCustomerNotes: row.DefaultCustomerNotes,
    emailSubjectTemplate: row.EmailSubjectTemplate || DEFAULT_INVOICE_SETTINGS.emailSubjectTemplate,
    emailBodyTemplate: row.EmailBodyTemplate || DEFAULT_INVOICE_SETTINGS.emailBodyTemplate,
    showShippingAddress: Boolean(row.ShowShippingAddress),
    showProjectName: Boolean(row.ShowProjectName),
    showItemizedScopes: Boolean(row.ShowItemizedScopes),
    nextInvoiceSequence: row.NextInvoiceSequence ?? 1,
    updatedAt: row.UpdatedAt ? row.UpdatedAt.toISOString() : undefined,
  };
}

export async function updateOrganizationInvoiceSettings(
  organizationId: number,
  settings: Partial<OrganizationInvoiceSettings>
): Promise<OrganizationInvoiceSettings> {
  const pool = await getPool();

  const validStyles: TemplateStyle[] = ["modern", "classic", "compact", "minimal"];
  const style = settings.templateStyle && validStyles.includes(settings.templateStyle)
    ? settings.templateStyle
    : "modern";

  const accentColor = typeof settings.accentColor === "string" && settings.accentColor.trim()
    ? settings.accentColor.trim().slice(0, 16)
    : DEFAULT_INVOICE_SETTINGS.accentColor;

  const invoiceTitle = typeof settings.invoiceTitle === "string" && settings.invoiceTitle.trim()
    ? settings.invoiceTitle.trim().slice(0, 64)
    : DEFAULT_INVOICE_SETTINGS.invoiceTitle;

  const companyName = settings.companyName !== undefined ? (settings.companyName?.trim() || null) : undefined;
  const companyAddressLine1 = settings.companyAddressLine1 !== undefined ? (settings.companyAddressLine1?.trim() || null) : undefined;
  const companyAddressLine2 = settings.companyAddressLine2 !== undefined ? (settings.companyAddressLine2?.trim() || null) : undefined;
  const companyCity = settings.companyCity !== undefined ? (settings.companyCity?.trim() || null) : undefined;
  const companyState = settings.companyState !== undefined ? (settings.companyState?.trim() || null) : undefined;
  const companyZip = settings.companyZip !== undefined ? (settings.companyZip?.trim() || null) : undefined;
  const companyPhone = settings.companyPhone !== undefined ? (settings.companyPhone?.trim() || null) : undefined;
  const companyEmail = settings.companyEmail !== undefined ? (settings.companyEmail?.trim() || null) : undefined;
  const companyWebsite = settings.companyWebsite !== undefined ? (settings.companyWebsite?.trim() || null) : undefined;
  const taxNumber = settings.taxNumber !== undefined ? (settings.taxNumber?.trim() || null) : undefined;
  const paymentTerms = settings.paymentTerms?.trim() || DEFAULT_INVOICE_SETTINGS.paymentTerms;
  const paymentInstructions = settings.paymentInstructions !== undefined ? (settings.paymentInstructions?.trim() || null) : undefined;
  const defaultCustomerNotes = settings.defaultCustomerNotes !== undefined ? (settings.defaultCustomerNotes?.trim() || null) : undefined;
  const emailSubjectTemplate = settings.emailSubjectTemplate?.trim() || DEFAULT_INVOICE_SETTINGS.emailSubjectTemplate;
  const emailBodyTemplate = settings.emailBodyTemplate?.trim() || DEFAULT_INVOICE_SETTINGS.emailBodyTemplate;
  const showShippingAddress = settings.showShippingAddress !== undefined ? Boolean(settings.showShippingAddress) : true;
  const showProjectName = settings.showProjectName !== undefined ? Boolean(settings.showProjectName) : true;
  const showItemizedScopes = settings.showItemizedScopes !== undefined ? Boolean(settings.showItemizedScopes) : true;
  const nextInvoiceSequence = typeof settings.nextInvoiceSequence === "number" && settings.nextInvoiceSequence >= 1
    ? Math.floor(settings.nextInvoiceSequence)
    : undefined;

  await pool
    .request()
    .input("orgId", sql.Int, organizationId)
    .input("templateStyle", sql.VarChar(32), style)
    .input("accentColor", sql.VarChar(16), accentColor)
    .input("invoiceTitle", sql.NVarChar(64), invoiceTitle)
    .input("companyName", sql.NVarChar(150), companyName ?? null)
    .input("addr1", sql.NVarChar(200), companyAddressLine1 ?? null)
    .input("addr2", sql.NVarChar(200), companyAddressLine2 ?? null)
    .input("city", sql.NVarChar(100), companyCity ?? null)
    .input("state", sql.NVarChar(50), companyState ?? null)
    .input("zip", sql.NVarChar(20), companyZip ?? null)
    .input("phone", sql.NVarChar(50), companyPhone ?? null)
    .input("email", sql.NVarChar(254), companyEmail ?? null)
    .input("website", sql.NVarChar(200), companyWebsite ?? null)
    .input("taxNumber", sql.NVarChar(50), taxNumber ?? null)
    .input("paymentTerms", sql.NVarChar(100), paymentTerms)
    .input("paymentInstructions", sql.NVarChar(sql.MAX), paymentInstructions ?? null)
    .input("defaultCustomerNotes", sql.NVarChar(sql.MAX), defaultCustomerNotes ?? null)
    .input("emailSubjectTemplate", sql.NVarChar(250), emailSubjectTemplate)
    .input("emailBodyTemplate", sql.NVarChar(sql.MAX), emailBodyTemplate)
    .input("showShipping", sql.Bit, showShippingAddress ? 1 : 0)
    .input("showProject", sql.Bit, showProjectName ? 1 : 0)
    .input("showScopes", sql.Bit, showItemizedScopes ? 1 : 0)
    .input("nextSeqSpecified", sql.Bit, nextInvoiceSequence !== undefined ? 1 : 0)
    .input("nextSeq", sql.Int, nextInvoiceSequence ?? 1)
    .query(`
      MERGE dbo.OrganizationInvoiceSettings AS target
      USING (SELECT @orgId AS OrganizationID) AS source
      ON target.OrganizationID = source.OrganizationID
      WHEN MATCHED THEN
        UPDATE SET
          TemplateStyle = @templateStyle,
          AccentColor = @accentColor,
          InvoiceTitle = @invoiceTitle,
          CompanyName = @companyName,
          CompanyAddressLine1 = @addr1,
          CompanyAddressLine2 = @addr2,
          CompanyCity = @city,
          CompanyState = @state,
          CompanyZip = @zip,
          CompanyPhone = @phone,
          CompanyEmail = @email,
          CompanyWebsite = @website,
          TaxNumber = @taxNumber,
          PaymentTerms = @paymentTerms,
          PaymentInstructions = @paymentInstructions,
          DefaultCustomerNotes = @defaultCustomerNotes,
          EmailSubjectTemplate = @emailSubjectTemplate,
          EmailBodyTemplate = @emailBodyTemplate,
          ShowShippingAddress = @showShipping,
          ShowProjectName = @showProject,
          ShowItemizedScopes = @showScopes,
          NextInvoiceSequence = CASE WHEN @nextSeqSpecified = 1 THEN @nextSeq ELSE NextInvoiceSequence END,
          UpdatedAt = SYSUTCDATETIME()
      WHEN NOT MATCHED THEN
        INSERT (
          OrganizationID, TemplateStyle, AccentColor, InvoiceTitle, CompanyName,
          CompanyAddressLine1, CompanyAddressLine2, CompanyCity, CompanyState, CompanyZip,
          CompanyPhone, CompanyEmail, CompanyWebsite, TaxNumber, PaymentTerms,
          PaymentInstructions, DefaultCustomerNotes, EmailSubjectTemplate, EmailBodyTemplate,
          ShowShippingAddress, ShowProjectName, ShowItemizedScopes, NextInvoiceSequence, UpdatedAt
        ) VALUES (
          @orgId, @templateStyle, @accentColor, @invoiceTitle, @companyName,
          @addr1, @addr2, @city, @state, @zip,
          @phone, @email, @website, @taxNumber, @paymentTerms,
          @paymentInstructions, @defaultCustomerNotes, @emailSubjectTemplate, @emailBodyTemplate,
          @showShipping, @showProject, @showScopes, @nextSeq, SYSUTCDATETIME()
        );
    `);

  return getOrganizationInvoiceSettings(organizationId);
}

export function formatSixDigitInvoiceNumber(seq: number): string {
  const num = Math.max(1, Math.floor(seq));
  return String(num).padStart(6, "0");
}

export async function peekNextInvoiceNumber(organizationId: number): Promise<string> {
  const pool = await getPool();
  const res = await pool.request()
    .input("orgId", sql.Int, organizationId)
    .query<{ NextInvoiceSequence: number | null }>(`
      SELECT NextInvoiceSequence FROM dbo.OrganizationInvoiceSettings WHERE OrganizationID = @orgId
    `);

  let seq = res.recordset[0]?.NextInvoiceSequence ?? 1;
  if (!Number.isInteger(seq) || seq < 1) seq = 1;

  while (seq <= 999999) {
    const code = formatSixDigitInvoiceNumber(seq);
    const existsRes = await pool.request()
      .input("orgId", sql.Int, organizationId)
      .input("invoiceNo", sql.NChar(10), code)
      .query<{ id: number }>(`
        SELECT TOP (1) id FROM dbo.Invoices WHERE OrganizationID = @orgId AND [Invoice No] = @invoiceNo
      `);
    if (existsRes.recordset.length === 0) {
      return code;
    }
    seq++;
  }
  return formatSixDigitInvoiceNumber(seq);
}

export async function allocateNextInvoiceNumber(
  executor: sql.Transaction | sql.ConnectionPool | { request: () => sql.Request },
  organizationId: number,
  requestedNumber?: string | null
): Promise<string> {
  const newReq = () => executor.request();

  if (requestedNumber && requestedNumber.trim()) {
    const trimmed = requestedNumber.trim();
    const check = await newReq()
      .input("checkOrgId", sql.Int, organizationId)
      .input("checkInvoiceNo", sql.NChar(10), trimmed)
      .query<{ id: number }>(`
        SELECT TOP (1) id FROM dbo.Invoices WITH (UPDLOCK, HOLDLOCK)
        WHERE OrganizationID = @checkOrgId AND [Invoice No] = @checkInvoiceNo
      `);
    if (check.recordset.length > 0) {
      throw new Error(`This invoice number already exists for your organization. Use a unique invoice number.`);
    }

    const numericVal = parseInt(trimmed, 10);
    if (!Number.isNaN(numericVal) && (String(numericVal) === trimmed.replace(/^0+/, "") || trimmed === "000000")) {
      await newReq()
        .input("advanceOrgId", sql.Int, organizationId)
        .input("targetSeq", sql.Int, numericVal + 1)
        .query(`
          UPDATE dbo.OrganizationInvoiceSettings
          SET NextInvoiceSequence = CASE
            WHEN @targetSeq > NextInvoiceSequence THEN @targetSeq
            ELSE NextInvoiceSequence
          END
          WHERE OrganizationID = @advanceOrgId;
        `);
    }

    return trimmed;
  }

  let currentSeq = 1;
  const seqRes = await newReq()
    .input("allocOrgId", sql.Int, organizationId)
    .query<{ NextInvoiceSequence: number | null }>(`
      SELECT NextInvoiceSequence FROM dbo.OrganizationInvoiceSettings WITH (UPDLOCK, ROWLOCK)
      WHERE OrganizationID = @allocOrgId
    `);
  if (seqRes.recordset[0]?.NextInvoiceSequence) {
    currentSeq = seqRes.recordset[0].NextInvoiceSequence;
  } else {
    await newReq()
      .input("ensureOrgId", sql.Int, organizationId)
      .query(`
        IF NOT EXISTS (SELECT 1 FROM dbo.OrganizationInvoiceSettings WHERE OrganizationID = @ensureOrgId)
          INSERT INTO dbo.OrganizationInvoiceSettings (OrganizationID, TemplateStyle, AccentColor, NextInvoiceSequence)
          VALUES (@ensureOrgId, 'modern', '#0284c7', 1);
      `);
  }

  let seq = currentSeq;
  let code = formatSixDigitInvoiceNumber(seq);

  while (true) {
    code = formatSixDigitInvoiceNumber(seq);
    const check = await newReq()
      .input("loopOrgId", sql.Int, organizationId)
      .input("loopInvoiceNo", sql.NChar(10), code)
      .query<{ id: number }>(`
        SELECT TOP (1) id FROM dbo.Invoices WITH (UPDLOCK, HOLDLOCK)
        WHERE OrganizationID = @loopOrgId AND [Invoice No] = @loopInvoiceNo
      `);
    if (check.recordset.length === 0) {
      break;
    }
    seq++;
  }

  await newReq()
    .input("updOrgId", sql.Int, organizationId)
    .input("nextSeq", sql.Int, seq + 1)
    .query(`
      UPDATE dbo.OrganizationInvoiceSettings
      SET NextInvoiceSequence = @nextSeq
      WHERE OrganizationID = @updOrgId;
    `);

  return code;
}

