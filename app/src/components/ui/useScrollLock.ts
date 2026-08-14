import { useEffect } from "react";

/**
 * Hold the page still while an overlay is open.
 *
 * `overflow: hidden` on the body is not enough: mobile Safari ignores it. Pinning with
 * `position: fixed` works there but jumps to the top, so the offset rides on `top` and is
 * restored on release. The padding replaces the scrollbar pinning removes, without which every
 * fixed-width element shifts ~15px sideways as the overlay opens.
 */
export function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;

    const { body, documentElement } = document;
    const scrollY = window.scrollY;
    const scrollbar = window.innerWidth - documentElement.clientWidth;

    // Restore what was there, not the default: a second overlay closing would otherwise release
    // the lock while the first is still open.
    const previous = {
      position: body.style.position,
      top: body.style.top,
      width: body.style.width,
      overflow: body.style.overflow,
      paddingRight: body.style.paddingRight,
    };

    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.width = "100%";
    body.style.overflow = "hidden";
    if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`;

    return () => {
      body.style.position = previous.position;
      body.style.top = previous.top;
      body.style.width = previous.width;
      body.style.overflow = previous.overflow;
      body.style.paddingRight = previous.paddingRight;
      // Same frame the styles come off, or the restore is visible as a jump.
      window.scrollTo(0, scrollY);
    };
  }, [active]);
}
