"use client";

/**
 * Mounted once at the root layout. Catches uncaught errors and
 * unhandled promise rejections that React's error boundary doesn't
 * see (event handlers, setTimeout callbacks, async lifecycle code,
 * etc.) and ships them to Sentry via lib/telemetry.
 *
 * No-op unless NEXT_PUBLIC_SENTRY_DSN is set.
 */

import { useEffect } from "react";
import { isTelemetryEnabled, reportError } from "@/lib/telemetry";

export function TelemetryListener() {
  useEffect(() => {
    if (!isTelemetryEnabled()) return;

    const onError = (event: ErrorEvent) => {
      reportError(event.error ?? new Error(event.message), {
        source: "window.error",
        filename: event.filename,
        lineno: event.lineno,
      });
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      reportError(event.reason ?? new Error("Unhandled rejection"), {
        source: "unhandledrejection",
      });
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
