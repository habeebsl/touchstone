import type { ReactNode } from "react";

/**
 * The designs are drawn at a fixed 375x812 with a shadow, which is mockup framing rather than
 * app behaviour. In the real app the phone IS the frame, so this centres and caps the column on
 * larger screens and otherwise gets out of the way. Mobile-first per DESIGN.md.
 */
export default function MobileFrame({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`mx-auto flex min-h-dvh w-full max-w-[420px] flex-col bg-background ${className}`}>
      {children}
    </div>
  );
}
