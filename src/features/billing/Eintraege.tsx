import { useId, type ReactNode } from 'react';
import { Aufklappzeichen } from '@/components/ui/Card';
import { KnopfGroesse } from '@/components/ui/knopfGroesse';

/**
 * Eine Liste von Einträgen, an denen gearbeitet wird (Design-Rollout B6,
 * DESIGN.md „Listen“): Positionen des Leistungskatalogs, offene Termine der
 * Leistungserfassung, Abos, Pakete, Erstattungen.
 *
 * Aussehen wie `ListRows` (Karte mit Linie, Zeilen ohne Außenabstand,
 * Trenner zwischen den Einträgen); mit `beschriftung` benannt für
 * Vorlesesoftware. Ohne `rahmen` für eine Liste, die schon in einer Karte
 * steht.
 *
 * Lokal, bis der Baustein in `src/components/ui` steht: `ListRow` kennt
 * keinen Folgeinhalt unter der Zeile - das Formular, das „Bearbeiten“
 * öffnet, oder die Rückfrage einer Zeile. Er gehört als `ListRow` mit
 * `unten` (oder als eigener Baustein) nach `ui/`.
 */
export function Eintraege({
  beschriftung,
  rahmen = true,
  children,
}: {
  beschriftung?: string;
  rahmen?: boolean;
  children: ReactNode;
}) {
  return (
    <ul
      aria-label={beschriftung}
      className={
        rahmen ? 'rounded-card border-line bg-surface overflow-hidden border px-4' : undefined
      }
    >
      {children}
    </ul>
  );
}

/**
 * Ein Eintrag: die Zeile wie eine `ListRow` - vorn `zeit` (Kürzel, Datum),
 * Titel mit Nebenzeile, rechts `betrag` über `status` - und darunter der
 * Folgeinhalt (`children`) über die volle Breite: ein Formular, eine
 * Rückfrage, die Einzelheiten eines Antrags.
 *
 *   * `aktion` steht neben der Zeile, kompakt (44 px), wie an der `ListRow`
 *     (Leitfaden L3: die Arbeit an jeder Zeile).
 *   * Mit `aufklappen` ist **die ganze Zeile das Ziel** (DESIGN.md „Liste“):
 *     ein Knopf mit `aria-expanded`, der den Folgeinhalt öffnet und schließt
 *     - „Bearbeiten auf Abruf“ im Leistungskatalog. Rechts steht das
 *     `Aufklappzeichen`; beim Überfahren vertieft sich die Zeile über die
 *     ganze Breite der Karte wie an der `ListRow`.
 */
export function Eintrag({
  zeit,
  titel,
  meta,
  status,
  betrag,
  aktion,
  aufklappen,
  gedaempft = false,
  children,
}: {
  /** Vorn, tabellarisch: ein Kürzel oder ein Datum. */
  zeit?: ReactNode;
  titel: ReactNode;
  /** Nebenzeile unter dem Titel, 14 px Leise. */
  meta?: ReactNode;
  /** `Badge` rechts, unter dem Betrag. */
  status?: ReactNode;
  /** Betrag rechts, tabellarisch. */
  betrag?: ReactNode;
  /** Knopf neben der Zeile; ohne Angabe kompakt. */
  aktion?: ReactNode;
  /** Die Zeile öffnet und schließt ihren Folgeinhalt. */
  aufklappen?: { offen: boolean; onUmschalten: () => void; gesperrt?: boolean };
  /** Erledigtes: Titel und Betrag in Leise. */
  gedaempft?: boolean;
  /** Folgeinhalt unter der Zeile, über die volle Breite. */
  children?: ReactNode;
}) {
  const folge = useId();
  // Die Spuren als ganze Klassen - Tailwind findet nur, was wörtlich dasteht.
  const spalten =
    zeit === undefined
      ? aufklappen
        ? 'grid-cols-[minmax(0,1fr)_auto_auto]'
        : 'grid-cols-[minmax(0,1fr)_auto]'
      : aufklappen
        ? 'grid-cols-[auto_minmax(0,1fr)_auto_auto]'
        : 'grid-cols-[auto_minmax(0,1fr)_auto]';
  const hinten =
    betrag !== undefined ? (
      <span className="flex shrink-0 flex-col items-end gap-1">
        <span
          className={`text-liste font-semibold tabular-nums ${gedaempft ? 'text-ink-muted' : 'text-ink'}`}
        >
          {betrag}
        </span>
        {status}
      </span>
    ) : status ? (
      <span className="shrink-0">{status}</span>
    ) : (
      <span />
    );

  const inhalt = (
    <>
      {zeit === undefined ? null : (
        <span
          className={`text-liste font-semibold tabular-nums ${gedaempft ? 'text-ink-muted' : 'text-ink'}`}
        >
          {zeit}
        </span>
      )}
      <span className="min-w-0">
        <span
          className={`block text-base ${gedaempft ? 'text-ink-muted font-medium' : 'text-ink font-semibold'}`}
        >
          {titel}
        </span>
        {meta ? <span className="text-ink-muted block text-sm">{meta}</span> : null}
      </span>
      {hinten}
      {aufklappen ? (
        <span className="text-ink-muted">
          <Aufklappzeichen offen={aufklappen.offen} />
        </span>
      ) : null}
    </>
  );

  const raster = `grid ${spalten} min-h-14 min-w-0 items-center gap-3 py-2 text-left`;
  const zeile = aufklappen ? (
    <button
      type="button"
      aria-expanded={aufklappen.offen}
      aria-controls={aufklappen.offen ? folge : undefined}
      disabled={aufklappen.gesperrt}
      onClick={aufklappen.onUmschalten}
      // Wie das Ziel der `ListRow`: über den Innenabstand der Karte hinaus,
      // der Fokusrahmen innen.
      className={`${raster} hover:bg-surface-sunken -mx-4 w-[calc(100%+2rem)] px-4 transition-colors duration-120 focus-visible:-outline-offset-2 disabled:cursor-default disabled:hover:bg-transparent`}
    >
      {inhalt}
    </button>
  ) : (
    <div className={`${raster} flex-1`}>{inhalt}</div>
  );

  return (
    <li className="border-line border-t first:border-t-0">
      {aktion ? (
        <div className="flex items-center gap-2">
          {zeile}
          <div className="flex shrink-0 items-center gap-2">
            <KnopfGroesse value="kompakt">{aktion}</KnopfGroesse>
          </div>
        </div>
      ) : (
        zeile
      )}
      {children ? (
        <div id={folge} className="pb-4">
          {children}
        </div>
      ) : null}
    </li>
  );
}
