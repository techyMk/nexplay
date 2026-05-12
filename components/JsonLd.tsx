/**
 * Inlines a JSON-LD structured-data block. Server-rendered so search
 * engines see it on first crawl without executing any JS.
 *
 * We don't escape the JSON ourselves — `dangerouslySetInnerHTML` is
 * required because `<script>` is a special element. We do guard
 * against the well-known XSS by escaping the `</` sequence, which is
 * the only way to break out of a script-tag context.
 */
export function JsonLd({ data }: { data: object | object[] }) {
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: json }}
    />
  );
}
