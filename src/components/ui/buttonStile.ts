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
//
// Maße nach DS-001: 48 px hoch, Radius 10, Schrift 16 px in 700
// (`--type-button`). Der abgeschaltete Zustand nimmt seit DS-001 eigene
// Farben statt einer Deckkraft von 55 % - das Design System verlangt
// ausdruecklich "Text bleibt lesbar, 4.5:1", und eine halbdurchsichtige
// Schrift erfuellt das nicht.
const basis =
  'nicht-drucken inline-flex h-12 items-center justify-center gap-2 rounded-button px-5 ' +
  'text-base font-bold transition-colors disabled:cursor-not-allowed ' +
  'disabled:bg-surface-sunken disabled:text-ink-muted';

const varianten: Record<Variant, string> = {
  // Der helle Text auf der Hauptfarbe ist Papier, nicht Weiss
  // (`--action-primary-text`) - 10.5:1.
  primary: 'bg-accent text-surface hover:bg-accent-hover',
  // Sekundaer traegt keinen eigenen Grund, nur Rahmen und Hauptfarbe; der
  // Rahmen ist `line-strong`, weil er ein Bedienelement umrandet (3:1).
  secondary: 'border border-line-strong bg-transparent text-accent hover:bg-accent-soft',
  quiet: 'text-accent hover:bg-surface-sunken',
};

export function buttonKlassen(variant: Variant = 'primary', zusatz = ''): string {
  return `${basis} ${varianten[variant]} ${zusatz}`.trim();
}

/**
 * Dieselben Varianten, kompakter (UX-001).
 *
 * Eine Tageskarte trägt mehrere Aktionen nebeneinander - anrufen, navigieren,
 * abschließen. In voller Größe brechen sie auf dem Telefon in drei Zeilen um.
 * Kleiner ist hier ausschließlich Schrift und waagerechte Polsterung.
 *
 * **Die Höhe bleibt bei 44 px, nicht 40.** Das Design System nennt beides:
 * `--control-height-sm: 40px` und „Ziele ≥ 44". Für einen Knopf ohne
 * umgebende Polsterung widersprechen sich die zwei Angaben, und dann gilt
 * die zugängliche Lesart — ein Tippziel von 44 px ist nach der
 * Oberflächen-Checkliste Punkt 1 nicht verhandelbar.
 */
const kompakt =
  'nicht-drucken inline-flex min-h-11 items-center justify-center gap-2 rounded-button px-4 ' +
  'text-sm font-bold transition-colors disabled:cursor-not-allowed ' +
  'disabled:bg-surface-sunken disabled:text-ink-muted';

export function kartenAktionKlassen(variant: Variant = 'secondary', zusatz = ''): string {
  return `${kompakt} ${varianten[variant]} ${zusatz}`.trim();
}
