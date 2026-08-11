interface CameraKitMountProps {
  /** When false the mount is taken out of layout entirely so it cannot displace page content. */
  open: boolean;
}

/**
 * The DOM nodes the Camera Kit SDK takes ownership of.
 *
 * These must exist before `openCameraKit()` is called and must never be unmounted or re-parented
 * by React, so render this once at the app root — outside any conditional screen rendering.
 * Without `#YMK-module` present the SDK throws reading `.style` of null.
 *
 * The SDK renders its UI *inline* into `#YMK-module` rather than portalling it to a layer of its
 * own, so left in normal flow it inflates and pushes every screen down the page. Hence the fixed
 * overlay while open, and zero-size containment while closed.
 *
 * `visibility: hidden` rather than `display: none` when closed: the SDK measures this container
 * on open, and a `display: none` ancestor would report zero dimensions.
 */
export default function CameraKitMount({ open }: CameraKitMountProps) {
  return (
    <div
      aria-hidden={!open}
      className={
        open
          ? "fixed inset-0 z-[9999] bg-black"
          : "pointer-events-none fixed left-0 top-0 h-0 w-0 overflow-hidden opacity-0"
      }
      style={open ? undefined : { visibility: "hidden" }}
    >
      <div id="YMK-module" className="h-full w-full" />
      <div id="captured-results" className="hidden" />
    </div>
  );
}
