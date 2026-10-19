import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import config from "../../next.config.ts";
import { ImageOptimizerCache } from "next/dist/server/image-optimizer.js";
import { imageConfigDefault } from "next/dist/shared/lib/image-config.js";

test("image optimization stays enabled without initializing or writing a deployment disk cache", async (context) => {
  assert.equal(config.images.maximumDiskCacheSize, 0);
  const images = { ...imageConfigDefault, ...config.images };
  assert.equal(images.unoptimized, false);

  const root = await fs.mkdtemp(path.join(os.tmpdir(), "central-hub-image-cache-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  // A file in place of the build directory makes any cache mkdir/read/write fail.
  const distDir = path.join(root, "read-only-build");
  await fs.writeFile(distDir, "deployment");
  const errors = [];
  context.mock.method(console, "error", (...args) => errors.push(args));
  const cache = new ImageOptimizerCache({
    distDir,
    nextConfig: { ...config, images, experimental: { isrFlushToDisk: true } },
  });
  assert.equal(await cache.get("synthetic-image"), null);
  await cache.set("synthetic-image", {
    kind: "IMAGE",
    buffer: Buffer.from("synthetic optimized content"),
    extension: "webp",
    etag: "test-etag",
    upstreamEtag: "test-upstream",
  }, { cacheControl: { revalidate: 60 } });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(errors, []);
  assert.equal(await fs.readFile(distDir, "utf8"), "deployment");
  assert.deepEqual(await fs.readdir(root), ["read-only-build"]);
});
