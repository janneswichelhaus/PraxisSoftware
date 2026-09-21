/**
 * Das bisschen Deno, das die Edge Functions benutzen.
 *
 * Edge Functions laufen in Deno, der übrige Baum in Node und im Browser. Ohne
 * diese Erklärung kennte `tsc` weder `Deno.env` noch `Deno.serve` — und
 * `pnpm typecheck` ließe genau die Datei ungeprüft, die keine Testabdeckung
 * hat (`location-provider/index.ts`).
 *
 * Bewusst nur zwei Aufrufe statt der vollständigen Typen des Herstellers: Was
 * hier steht, ist benutzt; was benutzt wird, steht hier. Ein Typpaket dafür
 * wäre eine Abhängigkeit für zwei Signaturen.
 */

declare const Deno: {
  readonly env: { get(name: string): string | undefined };
  serve(handler: (anfrage: Request) => Response | Promise<Response>): unknown;
};
