import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import fs from "fs/promises";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { componentTagger } from "lovable-tagger";
import { changelogPlugin } from "./vite-changelog-plugin.js";

const getBuildInfo = () => {
  let sha = "nogit";
  let dirty = false;
  try {
    sha = execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString("utf8").trim() || "nogit";
    dirty = Boolean(execSync("git status --porcelain", { stdio: ["ignore", "pipe", "ignore"] }).toString("utf8").trim());
  } catch {
    // Ignore if git isn't available (e.g., packaged build context)
  }

  let pkgVersion = "0.0.0";
  try {
    const pkgRaw = readFileSync(path.resolve(__dirname, "package.json"), "utf8");
    const parsed = JSON.parse(pkgRaw) as { version?: unknown };
    if (typeof parsed.version === "string" && parsed.version.trim()) pkgVersion = parsed.version.trim();
  } catch {
    // Ignore parse errors; fallback to 0.0.0
  }

  return {
    pkgVersion,
    sha,
    dirty,
    builtAt: new Date().toISOString(),
  };
};

const BUILD_INFO = getBuildInfo();

const localFutureFeaturesPlugin = () => ({
  name: "local-future-features",
  apply: "serve",
  configureServer(server: any) {
    // Local-only endpoint to expose the current working version from docs/verification-log.md.
    // Useful for aligning the in-app version badge during local dev without depending on DB RPC.
    server.middlewares.use("/__dev__/verification-version", async (req: any, res: any, next: any) => {
      if (req.method !== "GET") return next();
      try {
        const filePath = path.resolve(__dirname, "./docs/verification-log.md");
        const content = await fs.readFile(filePath, "utf8");
        const match = content.match(/^\s*Current Working Version:\s*(v?([0-9]+(?:\.[0-9]+)*))\s*$/m);
        const version = match?.[1] || null;
        const patchMatch = content.match(/^\s*Current Working Patch:\s*([0-9]+)\s*$/m);
        const patch = patchMatch ? Number(patchMatch[1]) : null;
        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ ok: true, version, patch: Number.isFinite(patch) ? patch : null }));
      } catch (e: any) {
        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ ok: false, version: null, patch: null, error: e?.message || "read_failed" }));
      }
    });

    server.middlewares.use("/__dev__/future-features", async (req: any, res: any, next: any) => {
      if (req.method !== "POST") {
        res.statusCode = 405;
        res.setHeader("content-type", "text/plain");
        res.end("Method Not Allowed");
        return;
      }

      try {
        const body: string = await new Promise((resolve, reject) => {
          let data = "";
          req.on("data", (chunk: any) => {
            data += chunk.toString("utf8");
            if (data.length > 200_000) {
              reject(new Error("Payload too large"));
              req.destroy();
            }
          });
          req.on("end", () => resolve(data));
          req.on("error", reject);
        });

        const parsed = JSON.parse(body || "{}") as { entryMarkdown?: string };
        const entryMarkdown = typeof parsed.entryMarkdown === "string" ? parsed.entryMarkdown : "";
        if (!entryMarkdown.trim()) {
          res.statusCode = 400;
          res.setHeader("content-type", "text/plain");
          res.end("Missing entryMarkdown");
          return;
        }

        const filePath = path.resolve(__dirname, "./docs/future-features.md");
        const existing = await fs.readFile(filePath, "utf8").catch(() => "");
        const needsNewline = existing.length > 0 && !existing.endsWith("\n");
        const normalizedEntry = entryMarkdown.trimEnd() + "\n";
        const toAppend = (needsNewline ? "\n" : "") + "\n" + normalizedEntry;
        await fs.appendFile(filePath, toAppend, "utf8");

        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ ok: true }));
      } catch (e: any) {
        res.statusCode = 500;
        res.setHeader("content-type", "text/plain");
        res.end(e?.message || "Failed to append future-features.md");
      }
    });
  },
});

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [localFutureFeaturesPlugin(), changelogPlugin(), react(), mode === "development" && componentTagger()].filter(Boolean),
  define: {
    __APP_PKG_VERSION__: JSON.stringify(BUILD_INFO.pkgVersion),
    __APP_GIT_SHA__: JSON.stringify(BUILD_INFO.sha),
    __APP_GIT_DIRTY__: JSON.stringify(BUILD_INFO.dirty),
    __APP_BUILT_AT__: JSON.stringify(BUILD_INFO.builtAt),
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
