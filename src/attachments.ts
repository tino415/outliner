import { Endpoint } from "./sync/client";
import { downloadFile, sha256Hex, uploadFile } from "./sync/files";
import { attachmentLink } from "./attachmentLinks";

/*
 * Attached files in the browser (doc/adr/0028). A file is kept in IndexedDB
 * under its SHA-256 as soon as it is attached, so it shows offline and on a
 * device without sync; it goes to the sync server on the next sync. A file
 * attached elsewhere is fetched once and then kept here too.
 */

interface StoredFile {
  hash: string;
  type: string;
  blob: Blob;
  uploaded: boolean;
}

let endpointNow: () => Endpoint | null = () => null;

export function bindAttachments(endpoint: () => Endpoint | null): void {
  endpointNow = endpoint;
  showPreviewsIn(document.body);
  new MutationObserver((records) => {
    for (const record of records) record.addedNodes.forEach((node) => node instanceof Element && showPreviewsIn(node));
  }).observe(document.body, { childList: true, subtree: true });
  document.addEventListener("mousedown", (event) => {
    if ((event.target as Element).closest?.(".att-image, .att-is-file .att-label")) event.preventDefault();
  });
  document.addEventListener("click", (event) => {
    const attachment = (event.target as Element).closest?.<HTMLElement>(".att");
    const clickedPreview = (event.target as Element).closest?.(".att-image, .att-is-file .att-label");
    if (attachment && clickedPreview) void openAttachment(attachment);
  });
}

/** Keeps the files and returns the note lines that link them. */
export async function keepFiles(files: File[]): Promise<string[]> {
  const links: string[] = [];
  for (const file of files) {
    const hash = await sha256Hex(await file.arrayBuffer());
    const type = file.type || "application/octet-stream";
    await save({ hash, type, blob: file, uploaded: false });
    links.push(attachmentLink(file.name || "pasted", hash, type));
  }
  void uploadPendingFiles();
  return links;
}

export async function uploadPendingFiles(): Promise<void> {
  const endpoint = endpointNow();
  if (!endpoint) return;
  for (const file of (await allFiles()).filter((stored) => !stored.uploaded)) {
    try {
      await uploadFile(endpoint, file.hash, file.type, file.blob);
      await save({ ...file, uploaded: true });
    } catch (error) {
      console.warn("attachment not uploaded yet", error);
      return;
    }
  }
}

const urls = new Map<string, Promise<string | null>>();

function urlFor(hash: string): Promise<string | null> {
  if (!urls.has(hash)) {
    const url = blobFor(hash).then((blob) => (blob ? URL.createObjectURL(blob) : null));
    urls.set(hash, url);
    url.then((found) => found ?? urls.delete(hash));
  }
  return urls.get(hash)!;
}

async function blobFor(hash: string): Promise<Blob | null> {
  const local = await load(hash);
  if (local) return local.blob;
  const endpoint = endpointNow();
  if (!endpoint) return null;
  const fetched = await downloadFile(endpoint, hash).catch(() => null);
  if (fetched) await save({ hash, type: fetched.type, blob: fetched, uploaded: true });
  return fetched;
}

function showPreviewsIn(root: Element): void {
  for (const image of root.querySelectorAll<HTMLImageElement>("img.att-image:not([src])")) {
    void urlFor(image.dataset.att!).then((url) => {
      if (url) image.src = url;
      else image.classList.add("missing");
    });
  }
}

async function openAttachment(attachment: HTMLElement): Promise<void> {
  const url = await urlFor(attachment.dataset.att!);
  if (!url) return;
  const link = document.createElement("a");
  link.href = url;
  if (attachment.classList.contains("att-is-image")) Object.assign(link, { target: "_blank", rel: "noopener" });
  else link.download = attachment.dataset.name ?? "file";
  link.click();
}

// ---- IndexedDB ---------------------------------------------------------------------------

let opened: Promise<IDBDatabase> | null = null;

function database(): Promise<IDBDatabase> {
  opened ??= new Promise((resolve, reject) => {
    const request = indexedDB.open("outliner-lab-files", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("files", { keyPath: "hash" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return opened;
}

async function inStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const store = (await database()).transaction("files", mode).objectStore("files");
  return new Promise((resolve, reject) => {
    const request = run(store);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

const save = (file: StoredFile) => inStore("readwrite", (store) => store.put(file));
const load = (hash: string) => inStore<StoredFile | undefined>("readonly", (store) => store.get(hash));
const allFiles = () => inStore<StoredFile[]>("readonly", (store) => store.getAll());
