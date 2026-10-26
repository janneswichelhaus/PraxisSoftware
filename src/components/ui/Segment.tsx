export interface Segmentwahl<W extends string> {
  wert: W;
  text: string;
  /**
   * Nur auf einer Breite sichtbar: `telefon` unter 640 px, `ab-sm` ab 640 px.
   * Der Kalender zeigt am Telefon „Tag | Team“, am Rechner „Woche | Team“.
   */
  nur?: 'telefon' | 'ab-sm';
}

const SICHTBARKEIT = { telefon: 'sm:hidden', 'ab-sm': 'max-sm:hidden' } as const;

/** Sichtbar unter 640 px (`telefon`) bzw. ab 640 px (`breit`)? */
function sichtbar(wahl: { nur?: 'telefon' | 'ab-sm' }, breite: 'telefon' | 'breit'): boolean {
  if (wahl.nur === undefined) return true;
  return breite === 'telefon' ? wahl.nur === 'telefon' : wahl.nur === 'ab-sm';
}

/** Die Radien als ganze Klassen - Tailwind findet nur, was wörtlich dasteht. */
const RAENDER = {
  l: {
    immer: 'rounded-l-button',
    telefon: 'max-sm:rounded-l-button',
    breit: 'sm:rounded-l-button',
  },
  r: {
    immer: 'rounded-r-button',
    telefon: 'max-sm:rounded-r-button',
    breit: 'sm:rounded-r-button',
  },
} as const;

/**
 * Der Radius an einer Seite der Wahl: an der ersten (bzw. letzten) Wahl, die
 * auf ihren Breiten sichtbar ist. Steht sie nur auf einer Breite vorn,
 * bekommt sie den Radius nur dort.
 */
function rand<W extends string>(
  wahlen: readonly Segmentwahl<W>[],
  index: number,
  seite: 'l' | 'r',
): string {
  const wahl = wahlen[index];
  if (!wahl) return '';
  const andere = seite === 'l' ? wahlen.slice(0, index) : wahlen.slice(index + 1);
  const breiten = (['telefon', 'breit'] as const).filter((breite) => sichtbar(wahl, breite));
  const vorn = breiten.filter((breite) => !andere.some((nachbar) => sichtbar(nachbar, breite)));
  if (vorn.length === 0) return '';
  if (vorn.length === breiten.length) return RAENDER[seite].immer;
  return RAENDER[seite][vorn[0] === 'telefon' ? 'telefon' : 'breit'];
}

/**
 * Ansichtswechsel: zwei bis vier Ansichten derselben Sache, genau eine gewählt
 * (Design-Handoff 2026-10-01, Abschnitt 7a; herausgelöst aus dem Kalender im
 * Design-Fundament, DESIGN.md „Umschalter“, ANN-407).
 *
 * Knöpfe 44 px hoch, Rand `line-strong`, aneinandergesetzt; die gewählte
 * Ansicht ist mit der Hauptfarbe **gefüllt** - im System heißt gefüllt
 * „gewählt“. `aria-pressed` sagt es der Vorlesesoftware, `beschriftung`
 * benennt die Gruppe.
 *
 * Nicht für Bereiche (`SubNav`), nicht für die Teile eines Objekts
 * (`Reiterleiste`), nicht für Filter mit mehreren Werten (`Filterchips`).
 */
export function Segment<W extends string>({
  beschriftung,
  wahlen,
  gewaehlt,
  onWaehlen,
}: {
  beschriftung: string;
  wahlen: readonly Segmentwahl<W>[];
  /** Die gewählte Ansicht; `null`, wenn gerade keine gilt. */
  gewaehlt: W | null;
  onWaehlen: (wert: W) => void;
}) {
  return (
    <div role="group" aria-label={beschriftung} className="flex">
      {wahlen.map((wahl, index) => {
        const aktiv = wahl.wert === gewaehlt;
        return (
          <button
            key={wahl.wert}
            type="button"
            aria-pressed={aktiv}
            onClick={() => onWaehlen(wahl.wert)}
            className={[
              'border-line-strong inline-flex min-h-11 items-center border px-4 text-sm font-semibold transition-colors [&+&]:-ml-px',
              aktiv ? 'bg-accent text-surface border-accent' : 'text-accent hover:bg-accent-soft',
              rand(wahlen, index, 'l'),
              rand(wahlen, index, 'r'),
              wahl.nur ? SICHTBARKEIT[wahl.nur] : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {wahl.text}
          </button>
        );
      })}
    </div>
  );
}
