import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { defineConfig, type Plugin } from "vite";

/**
 * Writes sw.js after the build, listing every built file and versioned by a
 * hash of their contents, so any change at all, index.html and public files
 * included, installs a new service worker.
 */
function serviceWorker(): Plugin {
  return {
    name: "outliner-service-worker",
    apply: "build",
    writeBundle(options) {
      const dir = options.dir!;
      const files = filesUnder(dir).filter((file) => file !== "sw.js").sort();
      const hash = createHash("sha256");
      for (const file of files) hash.update(file).update(readFileSync(join(dir, file)));
      const template = readFileSync("src/sw.template.js", "utf8");
      const precache = [".", ...files.filter((file) => file !== "index.html")];
      writeFileSync(
        join(dir, "sw.js"),
        template.replace("__VERSION__", hash.digest("hex").slice(0, 12)).replace("__PRECACHE__", JSON.stringify(precache)),
      );
    },
  };
}

function filesUnder(dir: string, root = dir): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? filesUnder(join(dir, entry.name), root) : [relative(root, join(dir, entry.name))],
  );
}

export default defineConfig({
  base: "./",
  plugins: [serviceWorker()],
  define: { __BUILD_COMMIT__: JSON.stringify(process.env.BUILD_COMMIT ?? "dev") },
  build: { target: "es2022", sourcemap: false },
  test: { include: ["tests/**/*.test.ts"], environment: "node" },
} as never);
