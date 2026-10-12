import { formatDate } from '@/lib/datum';
import { ERFASSUNGSGROESSEN, type Erfassungsgroesse } from '@/lib/erfassungsgroessen';

/** Eine Erfassung: ein Check-in oder die Angaben nach einer Einheit. */
export interface Verlaufsspalte {
  id: string;
  /** Kalendertag `YYYY-MM-DD`. */
  datum: string;
  /** Uhrzeit, schon in der Zeitzone der Praxis, etwa „18:40". */
  zeit?: string | null;
  /** Kurzer Vermerk zur Quelle, etwa „Vertretung" (ADR-006 Punkt 3). */
  vermerk?: string | null;
  werte: Record<string, number>;
}

/**
 * Die Angaben als Zeitreihe (TRK-006, IDEA-TRK-006, ANN-356): je Größe eine
 * Zeile, je Erfassung eine Spalte, die jüngste links. Am Handy scrollt die
 * Tabelle in sich, die Größe bleibt stehen.
 *
 * Nur der Wert, wie er angegeben wurde: keine Farbe, kein Pfeil, keine
 * Tendenz, keine Spalte „Veränderung" (ADR-006 Punkt 11). Eine leere Zelle
 * heißt „nicht angegeben" – fehlend ist ehrlich (IDEA-TRK-002). Plattform und
 * Praxis teilen die Tabelle (ADR-023 Punkt 26).
 */
export function Verlaufstabelle({
  titel,
  spalten,
}: {
  titel: string;
  spalten: readonly Verlaufsspalte[];
}) {
  const zeilen = ERFASSUNGSGROESSEN.filter((g) =>
    spalten.some((s) => s.werte[g.key] !== undefined),
  );
  return (
    <div
      role="region"
      aria-label={titel}
      // Tastatur erreicht die waagerecht scrollende Tabelle (WCAG 2.1.1).
      tabIndex={0}
      // `relative`: Auch die nur vorgelesenen Texte bleiben in der Fläche, sonst
      // schieben sie die Seite breit.
      className="border-line rounded-card focus-visible:outline-accent relative max-w-full overflow-x-auto border focus-visible:outline-2"
    >
      <table className="text-ink min-w-full border-collapse text-sm">
        <caption className="sr-only">{titel}, jüngste zuerst</caption>
        <thead>
          <tr>
            <th
              scope="col"
              className="bg-surface border-line sticky left-0 border-b p-2 text-left font-semibold"
            >
              Angabe
            </th>
            {spalten.map((s) => (
              <th
                key={s.id}
                scope="col"
                className="border-line border-b border-l p-2 text-right align-bottom font-semibold whitespace-nowrap tabular-nums"
              >
                {formatDate(s.datum)}
                {s.zeit ? (
                  <span className="text-ink-muted block text-xs font-normal">{s.zeit} Uhr</span>
                ) : null}
                {s.vermerk ? (
                  <span className="text-ink-muted block text-xs font-normal">{s.vermerk}</span>
                ) : null}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {zeilen.map((g, i) => (
            <tr
              key={g.key}
              className={
                // Der Zusammenhang steht unter den Fragen, abgesetzt (ANN-355).
                g.rolle === 'kontext' && zeilen[i - 1]?.rolle !== 'kontext'
                  ? 'border-line-strong border-t-2'
                  : undefined
              }
            >
              <th
                scope="row"
                // Kein Bruch mitten im Wort (die Plattform bricht sonst überall).
                className="bg-surface border-line sticky left-0 min-w-36 border-t p-2 text-left font-normal break-normal hyphens-auto"
              >
                {zeilenname(g)}
              </th>
              {spalten.map((s) => {
                const wert = s.werte[g.key];
                return (
                  <td
                    key={s.id}
                    className="border-line border-t border-l p-2 text-right whitespace-nowrap tabular-nums"
                  >
                    {wert === undefined ? (
                      <>
                        <span aria-hidden="true">–</span>
                        <span className="sr-only">nicht angegeben</span>
                      </>
                    ) : (
                      zellenwert(g, wert)
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** „Morgensteifigkeit (Minuten)" – die Einheit steht einmal in der Zeile. */
function zeilenname(g: Erfassungsgroesse): string {
  return g.einheit ? `${g.kurz} (${g.einheit})` : g.kurz;
}

/** Die Zahl, wie angegeben, oder das Wort einer Auswahl (ANN-354). */
function zellenwert(g: Erfassungsgroesse, wert: number): string {
  return g.optionen ? (g.optionen[wert - g.min] ?? String(wert)) : String(wert);
}
