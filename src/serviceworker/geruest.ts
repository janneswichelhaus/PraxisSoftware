/**
 * Was der Service Worker aus seinem Speicher beantwortet (ADR-024 Punkt 1).
 *
 * Genau das Anwendungsgerüst: die Dateien des Builds, deren Liste beim Build
 * entsteht (`scripts/vite-serviceworker.ts`). Alles andere geht unverändert
 * ins Netz - keine Anfrage an Datenbank, Anmeldedienst oder Dateiablage, kein
 * fremder Ursprung, keine Adresse mit Abfrage. Eine Seitenanfrage (Navigation)
 * geht zuerst ins Netz; nur wenn das scheitert, kommt die Einstiegsseite aus
 * dem Speicher, damit die Anwendung sagt, was ohne Netz geht, statt der
 * Fehlerseite des Browsers. Zur Laufzeit wird nie etwas abgelegt.
 *
 * Reine Funktionen, damit der Test die Grenze ohne Browser prüft.
 */

export const GERUEST_PRAEFIX = 'geruest-';
export const EINSTIEG = '/index.html';

export interface Anfrage {
  readonly url: string;
  readonly method: string;
  readonly mode: string;
}

export type Antwortweg =
  /** Aus dem Speicher (die Datei trägt ihre Prüfsumme im Namen). */
  | { readonly art: 'speicher'; readonly pfad: string }
  /** Netz zuerst, ohne Netz die Einstiegsseite aus dem Speicher. */
  | { readonly art: 'einstieg' }
  /** Nicht anfassen - der Browser fragt das Netz wie ohne Service Worker. */
  | null;

export function antwortweg(
  anfrage: Anfrage,
  herkunft: string,
  liste: ReadonlySet<string>,
): Antwortweg {
  if (anfrage.method !== 'GET') return null;
  let url: URL;
  try {
    url = new URL(anfrage.url);
  } catch {
    return null;
  }
  if (url.origin !== herkunft || url.search !== '') return null;
  if (anfrage.mode === 'navigate') return liste.has(EINSTIEG) ? { art: 'einstieg' } : null;
  return liste.has(url.pathname) ? { art: 'speicher', pfad: url.pathname } : null;
}

/** Die Liste des Gerüsts aus den Dateinamen des Builds und von `public/`. */
export function geruestliste(
  buildDateien: readonly string[],
  oeffentlich: readonly string[],
  sw: string,
): string[] {
  const pfade = [...buildDateien, ...oeffentlich]
    .map((name) => `/${name.replace(/\\/g, '/').replace(/^\/+/, '')}`)
    .filter((pfad) => pfad !== `/${sw}` && !/\.(map|txt)$/.test(pfad) && !/\/\./.test(pfad));
  return [...new Set(pfade)].sort();
}
