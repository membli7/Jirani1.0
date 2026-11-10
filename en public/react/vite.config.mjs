import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const frontendRoot = fileURLToPath(new URL(".", import.meta.url));
const workspaceRoot = resolve(frontendRoot, "..", "..");
const appNodeModules = resolve(workspaceRoot, "chamafork", "node_modules");

export default {
  root: frontendRoot,
  publicDir: false,
  resolve: {
    alias: [
      { find: /^react(?=\/|$)/, replacement: resolve(appNodeModules, "react") },
      { find: /^react-dom(?=\/|$)/, replacement: resolve(appNodeModules, "react-dom") },
    ],
  },
  server: {
    fs: { allow: [workspaceRoot] },
  },
  build: {
    outDir: resolve(frontendRoot, "..", "..", "chamafork", "frontend-dist"),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve(frontendRoot, "index.html"),
        memberLogin: resolve(frontendRoot, "member-login.html"),
        register: resolve(frontendRoot, "register.html"),
        profile: resolve(frontendRoot, "profile.html"),
      },
    },
  },
};
