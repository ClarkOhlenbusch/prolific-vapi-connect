import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import fs from "fs/promises";
import { componentTagger } from "lovable-tagger";
import { changelogPlugin } from "./vite-changelog-plugin.js";

const localFutureFeaturesPlugin = () => ({
  name: "local-future-features",
  apply: "serve",
  configureServer(server: any) {
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
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
