import { initialen, type Personenfarbe } from './personenfarben';

// Ausgeschrieben, damit Tailwind die Klassen findet.
const FLAECHE: Record<Personenfarbe, string> = {
  tanne: 'bg-person-tanne',
  ozean: 'bg-person-ozean',
  pflaume: 'bg-person-pflaume',
  moos: 'bg-person-moos',
  veilchen: 'bg-person-veilchen',
  petrol: 'bg-person-petrol',
  schiefer: 'bg-person-schiefer',
  nacht: 'bg-person-nacht',
};

// Ein Umriss, kein `ring-*`: Das wäre ein Schatten (DS-001).
const UMRISS: Record<Personenfarbe, string> = {
  tanne: 'outline-person-tanne',
  ozean: 'outline-person-ozean',
  pflaume: 'outline-person-pflaume',
  moos: 'outline-person-moos',
  veilchen: 'outline-person-veilchen',
  petrol: 'outline-person-petrol',
  schiefer: 'outline-person-schiefer',
  nacht: 'outline-person-nacht',
};

const MASSE = {
  klein: 'size-6 text-leiste font-semibold',
  zeile: 'size-9 text-sm font-semibold',
  gross: 'size-24 text-h2 font-semibold',
  // Plattform (Handoff 2026-10-22, Abschnitt 3): Initialen 20/700, in rem,
  // damit Bild und Schrift unter „Sehr groß“ mitwachsen.
  karte: 'size-14 text-[1.25rem] font-bold',
} as const;

/**
 * Eine Person als Bild (TEAM-006, TEAM-007): ihr Profilbild im Kreis oder,
 * ohne Bild, ihre Initialen auf ihrer Farbe - wie bei Slack vor jeder
 * Nachricht und in jeder Liste von Personen.
 *
 *   * **Die Farbe gehört der Person** (ANN-666): Fläche hinter den Initialen,
 *     Umriss um das Profilbild. Acht feste Farben (`--color-person-*`), keine im
 *     Rot, Orange oder Gelb der Statusfarben; nie Textfarbe.
 *   * **Nie allein** (DESIGN.md Regel 5): Der Name steht immer daneben. Das
 *     Bild ist deshalb für Vorlesesoftware unsichtbar (`aria-hidden`), sonst
 *     hörte man jeden Namen zweimal.
 *   * Vier Größen: `klein` 24 px (dichte Zeilen), `zeile` 36 px (Nachricht,
 *     Liste), `karte` 56 px (Hero- und Besuchskarte der Plattform), `gross`
 *     96 px (das eigene Bild in „Mein Konto“).
 *   * Ohne Farbe (noch nicht geladen, fremd) `schiefer`, ohne Namen „?“.
 */
export function Personenbild({
  name,
  farbe,
  bild,
  groesse = 'zeile',
}: {
  name: string | null | undefined;
  farbe: Personenfarbe | null | undefined;
  /** Adresse des Profilbilds (Objekt-URL); ohne Bild die Initialen. */
  bild?: string | null | undefined;
  groesse?: keyof typeof MASSE;
}) {
  const f = farbe ?? 'schiefer';
  if (bild) {
    return (
      <img
        src={bild}
        alt=""
        aria-hidden="true"
        data-personenbild="foto"
        className={`${MASSE[groesse]} rounded-pill shrink-0 object-cover outline-2 outline-offset-1 ${UMRISS[f]}`}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      data-personenbild="initialen"
      className={`${MASSE[groesse]} ${FLAECHE[f]} text-surface rounded-pill inline-flex shrink-0 items-center justify-center leading-none select-none`}
    >
      {initialen(name)}
    </span>
  );
}

/**
 * Mehrere Personen an einem Platz, an dem sonst eine steht - eine
 * Gruppennachricht in der Liste: die Zahl auf der Vertiefung, ohne Farbe.
 */
export function Gruppenbild({
  anzahl,
  groesse = 'zeile',
}: {
  anzahl: number;
  groesse?: keyof typeof MASSE;
}) {
  return (
    <span
      aria-hidden="true"
      data-personenbild="gruppe"
      className={`${MASSE[groesse]} bg-surface-sunken border-line text-ink-muted rounded-pill inline-flex shrink-0 items-center justify-center border leading-none font-semibold tabular-nums select-none`}
    >
      {anzahl}
    </span>
  );
}

/** Ein Punkt in der Farbe einer Person - für die Wahl der eigenen Farbe. */
export function Farbpunkt({ farbe }: { farbe: Personenfarbe }) {
  return <span aria-hidden="true" className={`${FLAECHE[farbe]} rounded-pill size-4 shrink-0`} />;
}
