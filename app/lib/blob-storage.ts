import { DefaultAzureCredential, ManagedIdentityCredential } from "@azure/identity";
import { BlobServiceClient, type ContainerClient } from "@azure/storage-blob";
import { ProjectAccessError } from "./project-access-error";

let container: ContainerClient | undefined;

export function blobContainer(): ContainerClient | null {
  const account = process.env.AZURE_STORAGE_ACCOUNT_NAME?.trim();
  const name = process.env.AZURE_STORAGE_CONTAINER_NAME?.trim();
  if (!account && !name && !process.env.WEBSITE_INSTANCE_ID) return null;
  if (!account || !/^[a-z0-9]{3,24}$/.test(account)
    || !name || !/^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])$/.test(name) || name.includes("--")) {
    throw new Error("Configure valid AZURE_STORAGE_ACCOUNT_NAME and AZURE_STORAGE_CONTAINER_NAME values.");
  }
  if (!container) {
    const credential = process.env.WEBSITE_INSTANCE_ID
      ? new ManagedIdentityCredential()
      : new DefaultAzureCredential();
    container = new BlobServiceClient(`https://${account}.blob.core.windows.net`, credential).getContainerClient(name);
  }
  return container;
}

export function isBlobError(error: unknown, status: number): boolean {
  return error instanceof Error && "statusCode" in error && error.statusCode === status
    && !("code" in error && error.code === "ContainerNotFound");
}

export function describeBlobError(error: unknown): never {
  if (isBlobError(error, 404)) throw new ProjectAccessError("Not found", 404);
  if (isBlobError(error, 409) || isBlobError(error, 412)) {
    throw new ProjectAccessError("An item with that name already exists", 409);
  }
  throw error;
}

export async function uploadBlob(container: ContainerClient, key: string, data: Buffer, contentType: string) {
  try {
    await container.getBlockBlobClient(key).uploadData(data, {
      conditions: { ifNoneMatch: "*" },
      blobHTTPHeaders: { blobContentType: contentType },
    });
  } catch (error) {
    describeBlobError(error);
  }
}

export async function blobExists(container: ContainerClient, key: string): Promise<boolean> {
  try {
    await container.getBlobClient(key).getProperties();
    return true;
  } catch (error) {
    if (isBlobError(error, 404)) return false;
    throw error;
  }
}

export async function blobSize(container: ContainerClient, key: string): Promise<number> {
  try {
    const { contentLength } = await container.getBlobClient(key).getProperties();
    if (contentLength === undefined || !Number.isSafeInteger(contentLength) || contentLength < 0) {
      throw new Error("Blob storage returned an invalid content length.");
    }
    return contentLength;
  } catch (error) {
    describeBlobError(error);
  }
}
