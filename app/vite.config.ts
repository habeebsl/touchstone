import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/**
 * Serve MediaPipe's wasm from the installed package instead of a CDN, in dev only.
 *
 * Loading `@mediapipe/tasks-vision@latest/wasm` from a CDN against bundled glue at 1.0.1
 * mismatched quietly rather than failing: face detection cost 136ms a frame, which is the
 * non-SIMD build's price. Pinning it to the installed version fixed that.
 *
 * Dev only because the live preview it serves has been cut. The three builds are ~12MB each and
 * were 34MB of a 42MB deploy for code nothing routes to. See components/LivePreview.tsx.
 */
function mediapipeWasm(): Plugin {
  const require = createRequire(import.meta.url);
  // Resolved via the main entry rather than package.json, which the package's exports map hides.
  const root = dirname(require.resolve("@mediapipe/tasks-vision"));
  const prefix = "/mediapipe/";

  // An explicit allow-list, which is also what keeps the dev middleware from being walked out of.
  // vision_bundle.js is the IIFE build: the worker pulls it in with importScripts rather than an
  // ESM import, which is the only form that works in a classic worker under both dev and build.
  const files = new Map<string, string>(
    readdirSync(join(root, "wasm")).map((name) => [
      name,
      join(root, "wasm", name),
    ]),
  );
  files.set("vision_bundle.js", join(root, "vision_bundle.js"));

  return {
    name: "mediapipe-wasm",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split("?")[0];
        if (!url?.startsWith(prefix)) return next();
        const source = files.get(url.slice(prefix.length));
        if (!source) return next();
        res.setHeader(
          "Content-Type",
          source.endsWith(".wasm") ? "application/wasm" : "text/javascript",
        );
        res.end(readFileSync(source));
      });
    },
  };
}

/**
 * The dev-server twin of api/youcam/[...path].ts.
 *
 * Without this, `npm run dev` has no /api routes and the app can only work against a deployed
 * function — so the credential would have to go back into the bundle to develop against, which is
 * the whole problem. Same contract, same env var, same s2s-only restriction.
 */
function youcamProxy(env: Record<string, string>): Plugin {
  const prefix = "/api/youcam/";
  return {
    name: "youcam-proxy",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith(prefix)) return next();

        const path = req.url.slice(prefix.length).split("?")[0];
        const apiKey = env.YOUCAM_API_KEY;
        if (!apiKey) {
          res.statusCode = 500;
          res.end(
            JSON.stringify({
              error: "YOUCAM_API_KEY is not set in .env.local",
            }),
          );
          return;
        }
        if (!path.startsWith("s2s/")) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: "Only s2s paths may be proxied." }));
          return;
        }

        const chunks: Buffer[] = [];
        req.on("data", (chunk) => chunks.push(chunk));
        req.on("end", () => {
          const headers: Record<string, string> = {
            Authorization: `Bearer ${apiKey}`,
          };
          if (typeof req.headers["content-type"] === "string") {
            headers["content-type"] = req.headers["content-type"];
          }
          fetch(
            `https://yce-api-01.makeupar.com/${path}${req.url?.includes("?") ? `?${req.url.split("?")[1]}` : ""}`,
            {
              method: req.method,
              headers,
              body: chunks.length > 0 ? Buffer.concat(chunks) : undefined,
            },
          )
            .then(async (upstream) => {
              res.statusCode = upstream.status;
              const contentType = upstream.headers.get("content-type");
              if (contentType) res.setHeader("content-type", contentType);
              res.end(await upstream.text());
            })
            .catch((err) => {
              res.statusCode = 502;
              res.end(JSON.stringify({ error: String(err) }));
            });
        });
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Loaded with an empty prefix so the *unprefixed* YOUCAM_API_KEY is visible here. Vite only
  // exposes VITE_* to the client, which is exactly why the key is named without it.
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [react(), tailwindcss(), mediapipeWasm(), youcamProxy(env)],
    // The landmarker worker has to be classic rather than a module: MediaPipe loads its wasm glue
    // with importScripts(), which a module worker forbids. Stated explicitly because the failure it
    // produces — "ModuleFactory not set." — names nothing that would lead you back here.
    worker: { format: "iife" },
  };
});
