import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";
import mammoth from "mammoth";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";
import { resolveSafePath } from "@/app/lib/file-storage";

const MAX_ROWS = 500;
const MAX_COLS = 50;

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function previewDocx(filePath: string) {
  const result = await mammoth.convertToHtml({ path: filePath });
  return { kind: "html" as const, html: result.value };
}

async function previewXlsx(filePath: string) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  const sheetsHtml = workbook.worksheets.map((sheet) => {
    const rows: string[] = [];
    const rowCount = Math.min(sheet.rowCount, MAX_ROWS);
    for (let r = 1; r <= rowCount; r++) {
      const row = sheet.getRow(r);
      const cells: string[] = [];
      const colCount = Math.min(sheet.columnCount || row.cellCount, MAX_COLS);
      for (let c = 1; c <= colCount; c++) {
        const cell = row.getCell(c);
        const text = cell.value == null ? "" : String(cell.text ?? cell.value);
        cells.push(`<td>${escapeHtml(text)}</td>`);
      }
      rows.push(`<tr>${cells.join("")}</tr>`);
    }
    const truncatedNote =
      sheet.rowCount > MAX_ROWS ? `<p>Showing first ${MAX_ROWS} of ${sheet.rowCount} rows.</p>` : "";
    return `<h3>${escapeHtml(sheet.name)}</h3><table>${rows.join("")}</table>${truncatedNote}`;
  });

  return { kind: "html" as const, html: sheetsHtml.join("<hr/>") };
}

async function previewPptx(filePath: string) {
  const buffer = await fs.readFile(filePath);
  const zip = await JSZip.loadAsync(buffer);

  const slideFiles = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => {
      const aNum = Number(a.match(/slide(\d+)\.xml/)?.[1] ?? 0);
      const bNum = Number(b.match(/slide(\d+)\.xml/)?.[1] ?? 0);
      return aNum - bNum;
    });

  const parser = new XMLParser({ ignoreAttributes: true });

  function extractTextNodes(node: unknown, out: string[]) {
    if (node == null) return;
    if (typeof node === "string") {
      out.push(node);
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((child) => extractTextNodes(child, out));
      return;
    }
    if (typeof node === "object") {
      for (const value of Object.values(node as Record<string, unknown>)) {
        extractTextNodes(value, out);
      }
    }
  }

  const slides = await Promise.all(
    slideFiles.map(async (name, index) => {
      const xml = await zip.files[name].async("string");
      const parsed = parser.parse(xml);
      const texts: string[] = [];
      extractTextNodes(parsed, texts);
      return { index: index + 1, texts: texts.filter((t) => t.trim().length > 0) };
    })
  );

  return { kind: "slides" as const, slides };
}

export async function GET(request: NextRequest) {
  const relativePath = request.nextUrl.searchParams.get("path");
  if (!relativePath) {
    return NextResponse.json({ error: "Missing path" }, { status: 400 });
  }

  let filePath: string;
  try {
    filePath = resolveSafePath(relativePath);
  } catch {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  const ext = path.extname(filePath).toLowerCase();

  try {
    if (ext === ".docx") {
      return NextResponse.json(await previewDocx(filePath));
    }
    if (ext === ".xlsx") {
      return NextResponse.json(await previewXlsx(filePath));
    }
    if (ext === ".pptx") {
      return NextResponse.json(await previewPptx(filePath));
    }
    return NextResponse.json({ error: "Unsupported file type for preview" }, { status: 415 });
  } catch {
    return NextResponse.json({ error: "Failed to generate preview" }, { status: 500 });
  }
}
