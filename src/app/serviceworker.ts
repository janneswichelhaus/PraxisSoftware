/**
 * Registriert den Service Worker (KOM-011, ADR-024 Abschnitt A).
 *
 * Nur im Auslieferungsstand: `pnpm dev` und die E2E-Tests laufen ohne ihn,
 * damit nichts aus einem Speicher kommt, was gerade entwickelt wird. Scheitert
 * die Registrierung, läuft die Anwendung wie bisher - online; der Worker ist
 * eine Zugabe, keine Voraussetzung.
 */

export const SW_PFAD = '/sw.js';

export function registriereServiceWorker(
  auslieferung: boolean = import.meta.env.PROD,
  nav: Pick<Navigator, 'serviceWorker'> | undefined = typeof navigator === 'undefined'
    ? undefined
    : navigator,
): void {
  if (!auslieferung || nav === undefined || !('serviceWorker' in nav)) return;
  void nav.serviceWorker.register(SW_PFAD).catch(() => undefined);
}
