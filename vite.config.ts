import { defineConfig, type PluginOption } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import fs from "fs/promises";
import fsSync from "node:fs";
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
    // Local-only endpoint to expose the current working version from docs/working-version.json.
    // Useful for aligning the in-app version badge during local dev without depending on DB RPC.
    server.middlewares.use("/__dev__/verification-version", async (req: any, res: any, next: any) => {
      if (req.method !== "GET") return next();
      try {
        const filePath = path.resolve(__dirname, "./docs/working-version.json");
        const raw = await fs.readFile(filePath, "utf8");
        const parsed = JSON.parse(raw) as { version?: unknown };
        const version = typeof parsed.version === "string" && parsed.version.trim() ? parsed.version.trim() : null;

        // Best-effort local "uncommitted" counter from git status (excluding docs/future-features.md which is often used as a scratchpad).
        let patch = 0;
        try {
          const porcelain = execSync("git status --porcelain", { stdio: ["ignore", "pipe", "ignore"] }).toString("utf8");
          patch = porcelain
            .split("\n")
            .map((l) => l.trimEnd())
            .filter(Boolean)
            .filter((l) => !l.includes("docs/future-features.md"))
            .length;
        } catch {
          // ignore if git isn't available
        }
        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ ok: true, version, patch }));
      } catch (e: any) {
        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ ok: false, version: null, error: e?.message || "read_failed" }));
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

    server.middlewares.use("/__dev__/playwright-runs", async (req: any, res: any, next: any) => {
      if (req.method !== "GET") return next();
      try {
        const base = "http://localhost";
        const requestUrl = new URL(req.originalUrl || req.url || "/", base);
        const pathname = requestUrl.pathname;
        const outDir = path.resolve(__dirname, "./playwright-recordings");
        const manifestPath = path.join(outDir, "manifest.debug.json");

        const sendJson = (payload: unknown) => {
          res.statusCode = 200;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify(payload));
        };

        if (pathname.endsWith("/manifest")) {
          try {
            const raw = await fs.readFile(manifestPath, "utf8");
            res.statusCode = 200;
            res.setHeader("content-type", "application/json");
            res.end(raw);
          } catch {
            sendJson({ updatedAt: new Date().toISOString(), runs: [] });
          }
          return;
        }

        if (pathname.endsWith("/debug")) {
          const file = String(requestUrl.searchParams.get("file") || "").trim();
          if (!file || file.includes("/") || file.includes("\\")) {
            res.statusCode = 400;
            res.setHeader("content-type", "text/plain");
            res.end("Missing or invalid file query param");
            return;
          }
          const debugPath = path.join(outDir, file);
          if (!debugPath.startsWith(outDir)) {
            res.statusCode = 400;
            res.setHeader("content-type", "text/plain");
            res.end("Invalid path");
            return;
          }
          const raw = await fs.readFile(debugPath, "utf8");
          res.statusCode = 200;
          res.setHeader("content-type", "application/json");
          res.end(raw);
          return;
        }

        if (pathname.includes("/artifact/")) {
          const rawName = decodeURIComponent(pathname.split("/artifact/")[1] || "");
          const safeName = path.basename(rawName);
          if (!safeName || safeName === "." || safeName === "..") {
            res.statusCode = 400;
            res.setHeader("content-type", "text/plain");
            res.end("Invalid artifact name");
            return;
          }
          const artifactPath = path.join(outDir, safeName);
          if (!artifactPath.startsWith(outDir)) {
            res.statusCode = 400;
            res.setHeader("content-type", "text/plain");
            res.end("Invalid path");
            return;
          }
          const exists = fsSync.existsSync(artifactPath);
          if (!exists) {
            res.statusCode = 404;
            res.setHeader("content-type", "text/plain");
            res.end("Artifact not found");
            return;
          }
          const ext = path.extname(safeName).toLowerCase();
          const type = ext === ".json"
            ? "application/json"
            : ext === ".webm"
              ? "video/webm"
              : "application/octet-stream";
          res.statusCode = 200;
          res.setHeader("content-type", type);
          fsSync.createReadStream(artifactPath).pipe(res);
          return;
        }
      } catch (e: any) {
        res.statusCode = 500;
        res.setHeader("content-type", "text/plain");
        res.end(e?.message || "Failed to serve playwright debug artifacts");
        return;
      }

      next();
    });
  },
});

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const plugins: PluginOption[] = [
    localFutureFeaturesPlugin(),
    changelogPlugin(),
    react(),
    mode === "development" ? componentTagger() : null,
  ].filter(Boolean) as PluginOption[];

  return ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins,
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
  });
});
