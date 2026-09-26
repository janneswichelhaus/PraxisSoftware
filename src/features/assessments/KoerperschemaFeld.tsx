import { Checkbox } from '@/components/ui/Checkbox';
import {
  BILD_BREITE,
  BILD_HOEHE,
  KOERPERBEREICHE,
  RUECKANSICHT_UMRISS,
  bereicheText,
  type Ansicht,
} from './koerperschema';

/**
 * Das Körperschema als Eingabe und als Ansicht (FRB-002d, `IDEA-PRX-027`).
 *
 * Die Figur ist die schnelle Hand: Antippen wählt einen Bereich, erneutes
 * Antippen nimmt ihn zurück. Sie ist für Vorlesesoftware verborgen, denn
 * 47 Flächen ohne Reihenfolge sind keine Bedienung. Dieselbe Auswahl steht
 * deshalb darunter als Liste zum Aufklappen — dort geht alles mit Tastatur und
 * Vorlesesoftware (Oberflächen-Checkliste).
 *
 * Es wird nur dokumentiert, wo die Person Beschwerden angibt. Keine Farbe
 * sagt mehr als „gewählt" (ADR-006 Punkt 2 und 11).
 */
export function KoerperschemaFeld({
  legende,
  bereiche,
  onChange,
}: {
  legende: string;
  bereiche: string[];
  onChange: (bereiche: string[]) => void;
}) {
  function umschalten(kennung: string) {
    onChange(
      bereiche.includes(kennung) ? bereiche.filter((b) => b !== kennung) : [...bereiche, kennung],
    );
  }

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-ink mb-1 text-[0.9375rem] font-medium">{legende}</legend>
      <KoerperschemaBild bereiche={bereiche} onUmschalten={umschalten} />
      <p className="text-ink text-sm" aria-live="polite">
        {bereiche.length > 0 ? `Gewählt: ${bereicheText(bereiche)}` : 'Noch kein Bereich gewählt.'}
      </p>
      <details className="text-sm">
        <summary className="text-ink-muted hover:text-ink flex min-h-11 cursor-pointer items-center">
          Bereiche als Liste
        </summary>
        {(['vorne', 'hinten'] as const).map((ansicht) => (
          <fieldset key={ansicht} className="mt-2">
            <legend className="text-ink-muted text-xs font-semibold uppercase">
              {ANSICHT_TEXT[ansicht]}
            </legend>
            <div className="grid sm:grid-cols-2">
              {KOERPERBEREICHE.filter((b) => b.ansicht === ansicht).map((bereich) => (
                <Checkbox
                  key={bereich.id}
                  label={bereich.label}
                  checked={bereiche.includes(bereich.id)}
                  onChange={() => umschalten(bereich.id)}
                />
              ))}
            </div>
          </fieldset>
        ))}
      </details>
    </fieldset>
  );
}

const ANSICHT_TEXT: Record<Ansicht, string> = { vorne: 'Vorderansicht', hinten: 'Rückansicht' };

/**
 * Die beiden Ansichten nebeneinander. Ohne `onUmschalten` nur zum Ansehen —
 * so steht das Körperschema auch im Befund der Akte.
 */
export function KoerperschemaBild({
  bereiche,
  onUmschalten,
}: {
  bereiche: readonly string[];
  onUmschalten?: (kennung: string) => void;
}) {
  return (
    <div className="flex max-w-sm gap-4" aria-hidden="true">
      {(['vorne', 'hinten'] as const).map((ansicht) => (
        <figure key={ansicht} className="flex-1">
          <svg
            viewBox={`0 0 ${BILD_BREITE} ${BILD_HOEHE}`}
            className="h-auto w-full"
            role="presentation"
          >
            {ansicht === 'hinten'
              ? RUECKANSICHT_UMRISS.map(([x, y, b, h]) => (
                  <rect
                    key={`${x}-${y}`}
                    x={x}
                    y={y}
                    width={b}
                    height={h}
                    rx={3}
                    className="fill-surface-sunken stroke-line"
                    strokeWidth={0.8}
                  />
                ))
              : null}
            {KOERPERBEREICHE.filter((b) => b.ansicht === ansicht).map((bereich) => {
              const [x, y, b, h] = bereich.form;
              const gewaehlt = bereiche.includes(bereich.id);
              return (
                <rect
                  key={bereich.id}
                  data-bereich={bereich.id}
                  x={x}
                  y={y}
                  width={b}
                  height={h}
                  rx={3}
                  strokeWidth={0.8}
                  className={`${gewaehlt ? 'fill-accent stroke-accent' : 'fill-surface stroke-line-strong'} ${onUmschalten ? 'cursor-pointer' : ''}`}
                  onClick={onUmschalten ? () => onUmschalten(bereich.id) : undefined}
                >
                  <title>{bereich.label}</title>
                </rect>
              );
            })}
            {/* Die Seiten der Person, nicht des Bildes. */}
            <text x={4} y={12} className="fill-ink-muted text-[10px]">
              {ansicht === 'vorne' ? 'R' : 'L'}
            </text>
            <text x={BILD_BREITE - 10} y={12} className="fill-ink-muted text-[10px]">
              {ansicht === 'vorne' ? 'L' : 'R'}
            </text>
          </svg>
          <figcaption className="text-ink-muted text-center text-xs">
            {ANSICHT_TEXT[ansicht]}
          </figcaption>
        </figure>
      ))}
    </div>
  );
}
