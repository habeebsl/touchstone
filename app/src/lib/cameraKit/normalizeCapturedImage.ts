// Camera Kit's `faceDetectionCaptured` event payload shape isn't documented anywhere we could
// reach (see /docs/youcam-api-notes.md) — only that it "provides a capturedResult object
// containing images that can be processed, including handling both base64 strings and Blob
// objects." This normalizer is defensive about where the image data actually lives and what
// format it's in, so the rest of the app only ever deals with a plain File. Tighten this once
// we've logged a real captured payload (the camera-kit-quickstart.html log panel shows it raw).

type CapturedPayload = unknown;

function isBlob(value: unknown): value is Blob {
  return typeof Blob !== "undefined" && value instanceof Blob;
}

function isDataUrl(value: unknown): value is string {
  return typeof value === "string" && value.startsWith("data:");
}

function isLikelyBase64(value: unknown): value is string {
  return typeof value === "string" && value.length > 100 && /^[A-Za-z0-9+/=]+$/.test(value.slice(0, 100));
}

async function toFile(imageData: string | Blob, filename = "capture.jpg"): Promise<File> {
  if (isBlob(imageData)) {
    return new File([imageData], filename, { type: imageData.type || "image/jpeg" });
  }
  const dataUrl = isDataUrl(imageData) ? imageData : `data:image/jpeg;base64,${imageData}`;
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  return new File([blob], filename, { type: blob.type || "image/jpeg" });
}

/**
 * Best-effort extraction of a usable image from whatever shape the SDK hands back.
 * Checks the most plausible locations in order; throws with the raw payload logged if none match
 * so we can see the real shape and fix this function precisely.
 */
export async function normalizeCapturedImage(payload: CapturedPayload): Promise<File> {
  const candidates: unknown[] = [];

  if (payload && typeof payload === "object") {
    const obj = payload as Record<string, unknown>;
    candidates.push(obj.image, obj.imageData, obj.imageBase64, obj.blob, obj.file);
    if (Array.isArray(obj.images) && obj.images.length > 0) {
      const first = obj.images[0] as Record<string, unknown>;
      candidates.push(first, first?.image, first?.imageData, first?.blob);
    }
  } else {
    candidates.push(payload);
  }

  for (const candidate of candidates) {
    if (isBlob(candidate) || isDataUrl(candidate) || isLikelyBase64(candidate)) {
      return toFile(candidate as string | Blob);
    }
  }

  console.error("normalizeCapturedImage: no recognizable image field in payload:", payload);
  throw new Error(
    "Couldn't find an image in the faceDetectionCaptured payload. Check the console log above " +
      "for its real shape and update normalizeCapturedImage accordingly.",
  );
}
