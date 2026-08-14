/**
 * Does any serverless function deploy at all?
 *
 * The proxy at api/youcam/[...path].ts returns Vercel's NOT_FOUND, which it cannot produce
 * itself, so it is not being invoked. This is the same thing with none of the complications: no
 * catch-all brackets in the filename, no nested directory, no environment variable, no upstream.
 *
 * /api/ping working while /api/youcam/... does not isolates the fault to the catch-all route.
 * Neither working means no function is being deployed, which is a project setting rather than
 * anything in this repository. Delete once the answer is known.
 */
export default function handler(_req: unknown, res: { status(code: number): { json(body: unknown): void } }) {
  res.status(200).json({ ok: true, at: new Date().toISOString() });
}
