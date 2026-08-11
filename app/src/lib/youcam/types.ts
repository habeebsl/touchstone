// Types derived from https://docs.perfectcorp.com reference pages.
// See /docs/youcam-api-notes.md for how these were extracted and open questions.

export type TaskStatus = "running" | "success" | "error";

export interface TaskResponse<T> {
  status: number;
  data: {
    task_status: TaskStatus;
    results?: T;
    failure_reason?: string;
    error?: string;
    error_message?: string;
  };
}

// --- File upload ---

export interface FileUploadRequest {
  files: Array<{
    content_type: string;
    file_name: string;
    file_size: number;
  }>;
}

export interface FileUploadResponse {
  status: number;
  data: {
    files: Array<{
      content_type: string;
      file_name: string;
      file_id: string;
      requests: Array<{
        method: "PUT";
        url: string;
        headers: Record<string, string>;
      }>;
    }>;
  };
}

// --- Facial Color Tones Analyzer (task/skin-tone-analysis) ---

export type EyeColorName = "Amber" | "Brown" | "Green" | "Blue" | "Gray" | "Other";
export type HairColorName = "Auburn" | "Black" | "Blonde" | "Brown" | "Grey/White" | "Red";

/**
 * Only `skin_color` is treated as guaranteed.
 *
 * Confirmed the hard way: a real capture came back without a hair/eye colour name and crashed
 * the engine. The API omits fields it could not determine — hair out of frame, eyes obscured,
 * heavy shadow — so anything but the skin reading has to be optional. Run raw responses through
 * `normaliseMeasured()` before use; the engine works on the normalised form.
 */
export interface FacialColorTonesResult {
  color: {
    skin_color: string;
    eye_color?: string;
    eye_color_name?: EyeColorName;
    lip_color?: string;
    eyebrow_color?: string;
    hair_color?: string;
    hair_color_name?: HairColorName;
  };
  /** Undocumented but returned in practice. */
  face_quality?: {
    has_face: boolean;
    area: string;
    frontal: string;
    lighting: string;
    faceangle: string;
  };
}

export interface FacialColorTonesRequest {
  src_file_id?: string;
  src_file_url?: string;
  face_angle_strictness_level?: "strict" | "high" | "medium" | "low" | "flexible";
}

// --- Fitzpatrick Skin Type Analysis (task/fitzpatrick-scale-analyzer) ---
// Confirmed live 2026-08-10 — see /docs/youcam-api-notes.md.

export type FitzpatrickScale = "I" | "II" | "III" | "IV" | "V" | "VI";

export interface FitzpatrickResult {
  fitzpatrick_scale: FitzpatrickScale;
  timed: number; // processing time in ms
}

export interface FitzpatrickRequest {
  src_file_id?: string;
  src_file_url?: string;
  version: "1.0"; // required — undocumented, confirmed via 400 error live
}

// --- Makeup Virtual Try-On (task/makeup-vto) ---

export type Texture3 = "matte" | "satin" | "shimmer";
export type TextureLiner = "matte" | "shimmer" | "metallic";
export type TextureLip =
  | "matte"
  | "gloss"
  | "holographic"
  | "metallic"
  | "satin"
  | "sheer"
  | "shimmer";

export interface SkinSmoothEffect {
  category: "skin_smooth";
  skinSmoothStrength: number; // 0-100
  skinSmoothColorIntensity: number; // 0-100
}

export interface BlushPalette {
  color: string;
  texture: Texture3;
  colorIntensity: number;
  glowStrength?: number; // required if texture = "satin"
  shimmerColor?: string; // required if texture = "shimmer"
  shimmerDensity?: number; // required if texture = "shimmer"
}

export interface BlushEffect {
  category: "blush";
  pattern: { name: string }; // label from blush.json — determines required palette count
  palettes: BlushPalette[];
}

