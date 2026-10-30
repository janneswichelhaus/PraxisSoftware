/**
 * Die Stufen der Plattform für die Überschrift eines Fensters (Handoff
 * 2026-10-22, Abschnitte 2 und 5.3; der Einstieg): `seite` wie ein
 * Seitentitel, 28 und am Rechner 32; `gruss` wie der Gruß, 34 und am Rechner
 * 40, unter 23rem 28. Den Rechner sagt `data-rechner` am Fensterziel der
 * Plattform (`PlattformApp`), nicht `lg:` - wie am Seitentitel (ANN-683).
 * Ein Zeilenumbruch im Titel bleibt einer („Willkommen,“ und der Name).
 * Dieselbe Regel trägt der Gruß der Übersicht (Schritt 1e).
 *
 * Unter 23rem trägt eine Zeile in 28 elf Zeichen. Hat der Titel ein längeres
 * Wort - meist ein Name wie „Langenscheidt“ -, steht er dort in 22 wie der
 * Hero-Titel, damit der Name nicht mitten im Wort bricht (DR-114, ANN-696).
 */

/**
 * Bei „Sehr groß“ steht ein solcher Titel wie unter 23rem: Sonst schob er etwa im Einstieg einer
 * Begleitung „Weiter“ aus dem ersten Bild (ANN-816).
 */
const LANGES_WORT = 'max-[23rem]:text-hero-schmal [[data-schrift=sehr-gross]_&]:text-hero-schmal';
export type Titelstufe = 'seite' | 'gruss' | 'frage';

const TITELSTUFE: Record<Titelstufe, string> = {
  seite:
    'text-accent text-plattform-titel [.plattform-schrift[data-rechner]_&]:text-plattform-titel-rechner whitespace-pre-line',
  gruss:
    'text-accent text-gruss [.plattform-schrift[data-rechner]_&]:text-gruss-rechner whitespace-pre-line',
  // Die Frage eines Ablaufs in 22, in rem: Sie wächst mit „Sehr groß“; unter 23rem trennt ein
  // langes Wort an der Silbe, statt mitten im Wort zu brechen.
  frage: 'text-ink text-abschnitt trennen-schmal',
};

/** So viele Zeichen trägt ein Wort in 28 unter 23rem (188 px, 12 px Rand). */
const ZEICHEN_IN_28_SCHMAL = 11;

/** Das längste Stück, das nur am Leerzeichen oder nach einem Bindestrich bricht. */
function laengstesWort(titel: string): number {
  // Ohne Lookbehind: Ältere Safari (vor iOS 16.4) laden ein Modul damit nicht.
  const stuecke = titel
    .split(/\s+/)
    .flatMap((wort) =>
      wort.split('-').map((teil, i, alle) => (i < alle.length - 1 ? `${teil}-` : teil)),
    );
  return Math.max(0, ...stuecke.map((stueck) => stueck.length));
}

export function titelklassen(stufe: Titelstufe, titel: string): string {
  if (stufe === 'frage') return TITELSTUFE.frage;
  const schmal =
    laengstesWort(titel) > ZEICHEN_IN_28_SCHMAL
      ? LANGES_WORT
      : stufe === 'gruss'
        ? 'max-[23rem]:text-plattform-titel'
        : '';
  return `${TITELSTUFE[stufe]} ${schmal}`.trim();
}
