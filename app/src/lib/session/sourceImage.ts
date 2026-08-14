/**
 * A small copy of her photo for the foundation comparison's "before" side, cheap enough for
 * sessionStorage. The live version is an object URL, which a reload discards.
 *
 * The wipe renders at 384px, so 640 covers retina. The original would be ~800KB base64 against a
 * ~5MB quota.
 */
const MAX_WIDTH = 640;
const QUALITY = 0.82;

export async function toStoredImage(file: File): Promise<string | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_WIDTH / bitmap.width);
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    // JPEG, not PNG: a photograph, where PNG costs several times the size for no gain.
    return canvas.toDataURL("image/jpeg", QUALITY);
  } catch {
    // Never worth failing a run over; the comparison explains its own absence.
    return null;
  }
}
