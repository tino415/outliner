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
  const hash = attachment.dataset.att!;
  const name = attachment.dataset.name ?? "";
  const url = await urlFor(hash);
  if (!url) return;
  if (attachment.classList.contains("att-is-image")) return showViewer(url, name);
  const page = isPageChild(attachment, name) ? await blobFor(hash) : null;
  if (page) return showPage(page, url, name).catch(() => download(url, name));
  download(url, name || "file");
}

function isPageChild(attachment: HTMLElement, name: string): boolean {
  return /\.html?$/i.test(name) && attachment.closest(".attachment > .row .text") !== null;
}

function download(url: string, name: string): void {
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
}

// ---- the viewers -------------------------------------------------------------------------

let closeViewer: (() => void) | null = null;

function showViewer(url: string, name: string): void {
  if (closeViewer) return;
  const viewer = Object.assign(document.createElement("div"), { className: "viewer" });
  viewer.setAttribute("role", "dialog");
  viewer.setAttribute("aria-label", name || "Picture");
  const picture = Object.assign(document.createElement("img"), { src: url, alt: name });
  viewer.append(picture);
  const closeAndGoBack = showUntilEscapeOrBack(viewer);

  const view = { scale: 1, x: 0, y: 0 };
  const paint = () => (picture.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`);
  const zoomBy = (factor: number) => {
    view.scale = Math.min(8, Math.max(1, view.scale * factor));
    keepOnScreen();
  };
  const keepOnScreen = () => {
    const reachX = (picture.offsetWidth * (view.scale - 1)) / 2;
    const reachY = (picture.offsetHeight * (view.scale - 1)) / 2;
    view.x = Math.min(reachX, Math.max(-reachX, view.x));
    view.y = Math.min(reachY, Math.max(-reachY, view.y));
    paint();
  };
  viewer.addEventListener("wheel", (event) => {
    event.preventDefault();
    zoomBy(event.deltaY < 0 ? 1.15 : 1 / 1.15);
  }, { passive: false });

  const pointers = new Map<number, { x: number; y: number }>();
  picture.addEventListener("pointerdown", (event) => {
    picture.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  });
  picture.addEventListener("pointermove", (event) => {
    const before = pointers.get(event.pointerId);
    if (!before) return;
    const others = [...pointers].filter(([id]) => id !== event.pointerId).map(([, point]) => point);
    if (others.length === 1) zoomBy(Math.hypot(event.clientX - others[0].x, event.clientY - others[0].y) / Math.hypot(before.x - others[0].x, before.y - others[0].y));
    else if (view.scale > 1) Object.assign(view, { x: view.x + event.clientX - before.x, y: view.y + event.clientY - before.y });
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    keepOnScreen();
  });
  for (const type of ["pointerup", "pointercancel"]) picture.addEventListener(type, (event) => pointers.delete((event as PointerEvent).pointerId));

  viewer.addEventListener("click", (event) => event.target === viewer && closeAndGoBack());
}

const LARGEST_DATA_URL_PAGE = 1_400_000;

async function showPage(file: Blob, fileUrl: string, name: string): Promise<void> {
  const page = new Blob([PAGE_PREFIX, file], { type: "text/html;charset=utf-8" });
  const dataUrl = file.size > LARGEST_DATA_URL_PAGE ? null : await dataUrlOf(page);
  if (closeViewer) return;
  const blobUrl = dataUrl === null ? URL.createObjectURL(page) : null;
  const viewer = Object.assign(document.createElement("div"), { className: "viewer viewer-page" });
  viewer.setAttribute("role", "dialog");
  viewer.setAttribute("aria-label", name);
  const bar = Object.assign(document.createElement("header"), { className: "viewer-bar" });
  bar.innerHTML =
    `<span class="viewer-name"></span>` +
    `<button class="link-button viewer-download" type="button">Download</button>` +
    `<button class="icon-button viewer-close" type="button" aria-label="Close"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15" /></svg></button>`;
  bar.querySelector(".viewer-name")!.textContent = name;
  const frame = Object.assign(document.createElement("iframe"), { className: "viewer-frame", title: name, referrerPolicy: "no-referrer" });
  frame.setAttribute("sandbox", "allow-scripts");
  frame.src = dataUrl ?? blobUrl!;
  viewer.append(bar, frame);

  const closeOnMessage = (event: MessageEvent) => {
    if (event.source === frame.contentWindow && event.data?.type === "close-viewer") closeAndGoBack();
  };
  window.addEventListener("message", closeOnMessage);
  const focusedBefore = document.activeElement as HTMLElement | null;
  const closeAndGoBack = showUntilEscapeOrBack(viewer, () => {
    window.removeEventListener("message", closeOnMessage);
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    focusedBefore?.focus();
  });
  bar.querySelector(".viewer-close")!.addEventListener("click", closeAndGoBack);
  bar.querySelector(".viewer-download")!.addEventListener("click", () => download(fileUrl, name));
  bar.querySelector<HTMLElement>(".viewer-close")!.focus();
}

const PAGE_CSP =
  "default-src 'none'; script-src 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; form-action 'none'";

const PAGE_SCRIPT = `
addEventListener("click", (event) => {
  const link = event.target.closest && event.target.closest("a, area");
  const href = link && (link.getAttribute("href") ?? link.getAttributeNS("http://www.w3.org/1999/xlink", "href"));
  if (typeof href !== "string") return;
  event.preventDefault();
  if (href[0] !== "#") return;
  const id = decodeURIComponent(href.slice(1));
  const target = id === "" ? document.documentElement : document.getElementById(id) || document.getElementsByName(id)[0];
  if (target) target.scrollIntoView();
}, true);
addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !event.defaultPrevented) parent.postMessage({ type: "close-viewer" }, "*");
});`;

const PAGE_PREFIX =
  `<!doctype html><meta charset="utf-8"><meta name="referrer" content="no-referrer">` +
  `<meta http-equiv="Content-Security-Policy" content="${PAGE_CSP}">` +
  `<script>${PAGE_SCRIPT}</script>`;

function dataUrlOf(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function showUntilEscapeOrBack(viewer: HTMLElement, onClose: () => void = () => {}): () => void {
  document.body.append(viewer);
  history.pushState({ viewer: true }, "");
  const closeOnEscape = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    closeAndGoBack();
  };
  const remove = () => {
    viewer.remove();
    document.removeEventListener("keydown", closeOnEscape, true);
    window.removeEventListener("popstate", remove);
    onClose();
    closeViewer = null;
  };
  const closeAndGoBack = () => {
    remove();
    history.back();
  };
  document.addEventListener("keydown", closeOnEscape, true);
  window.addEventListener("popstate", remove);
  closeViewer = remove;
  return closeAndGoBack;
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
