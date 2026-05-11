/**
 * Lightweight error telemetry. Posts an event to Sentry's HTTP store
 * endpoint when `NEXT_PUBLIC_SENTRY_DSN` is set. No SDK dependency —
 * the official @sentry/nextjs package is ~80kb gzipped and wires up
 * source maps, replay, performance, etc.  Most of that is overkill
 * for a portfolio project; we just want errors to surface in a
 * dashboard somewhere so the site isn't silently failing.
 *
 * The DSN format Sentry uses is:
 *   https://<publicKey>@<host>/<projectId>
 * which we parse into the store URL:
 *   https://<host>/api/<projectId>/store/?sentry_key=<publicKey>&sentry_version=7
 *
 * If the DSN is missing or malformed we silently no-op — the boundary
 * still logs to the console either way.
 */

type ParsedDsn = {
  storeUrl: string;
  publicKey: string;
};

let cached: ParsedDsn | null | undefined;

function parseDsn(): ParsedDsn | null {
  if (cached !== undefined) return cached;
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) {
    cached = null;
    return null;
  }
  try {
    const u = new URL(dsn);
    const publicKey = u.username;
    const projectId = u.pathname.replace(/^\//, "");
    if (!publicKey || !projectId) {
      cached = null;
      return null;
    }
    cached = {
      publicKey,
      storeUrl: `${u.protocol}//${u.host}/api/${projectId}/store/?sentry_key=${publicKey}&sentry_version=7`,
    };
    return cached;
  } catch {
    cached = null;
    return null;
  }
}

/** Returns true if a Sentry DSN is configured. */
export function isTelemetryEnabled(): boolean {
  return parseDsn() !== null;
}

/**
 * Report an error to Sentry. Fire-and-forget — never throws, never
 * blocks. Failures are logged to the console so a misconfigured DSN
 * doesn't go unnoticed in dev but also doesn't break anything.
 */
export function reportError(
  err: unknown,
  context?: Record<string, unknown>,
): void {
  const parsed = parseDsn();
  if (!parsed) return;
  if (typeof window === "undefined") return;

  const error = err instanceof Error ? err : new Error(String(err));
  const payload = {
    event_id: cryptoRandomId(),
    timestamp: Date.now() / 1000,
    platform: "javascript",
    level: "error",
    logger: "nexplay",
    environment: process.env.NODE_ENV ?? "production",
    release: process.env.NEXT_PUBLIC_BUILD_SHA ?? "dev",
    exception: {
      values: [
        {
          type: error.name || "Error",
          value: error.message || "Unknown error",
          stacktrace: stackToSentryFrames(error.stack),
        },
      ],
    },
    request: {
      url: window.location.href,
      headers: { "User-Agent": navigator.userAgent },
    },
    extra: context,
  };

  // keepalive so a fast navigation doesn't drop the report
  try {
    void fetch(parsed.storeUrl, {
      method: "POST",
      mode: "cors",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch((sendErr) => {
      console.warn("[telemetry] send failed", sendErr);
    });
  } catch (sendErr) {
    console.warn("[telemetry] send threw", sendErr);
  }
}

function cryptoRandomId(): string {
  // Sentry expects a 32-char hex event id.
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID().replace(/-/g, "");
  }
  let s = "";
  for (let i = 0; i < 32; i++) {
    s += Math.floor(Math.random() * 16).toString(16);
  }
  return s;
}

function stackToSentryFrames(stack?: string) {
  if (!stack) return { frames: [] };
  const lines = stack.split("\n").slice(1).reverse(); // outermost first
  return {
    frames: lines.map((line) => {
      const m = line.match(/at (.+?) \((.+?):(\d+):(\d+)\)/) ||
        line.match(/at (.+?):(\d+):(\d+)/);
      if (!m) return { filename: line.trim() };
      if (m.length === 5) {
        return {
          function: m[1],
          filename: m[2],
          lineno: Number(m[3]),
          colno: Number(m[4]),
        };
      }
      return {
        filename: m[1],
        lineno: Number(m[2]),
        colno: Number(m[3]),
      };
    }),
  };
}
