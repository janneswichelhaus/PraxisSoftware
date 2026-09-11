/**
 * Die Klassen einer Schaltfläche — geteilt von `Button` und `ButtonLink`.
 *
 * Eigene Datei, weil eine Modul-Datei mit Komponente *und* Hilfsfunktion das
 * schnelle Neuladen im Entwicklungsserver aushebelt (`react-refresh`). Der
 * eigentliche Grund für das Teilen bleibt: eine Schaltfläche und ein Link, der
 * wie eine aussieht, sollen nach der nächsten Änderung immer noch gleich
 * aussehen.
 */
export type Variant = 'primary' | 'secondary' | 'quiet';

// `nicht-drucken`: eine Schaltflaeche ist auf Papier nutzlos und kostet Platz.
// Hier statt in der Druckregel, weil ButtonLink ein <a> erzeugt - die Regel
// `button { display: none }` wuerde ihn nicht erfassen (UI-000).
const basis =
  'nicht-drucken inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 ' +
  'text-[0.9375rem] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-55';

const varianten: Record<Variant, string> = {
  primary: 'bg-accent text-white hover:bg-accent-hover',
  secondary: 'border border-line-strong bg-surface text-ink hover:bg-surface-sunken',
  quiet: 'text-ink-muted hover:bg-surface-sunken hover:text-ink',
};

export function buttonKlassen(variant: Variant = 'primary', zusatz = ''): string {
  return `${basis} ${varianten[variant]} ${zusatz}`.trim();
}

/**
 * Dieselben Varianten, kompakter (UX-001).
 *
 * Eine Tageskarte trägt mehrere Aktionen nebeneinander - anrufen, navigieren,
 * abschließen. In voller Größe brechen sie auf dem Telefon in drei Zeilen um.
 * Kleiner ist hier ausschließlich Schrift und waagerechte Polsterung: Die
 * Höhe bleibt bei `min-h-11`, weil ein Tippziel von 44 px nicht verhandelbar
 * ist (Oberflächen-Checkliste Punkt 1).
 */
const kompakt =
  'nicht-drucken inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 ' +
  'text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-55';

export function kartenAktionKlassen(variant: Variant = 'secondary', zusatz = ''): string {
  return `${kompakt} ${varianten[variant]} ${zusatz}`.trim();
}
