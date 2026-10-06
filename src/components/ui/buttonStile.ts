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
//
// Gesperrt heisst seit Runde 2 (BEF-069 Option 1, Variante B, Handoff Schrift
// und Knoepfe Abschnitt 3): Die Form bleibt als **gestrichelte** Kontur in
// `line-strong` sichtbar, die Flaeche verschwindet, der Text wird leise.
// Vorher war die Flaeche `surface-sunken` - auf der Seitenflaeche derselbe
// Wert, die Knopfform verschwand. Gestrichelt statt durchgezogen, weil ein
// gesperrter Hauptknopf sonst neben einem aktiven Sekundaerknopf fast
// gleich aussah; gestrichelt heisst in der App schon „nicht bedienbar,
// Platzhalter" (belegte Zeit im Kalender, leere Karte). Der Zustand haengt
// deshalb an der Variante, nicht an der Basis.
const basis =
  'nicht-drucken inline-flex h-12 items-center justify-center gap-2 rounded-button px-5 ' +
  'text-base font-bold transition-colors disabled:cursor-not-allowed';

const varianten: Record<Variant, string> = {
  // Der helle Text auf der Hauptfarbe ist Papier, nicht Weiss
  // (`--action-primary-text`) - 10.5:1. Der durchsichtige Rand haelt die
  // Breite fest, wenn der gesperrte Zustand ihn sichtbar macht. Hover nur
  // ungesperrt (`not-disabled`, gilt auch fuer ButtonLink, den `:enabled`
  // als Link nicht traefe).
  primary:
    'border border-transparent bg-accent text-surface not-disabled:hover:bg-accent-hover ' +
    'disabled:border-dashed disabled:border-line-strong disabled:bg-transparent disabled:text-ink-muted',
  // Sekundaer traegt keinen eigenen Grund, nur Rahmen und Hauptfarbe; der
  // Rahmen ist `line-strong`, weil er ein Bedienelement umrandet (3:1).
  secondary:
    'border border-line-strong bg-transparent text-accent not-disabled:hover:bg-accent-soft ' +
    'disabled:border-dashed disabled:text-ink-muted',
  // Leise gesperrt: keine Flaeche - sonst bekaeme „Abbrechen" neben einem
  // gesperrten Hauptknopf ploetzlich einen Kasten.
  quiet: 'text-accent not-disabled:hover:bg-surface-sunken disabled:text-ink-muted',
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
  'text-sm font-bold transition-colors disabled:cursor-not-allowed';

export function kartenAktionKlassen(variant: Variant = 'secondary', zusatz = ''): string {
  return `${kompakt} ${varianten[variant]} ${zusatz}`.trim();
}

/**
 * Größe einer Schaltfläche: `normal` 48 px, `kompakt` 44 px mit 14 px Schrift
 * (die Klassen von `kartenAktionKlassen`). Die Variante bleibt davon
 * unberührt (UIK-14): Wer einen kompakten Knopf braucht, schreibt
 * `<Button groesse="kompakt">` statt eines rohen `<button>` mit Klassen.
 */
export type Groesse = 'normal' | 'kompakt';

export function knopfKlassen(variant: Variant, groesse: Groesse = 'normal', zusatz = ''): string {
  return groesse === 'kompakt'
    ? kartenAktionKlassen(variant, zusatz)
    : buttonKlassen(variant, zusatz);
}

/**
 * Knopf nur mit Symbol (UIK-01): Pfeile, Eckknopf, Lupe.
 *
 * 44 × 44 px (`size-11`) und damit nie unter dem Mindestziel - der Handoff
 * nennt für seinen IconButton 48/40 px, am Telefon gilt aber „Ziele ≥ 44"
 * (Oberflächen-Checkliste Punkt 1). Varianten wie beim Button; ohne Angabe
 * `quiet`, weil ein Symbol ohne Fläche der Regelfall ist.
 */
const symbol =
  'nicht-drucken inline-flex shrink-0 items-center justify-center rounded-button ' +
  'transition-colors disabled:cursor-not-allowed';

/**
 * `gross` (48 px) nur für den Hauptknopf einer Karte - den Haken neben
 * „Doku" (Design-Handoff 2026-10-01, Abschnitt 6a). Die 40 px des Handoffs
 * für den kleinen Haken gibt es nicht: Er bleibt bei 44 (ANN-199).
 */
export type SymbolGroesse = 'normal' | 'gross';

export function symbolknopfKlassen(
  variant: Variant = 'quiet',
  zusatz = '',
  groesse: SymbolGroesse = 'normal',
): string {
  const masse = groesse === 'gross' ? 'size-12' : 'size-11';
  return `${symbol} ${masse} ${varianten[variant]} ${zusatz}`.trim();
}

/**
 * Der Textlink des Systems (TOK-12, UIK-15).
 *
 * Bis UXR-001 gab es keinen und rund 25 Klassenfolgen: mit und ohne
 * Unterstreichung, in Hauptfarbe oder grau, mal 44 px hoch, mal 18. Der
 * Handoff setzt Links in der Hauptfarbe **mit** Unterstreichung, 3 px
 * abgesetzt; Tailwinds Grundstil nimmt die Unterstreichung weg. Ein Link, der
 * nur an der Farbe erkennbar ist, verfehlt WCAG 1.4.1, sobald er neben Text in
 * `ink-muted` steht (1,66:1).
 *
 * `alleinstehend`: Der Link steht für sich - unter einer Karte, neben einem
 * Knopf - und braucht dann ein Tippziel von 44 px Höhe
 * (`inline-flex min-h-11 items-center`). Im Satz bleibt er Teil der Zeile;
 * dort nimmt WCAG 2.5.8 Links ausdrücklich aus.
 *
 * Die Schriftgröße erbt der Link; die Seite setzt sie bei Bedarf dazu.
 */
const textlink =
  'text-accent underline underline-offset-3 transition-colors hover:text-accent-hover';

export function textlinkKlassen(alleinstehend = false, zusatz = ''): string {
  return [textlink, alleinstehend ? 'inline-flex min-h-11 items-center' : '', zusatz]
    .filter(Boolean)
    .join(' ');
}
