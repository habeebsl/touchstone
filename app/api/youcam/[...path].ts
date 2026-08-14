/**
 * Server-side passthrough to Perfect Corp's s2s API.
 *
 * The app is a browser bundle and the s2s credential is a server credential. Anything Vite sees
 * as VITE_* is inlined into the JavaScript at build time — that is how the browser gets it — so
 * the key was sitting in dist/assets/index-*.js, twice, for any visitor to read. Rotating it
 * changes nothing: the replacement is inlined the same way. The only fix is for the browser never
 * to hold it.
 *
 * So the client calls /api/youcam/... with no credentials, this adds the Authorization header,
 * and the key lives in YOUCAM_API_KEY — deliberately without the VITE_ prefix, so that a future
 * import.meta.env reference cannot quietly put it back in the bundle.
 *
 * A passthrough rather than one route per call: the paths are already the API's own, so there is
 * nothing to design here, and a wrapper per endpoint would be four more places to keep in step
 * with the API. The presigned upload PUT is not proxied at all — it carries its own signature and
 * never sees the key.
 */

const BASE_URL = "https://yce-api-01.makeupar.com";

/** Sent on to the API. Everything else the browser attaches is dropped. */
const FORWARD_REQUEST_HEADERS = ["content-type"];
/** Sent back to the browser. Notably not set-cookie. */
const FORWARD_RESPONSE_HEADERS = ["content-type", "cache-control"];

/**
 * Declared rather than imported from @types/node.
 *
 * Vercel compiles this directory in a pass of its own, and the repo's tsconfig.json is a solution
 * file with `files: []` that only points at the app and node projects. So that pass gets compiler
 * defaults, no `types: ["node"]`, and fails on `process` even though @types/node is installed.
 * Same reason the request and response shapes below are written out instead of pulled from
 * @vercel/node: this file states what it needs and depends on nothing to supply it.
 */
declare const process: { env: Record<string, string | undefined> };

interface VercelRequest {
  method?: string;
  query: Record<string, string | string[]>;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
}

interface VercelResponse {
  status(code: number): VercelResponse;
  setHeader(name: string, value: string): void;
  send(body: string): void;
  json(body: unknown): void;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const apiKey = process.env.YOUCAM_API_KEY;
  if (!apiKey) {
    // Said plainly: this fails at request time rather than at build time, so without a clear
    // message it looks like an API outage rather than a missing environment variable.
    res.status(500).json({ error: "YOUCAM_API_KEY is not set on the server." });
    return;
  }

  const segments = req.query.path;
  const path = Array.isArray(segments) ? segments.join("/") : (segments ?? "");
  if (!path.startsWith("s2s/")) {
    // The proxy exists for the s2s API and nothing else. Without this it is an open relay that
    // signs arbitrary requests with our credential.
    res.status(400).json({ error: "Only s2s paths may be proxied." });
    return;
  }

  const headers: Record<string, string> = { Authorization: `Bearer ${apiKey}` };
  for (const name of FORWARD_REQUEST_HEADERS) {
    const value = req.headers[name];
    if (typeof value === "string") headers[name] = value;
  }

  const upstream = await fetch(`${BASE_URL}/${path}`, {
    method: req.method ?? "GET",
    headers,
    body:
      req.method === "GET" || req.method === "HEAD" || req.body === undefined
        ? undefined
        : typeof req.body === "string"
          ? req.body
          : JSON.stringify(req.body),
  });

  for (const name of FORWARD_RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) res.setHeader(name, value);
  }
  // Passed through as text so an error body reaches the client intact — the API puts its useful
  // failure detail in the body, and parsing it here would lose it on a non-JSON response.
  res.status(upstream.status).send(await upstream.text());
}
