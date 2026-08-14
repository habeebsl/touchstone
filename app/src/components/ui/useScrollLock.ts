import { useEffect } from "react";

/**
 * Hold the page still while an overlay is open.
 *
 * `overflow: hidden` on the body alone is the usual fix and it is not enough here. Mobile Safari
 * ignores it and keeps scrolling the page under the sheet, which is the platform this app is
 * built for first. Pinning the body with `position: fixed` does work there, at the cost of the
 * page jumping to the top, so the scroll offset is carried on `top` and put back on release.
 *
 * The padding compensates for the scrollbar that pinning removes. Without it every fixed-width
 * thing on the page shifts sideways by ~15px as the sheet opens, which reads as the layout
 * breaking. It is zero on phones, which have no persistent scrollbar to lose.
 */
export function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;

    const { body, documentElement } = document;
    const scrollY = window.scrollY;
    const scrollbar = window.innerWidth - documentElement.clientWidth;

    // Restore what was there rather than assuming the default: a second overlay opening over the
    // first would otherwise release the lock entirely when only one of them closed.
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
      // Synchronously, in the same frame the styles come off, or the restore is visible as a jump.
      window.scrollTo(0, scrollY);
    };
  }, [active]);
}
