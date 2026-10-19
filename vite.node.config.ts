import { defineConfig } from "vite";

const entries: Record<string, string> = { server: "server/main.ts", outline: "cli/main.ts" };

/** Bundles the sync server and the CLI each into a single file Node runs directly; `--mode` picks which. */
export default defineConfig(({ mode }) => ({
  build: {
    ssr: true,
    target: "node24",
    outDir: "dist-node",
    emptyOutDir: false,
    rollupOptions: {
      input: { [mode]: entries[mode] },
      output: { entryFileNames: "[name].mjs", format: "es", inlineDynamicImports: true },
    },
  },
}));
