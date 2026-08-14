// Thin client for the YouCam / Perfect Corp s2s APIs.
// Shapes come from /docs/youcam-api-notes.md — unverified until spikes #2/#3 run against a real key.

import type {
  FacialColorTonesRequest,
  FacialColorTonesResult,
  FileUploadResponse,
  FitzpatrickRequest,
  FitzpatrickResult,
  MakeupVtoRequest,
  MakeupVtoResult,
  TaskResponse,
} from "./types";

/**
 * Our own proxy, not the API. The s2s credential is a server credential, and anything the browser
 * holds the browser can show — a VITE_-prefixed key is inlined into the built JavaScript, which is
 * where this one was. The proxy adds the Authorization header; see api/youcam.ts.
 */
const BASE_URL = "/api/youcam";

export interface YouCamClientOptions {
  /** Overridden only by the probes, which run in node and go direct. */
  baseUrl?: string;
}

function authHeaders(): HeadersInit {
  // No Authorization. The proxy attaches it, and the browser never sees the key.
  return { "Content-Type": "application/json" };
}

export class YouCamClient {
  private baseUrl: string;

  constructor(options: YouCamClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? BASE_URL;
  }

  /**
   * Step 1-2 of the upload flow: get a pre-signed upload URL + file_id, then PUT the bytes there.
   * Returns the file_id, ready to use as src_file_id in a task request.
   */
  async uploadFile(file: File): Promise<string> {
    const initRes = await fetch(`${this.baseUrl}/s2s/v2.0/file`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        files: [
          {
            content_type: file.type,
            file_name: file.name,
            file_size: file.size,
          },
        ],
      }),
    });
    if (!initRes.ok) {
      throw new Error(`File init failed: ${initRes.status} ${await initRes.text()}`);
    }
    const initData = (await initRes.json()) as FileUploadResponse;
    const fileEntry = initData.data.files[0];
    const uploadReq = fileEntry.requests[0];

    const putRes = await fetch(uploadReq.url, {
      method: uploadReq.method,
      headers: uploadReq.headers,
      body: file,
    });
    if (!putRes.ok) {
      throw new Error(`File upload failed: ${putRes.status}`);
    }

    return fileEntry.file_id;
  }

  private async startTask<TReq>(taskPath: string, body: TReq): Promise<string> {
    const res = await fetch(`${this.baseUrl}/s2s/v2.0/task/${taskPath}`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`Task start failed (${taskPath}): ${res.status} ${await res.text()}`);
    }
    const data = (await res.json()) as { status: number; data: { task_id: string } };
    return data.data.task_id;
  }

  private async getTaskStatus<TResult>(
    taskPath: string,
    taskId: string,
  ): Promise<TaskResponse<TResult>> {
    const res = await fetch(`${this.baseUrl}/s2s/v2.0/task/${taskPath}/${taskId}`, {
      method: "GET",
      headers: authHeaders(),
    });
    if (!res.ok) {
      throw new Error(`Task status failed (${taskPath}/${taskId}): ${res.status}`);
    }
    return (await res.json()) as TaskResponse<TResult>;
  }

  /**
   * Poll a task until it reaches success/error, or the timeout elapses.
   */
  private async pollTask<TResult>(
    taskPath: string,
    taskId: string,
    { intervalMs = 1500, timeoutMs = 120_000 }: { intervalMs?: number; timeoutMs?: number } = {},
  ): Promise<TResult> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const status = await this.getTaskStatus<TResult>(taskPath, taskId);
      if (status.data.task_status === "success") {
        if (!status.data.results) throw new Error("Task succeeded but returned no results");
        return status.data.results;
      }
      if (status.data.task_status === "error") {
        throw new Error(
          `Task ${taskPath}/${taskId} failed: ${status.data.failure_reason ?? status.data.error ?? "unknown error"}`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
    throw new Error(`Task ${taskPath}/${taskId} timed out after ${timeoutMs}ms`);
  }

  async analyzeFacialColorTones(
    req: FacialColorTonesRequest,
    pollOpts?: { intervalMs?: number; timeoutMs?: number },
  ): Promise<FacialColorTonesResult> {
    const taskId = await this.startTask("skin-tone-analysis", req);
    return this.pollTask<FacialColorTonesResult>("skin-tone-analysis", taskId, pollOpts);
  }

  async analyzeFitzpatrickSkinType(
    req: FitzpatrickRequest,
    pollOpts?: { intervalMs?: number; timeoutMs?: number },
  ): Promise<FitzpatrickResult> {
    const taskId = await this.startTask("fitzpatrick-scale-analyzer", req);
    return this.pollTask<FitzpatrickResult>("fitzpatrick-scale-analyzer", taskId, pollOpts);
  }

  /**
   * Cut the subject out of a photo — used on an outfit photo so the garment colours can be read
   * without the background competing. Returns a PNG URL with real transparency (verified) and
   * CORS open, so the browser can read its pixels.
   */
  async removeBackground(
    req: { src_file_id?: string; src_file_url?: string },
    pollOpts?: { intervalMs?: number; timeoutMs?: number },
  ): Promise<string> {
    const taskId = await this.startTask("sod", req);
    const result = await this.pollTask<{ url: string }>("sod", taskId, pollOpts);
    return result.url;
  }

  async runMakeupVto(
    req: MakeupVtoRequest,
    pollOpts?: { intervalMs?: number; timeoutMs?: number },
  ): Promise<MakeupVtoResult> {
    const taskId = await this.startTask("makeup-vto", req);
    return this.pollTask<MakeupVtoResult>("makeup-vto", taskId, pollOpts);
  }
}
