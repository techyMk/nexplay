"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Fades a section up the first time it scrolls into view. The
 * important property: content is ALWAYS rendered visible. The
 * animation is a one-shot flourish triggered by IntersectionObserver.
 * If the observer never fires (no JS, headless browser, slow device)
 * the user just sees the section without the animation — never blank.
 *
 * Above-the-fold sections animate on initial render because their
 * first observer callback already reports `isIntersecting: true`.
 */
export function RevealSection({
  children,
  className = "",
}: {
  children: ReactNode;
  /** @deprecated kept for API compatibility, no longer used */
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") return;

    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            el.classList.add("reveal-shown");
            obs.disconnect();
            return;
          }
        }
      },
      { threshold: 0.1 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div ref={ref} className={`reveal-section ${className}`}>
      {children}
    </div>
  );
}
