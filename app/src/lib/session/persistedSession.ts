import type { FilledLook } from "../colorEngine/template";
import type { GarmentSwatch } from "../garment/palette";
import type { ColourProfile } from "../colorEngine/season";
import type { FacialColorTonesResult, FitzpatrickScale } from "../youcam/types";

// Bumped whenever the stored shape changes. A session written by an older build restored
// *partially* once — its profile cited a Fitzpatrick type that the session itself no longer
// carried — and a stale entry that half-works is worse than none.
const KEY = "undertone.session.v4";

/**
 * Makeup VTO returns pre-signed URLs that expire after 2 hours. Expire our cache well before
 * that so a restored session never renders broken images.
 */
const TTL_MS = 90 * 60 * 1000;

export interface PersistedSession {
  savedAt: number;
  fileId: string;
  colors: FacialColorTonesResult["color"];
  profile: ColourProfile;
  /** Kept so a restored session does not claim the depth was estimated without it. */
  fitzpatrick: FitzpatrickScale | null;
  /**
   * The outfit her looks were built around, so a restore can derive the same set.
   *
   * Previously dropped, which meant a reload silently rebuilt an outfit-influenced session as if
   * she had skipped the question. Template selection depends on it, so without it the looks that
   * come back are not the looks that were paid for.
   */
  garment: GarmentSwatch[] | null;
  /**
   * A downscaled copy of her photo, for the foundation comparison's bare side.
   *
   * The live version is an object URL, which does not survive a reload. Null when the downscale
   * failed, which the comparison handles by saying so rather than by offering a dead button.
   */
  sourceImage: string | null;
  looks: Array<{ look: FilledLook; imageUrl: string }>;
  selectedTemplateId: string | null;
}

/**
 * Survives a page reload.
 *
 * A completed run costs 35 API units against a 1,000-unit budget, so losing it to an
 * accidental refresh — or to mobile Safari discarding the tab under memory pressure, which this
 * app invites with WASM, WebGL and a live camera — is expensive. Only a *finished* analysis is
 * stored: an in-flight one has pending network promises that cannot be resumed.
 *
 * sessionStorage, not localStorage: this is deliberately per-tab and temporary. The product has
 * no "save your looks" feature and shouldn't imply one.
 */
export function loadSession(): PersistedSession | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as PersistedSession;
    if (typeof parsed?.savedAt !== "number" || !Array.isArray(parsed.looks) || parsed.looks.length === 0) {
      return null;
    }

    // Validate shape before handing it to the UI. A session written by an older build would
    // otherwise crash rendering on a missing field, which surfaces as a blank page.
    const wellFormed = parsed.looks.every(
      (entry) =>
        typeof entry?.imageUrl === "string" &&
        typeof entry?.look?.label === "string" &&
        typeof entry?.look?.templateId === "string" &&
        typeof entry?.look?.lipColor === "string" &&
        typeof entry?.look?.blushColor === "string",
    );
    if (!wellFormed || typeof parsed.colors?.skin_color !== "string") {
      clearSession();
      return null;
    }
    if (Date.now() - parsed.savedAt > TTL_MS) {
      clearSession();
      return null;
    }
    return parsed;
  } catch {
    // Corrupt or unavailable storage should never break the app; just start fresh.
    return null;
  }
}

export function saveSession(session: Omit<PersistedSession, "savedAt">): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ ...session, savedAt: Date.now() }));
  } catch {
    // Private mode or quota exceeded — persistence is a nicety, not a requirement.
  }
}

export function clearSession(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
