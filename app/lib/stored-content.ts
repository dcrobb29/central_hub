import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import type { ContainerClient } from "@azure/storage-blob";
import { describeBlobError } from "./blob-storage";

export type ContentRange = { start: number; end: number };

export function contentStream(stream: Readable): ReadableStream<Uint8Array> {
  const iterator = stream[Symbol.asyncIterator]();
  let cancelled = false;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const chunk = await iterator.next();
        if (cancelled) return;
        if (chunk.done) controller.close();
        else controller.enqueue(typeof chunk.value === "string" ? Buffer.from(chunk.value) : chunk.value);
      } catch (error) {
        if (cancelled) return;
        console.error("Stored file stream failed", error);
        controller.error(error);
      }
    },
    cancel() { cancelled = true; stream.destroy(); },
  });
}

export function localContent(filePath: string, range?: ContentRange) {
  return contentStream(createReadStream(filePath, range));
}

export async function blobContent(container: ContainerClient, key: string, range?: ContentRange) {
  try {
    const response = await container.getBlobClient(key).download(range?.start, range ? range.end - range.start + 1 : undefined);
    if (!response.readableStreamBody) throw new Error("Blob download returned no content stream.");
    return contentStream(Readable.from(response.readableStreamBody));
  } catch (error) {
    describeBlobError(error);
  }
}
