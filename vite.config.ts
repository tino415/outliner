import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { defineConfig, type Plugin } from "vite";

/**
 * Emits sw.js with the exact list of files in this build, so the service
 * worker can precache everything the app needs to start offline.
 */
function serviceWorker(): Plugin {
  return {
    name: "outliner-service-worker",
    apply: "build",
    generateBundle(_options, bundle) {
      const files = [".", ...Object.keys(bundle).filter((name) => !name.endsWith(".map"))];
      const version = createHash("sha256").update(files.join("\n")).digest("hex").slice(0, 12);
      const template = readFileSync("src/sw.template.js", "utf8");
      this.emitFile({
        type: "asset",
        fileName: "sw.js",
        source: template
          .replace("__VERSION__", version)
          .replace("__PRECACHE__", JSON.stringify(files.concat(publicFiles))),
      });
    },
  };
}

const publicFiles = [
  "manifest.webmanifest",
  "icons/icon.svg",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/maskable-512.png",
  "icons/apple-touch-icon.png",
];

export default defineConfig({
  base: "./",
  plugins: [serviceWorker()],
  define: { __BUILD_COMMIT__: JSON.stringify(process.env.BUILD_COMMIT ?? "dev") },
  build: { target: "es2022", sourcemap: false },
  test: { include: ["tests/**/*.test.ts"], environment: "node" },
} as never);
