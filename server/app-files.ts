import { ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

export async function sendAppFile(response: ServerResponse, appDir: string, path: string): Promise<boolean> {
  const file = appFilePath(appDir, path);
  if (!file) return false;
  try {
    const bytes = await readFile(file);
    response.writeHead(200, {
      "Content-Type": CONTENT_TYPES[extname(file)] ?? "application/octet-stream",
      "Cache-Control": "no-cache",
    });
    response.end(bytes);
    return true;
  } catch {
    return false;
  }
}

function appFilePath(appDir: string, path: string): string | undefined {
  const decoded = decodedPath(path === "/" ? "/index.html" : path);
  if (decoded === undefined) return undefined;
  const root = resolve(appDir);
  const file = join(root, normalize(decoded));
  return file.startsWith(root + sep) ? file : undefined;
}

function decodedPath(path: string): string | undefined {
  try {
    return decodeURIComponent(path);
  } catch {
    return undefined;
  }
}
