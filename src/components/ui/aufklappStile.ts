/**
 * Der Kopf eines Aufklappers (`<summary>`), geteilt von `Disclosure` und den
 * Seiten, die ihren `<details>` selbst bauen (UIK-07, RSP-07, UEB-03).
 *
 * Eigene Datei aus demselben Grund wie `buttonStile.ts`: eine Modul-Datei mit
 * Komponente *und* Konstante hebelt das schnelle Neuladen aus
 * (`react-refresh`).
 *
 * Was die Klassen festlegen:
 *
 *   * **44 px Mindesthöhe** - der Kopf ist ein Bedienelement (§ 8 der
 *     Prüfreferenz: `Disclosure` maß bis UXR-001 36 px);
 *   * **kein Marker des Browsers** (`list-none`, dazu der WebKit-Marker):
 *     Mit `display: flex` zeichnen Chromium und Firefox ohnehin keinen,
 *     Safari je nach Fassung doch - dann stünden zwei Zeichen da. Das
 *     Zeichen kommt stattdessen aus `Aufklappzeichen` und sieht überall
 *     gleich aus;
 *   * Zeiger und Anordnung in einer Zeile.
 *
 * Schrift und Farbe bestimmt die Stelle. Das `<details>` darum trägt die
 * Klasse `group`, damit sich das Zeichen beim Öffnen dreht.
 */
export const aufklappKopfKlassen =
  'flex min-h-11 cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden';

/**
 * Schrift und Farbe des Kopfs im `Disclosure` (Design-Handoff 2026-10-01,
 * Abschnitt 3): `text` ist der Bestand (14 px), `betont` dasselbe in 600 für
 * einen Titel mit Zähler, `label` der Stil eines Abschnittstitels (12 px
 * Versalien) für das, was am Rechner eine eigene Karte mit Überschrift ist.
 */
export const aufklappKoepfe = {
  text: 'text-ink-muted hover:text-ink text-sm',
  betont: 'text-ink-muted hover:text-ink text-sm font-semibold',
  label: 'text-ink-muted hover:text-ink tracking-label text-xs font-semibold uppercase',
} as const;
