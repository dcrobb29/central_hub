import assert from "node:assert/strict";
import { test } from "node:test";
import { PROJECT_FILE_LIMIT, parseByteRange, projectFileType, safeProjectFileName } from "./project-attachment-policy.ts";

test("documents and media are distinct and active content is not previewable", () => {
  assert.equal(projectFileType("contract.PDF", "document"), "application/pdf");
  assert.equal(projectFileType("site.jpg", "media"), "image/jpeg");
  assert.equal(projectFileType("site.mp4", "media"), "video/mp4");
  assert.equal(projectFileType("contract.pdf", "media"), null);
  assert.equal(projectFileType("site.jpg", "document"), null);
  for (const file of ["unsafe.html", "unsafe.svg", "unsafe.exe", "unsafe.constructor", "unsafe.__proto__"]) {
    assert.equal(projectFileType(file, "document"), null);
    assert.equal(projectFileType(file, "media"), null);
  }
  assert.equal(PROJECT_FILE_LIMIT, 104857600);
});

test("display file names cannot introduce storage paths or control characters", () => {
  assert.equal(safeProjectFileName("..\\contracts\\signed.pdf"), "signed.pdf");
  assert.equal(safeProjectFileName("../site/photo.jpg"), "photo.jpg");
  assert.equal(safeProjectFileName("signed\r\ncontract.pdf"), "signedcontract.pdf");
  assert.throws(() => safeProjectFileName(""), /file name/);
  assert.throws(() => safeProjectFileName("a".repeat(256)), /file name/);
});

test("video byte ranges include bounded, open-ended and suffix requests", () => {
  assert.equal(parseByteRange(null, 100), null);
  assert.deepEqual(parseByteRange("bytes=0-9", 100), { start: 0, end: 9 });
  assert.deepEqual(parseByteRange("bytes=50-", 100), { start: 50, end: 99 });
  assert.deepEqual(parseByteRange("bytes=-10", 100), { start: 90, end: 99 });
  assert.deepEqual(parseByteRange("bytes=0-999", 100), { start: 0, end: 99 });
  assert.deepEqual(parseByteRange("bytes=-999", 100), { start: 0, end: 99 });
  for (const range of ["bytes=100-", "bytes=9-0", "bytes=-0", "bytes=-", "bytes=0-1,4-5", "nonsense"]) {
    assert.throws(() => parseByteRange(range, 100), /Invalid byte range/);
  }
});
