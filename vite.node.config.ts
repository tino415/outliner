import { defineConfig } from "vite";

/** Bundles the sync server and the CLI into single files Node runs directly. */
export default defineConfig({
  build: {
    ssr: true,
    target: "node24",
    outDir: "dist-node",
    emptyOutDir: true,
    rollupOptions: {
      input: { server: "server/main.ts", outline: "cli/main.ts" },
      output: { entryFileNames: "[name].mjs", format: "es" },
    },
  },
});
