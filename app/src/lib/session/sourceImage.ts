/**
 * A small copy of her photo, cheap enough to keep in sessionStorage.
 *
 * The foundation comparison needs her bare face for the "before" side. During a run that is an
 * object URL over the captured File, which costs nothing and is thrown away on reload, so after a
 * refresh the section had a photo-shaped hole and a dead button that gave no reason for being
 * dead. A restored session otherwise survives a reload completely, which made this the one thing
 * that silently did not.
 *
 * Downscaled rather than stored whole. The wipe renders at 384px, so 640 covers it on a retina
 * screen, and the original 600KB JPEG would be roughly 800KB once base64-encoded against a
 * sessionStorage quota of about 5MB.
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

    // JPEG, not PNG: this is a photograph, and PNG would be several times the size for no gain.
    return canvas.toDataURL("image/jpeg", QUALITY);
  } catch {
    // Never worth failing a run over. The comparison degrades to explaining itself instead.
    return null;
  }
}