export interface LipColorPalette {
  color: string;
  texture: TextureLip;
  colorIntensity: number;
  gloss?: number; // required for gloss/holographic/metallic/sheer/shimmer
  shimmerColor?: string; // required for holographic/metallic/shimmer
  shimmerIntensity?: number; // required for holographic/metallic/shimmer
  shimmerDensity?: number; // required for holographic/metallic/shimmer
  shimmerSize?: number; // required for holographic/metallic/shimmer
  transparencyIntensity?: number; // required for gloss/sheer/shimmer
}

export interface LipColorEffect {
  category: "lip_color";
  shape: { name: string }; // label from lipshape.json
  morphology?: { fullness: number; wrinkless: number };
  // Required — confirmed live 2026-08-10 (API rejects the request without it, despite docs implying optional).
  style: {
    type: "full" | "ombre" | "twoTone";
    innerRatio?: number; // required if type = "ombre"
    featherStrength?: number; // required if type = "ombre"
  };
  palettes: LipColorPalette[];
}

export interface EyeLinerPalette {
  color: string;
  texture: TextureLiner;
  shimmerColor?: string; // required if texture in [shimmer, metallic]
  shimmerIntensity?: number; // required if texture in [shimmer, metallic]
  metallicIntensity?: number; // required if texture = metallic
  colorIntensity: number;
}

export interface EyeLinerEffect {
  category: "eye_liner";
  pattern: { name: string };
  palettes: EyeLinerPalette[];
}

export interface EyeShadowPalette {
  color: string;
  texture: TextureLiner;
  shimmerColor?: string;
  shimmerIntensity?: number;
  metallicIntensity?: number;
  colorIntensity: number;
}

export interface EyeShadowEffect {
  category: "eye_shadow";
  pattern: { name: string };
  palettes: EyeShadowPalette[];
}

export interface EyebrowsEffect {
  category: "eyebrows";
  pattern: {
    type?: "shape" | "color";
    name?: string; // required when type = "shape"
    curvature?: number;
    thickness?: number;
    definition?: number;
  };
  palettes: Array<{
    color: string;
    colorIntensity: number;
    texture: "matte" | "shimmer";
    shimmerColor?: string;
    shimmerIntensity?: number;
    shimmerSize?: number;
    shimmerDensity?: number;
  }>;
}

export interface SimpleColorEffect {
  category: "bronzer" | "contour" | "eyelashes";
  pattern: { name: string };
  palettes: Array<{ color: string; colorIntensity: number }>;
}

export interface ConcealerEffect {
  category: "concealer";
  palettes: Array<{
    color: string;
    colorIntensity: number;
    colorUnderEyeIntensity: number;
    coverageLevel: number;
  }>;
}

export interface FoundationEffect {
  category: "foundation";
  palettes: Array<{
    color: string;
    colorIntensity: number;
    glowIntensity: number;
    coverageIntensity: number;
  }>;
}

export interface HighlighterEffect {
  category: "highlighter";
  pattern: { name: string };
  palettes: Array<{
    color: string;
    glowIntensity: number;
    shimmerIntensity: number;
    shimmerDensity: number;
    shimmerSize: number;
    colorIntensity: number;
  }>;
}

export interface LipLinerEffect {
  category: "lip_liner";
  pattern: { name: string };
  palettes: Array<{
    color: string;
    texture: "matte" | "satin";
    colorIntensity: number;
    thickness: number;
    smoothness: number;
  }>;
}

export type MakeupEffect =
  | SkinSmoothEffect
  | BlushEffect
  | LipColorEffect
  | EyeLinerEffect
  | EyeShadowEffect
  | EyebrowsEffect
  | SimpleColorEffect
  | ConcealerEffect
  | FoundationEffect
  | HighlighterEffect
  | LipLinerEffect;

export interface MakeupVtoRequest {
  src_file_id?: string;
  src_file_url?: string;
  effects: MakeupEffect[];
  version: "1.0";
}

export interface MakeupVtoResult {
  // Confirmed live 2026-08-10: singular `url`, a pre-signed S3 link expiring in 2 hours.
  url: string;
}
