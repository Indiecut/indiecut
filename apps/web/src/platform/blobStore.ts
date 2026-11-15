import { BLOB_SCHEME, basenamePath } from "./paths";

const blobs = new Map<string, File | Blob>();

export function registerBlob(file: File | Blob, preferredName?: string): string {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const name =
    preferredName ||
    (file instanceof File && file.name ? file.name : "upload.bin");
  const path = `${BLOB_SCHEME}/uploads/${id}/${basenamePath(name)}`;
  blobs.set(path, file);
  return path;
}

export function getBlob(path: string): File | Blob | undefined {
  return blobs.get(path);
}

export async function readBlobBytes(path: string): Promise<Uint8Array> {
  const blob = blobs.get(path);
  if (!blob) throw new Error(`Unknown upload path: ${path}`);
  return new Uint8Array(await blob.arrayBuffer());
}

export function hasBlob(path: string): boolean {
  return blobs.has(path);
}

export function forgetBlob(path: string): void {
  blobs.delete(path);
}
