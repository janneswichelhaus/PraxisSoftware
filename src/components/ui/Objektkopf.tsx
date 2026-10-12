import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { KnopfGroesse } from './knopfGroesse';

/**
 * Der Kopf einer Objektseite: wer oder was das ist - und die ein, zwei Wege,
 * die täglich gebraucht werden (Design-Handoff 2026-10-01, Abschnitt 7;
 * Handoff Rahmen 2026-10-05, Variante 4b). Herausgelöst aus dem Rahmen der
 * Akte im Design-Fundament (`docs/design/DESIGN.md`, Seitentyp „Objekt“).
 *
 * Eine weiße Karte mit Linie, darin von oben nach unten:
 *
 *   * **Titel** als `h1`, 26 px am Telefon, 32 ab 640 px, in 800 und der
 *     Hauptfarbe - die einzige Überschrift der Seite. Mit `rueckweg` steht
 *     unter 640 px ein Pfeilknopf davor (40 px in 12 px Kartenrand, das
 *     Tippziel zählt mit dem Rand); ab 640 px setzt die Seite den `Rueckweg`
 *     als Zeile über die Karte.
 *   * **Metazeile** 14 px Leise („geb. … · 65 Jahre · Tübingen“), daneben
 *     `status` - Abzeichen nur für Ausnahmen, der Regelfall trägt keins.
 *   * `abzeichen`: Eigenschaften als Reihe darunter („Privat · mit
 *     Verordnung“, „Liege mitnehmen“).
 *   * `aktionen`: höchstens zwei, kompakt (44 px) - die Knöpfe hier sind ohne
 *     Angabe kompakt. Am Telefon teilen sie sich die Breite, ab 640 px stehen
 *     sie rechts neben dem Titel.
 *   * `fuss`: ein Satz unter den Aktionen über die volle Breite, etwa warum
 *     ein Knopf fehlt.
 *   * `hinweise`: Zeilen unter dem Kopf - eine `Warnzeile`, ein Aufklapper
 *     „Hinweise“. Sie stehen in der Karte, nicht als eigener Kasten (L2);
 *     bleibt der Bereich leer, verschwindet er samt Abstand.
 *   * `reiter`: die `Reiterleiste` des Objekts mit einer Linie darüber.
 */
export function Objektkopf({
  titel,
  rueckweg,
  meta,
  status,
  abzeichen,
  aktionen,
  fuss,
  hinweise,
  reiter,
}: {
  titel: ReactNode;
  /** Ziel und Beschriftung des Pfeils vor dem Titel (nur unter 640 px). */
  rueckweg?: { to: string; beschriftung: string };
  /** Die Zeile unter dem Titel, 14 px Leise. */
  meta?: ReactNode;
  /** Abzeichen neben der Metazeile - nur für Ausnahmen. */
  status?: ReactNode;
  /** Eigenschaften als Abzeichen in einer eigenen Reihe. */
  abzeichen?: ReactNode;
  /** Höchstens zwei Knöpfe oder Knopf-Links; ohne Angabe kompakt. */
  aktionen?: ReactNode;
  /** Ein Satz unter den Aktionen, über die volle Breite. */
  fuss?: ReactNode;
  /** Zeilen unter dem Kopf; leer verschwindet der Bereich. */
  hinweise?: ReactNode;
  /** Die `Reiterleiste`. */
  reiter?: ReactNode;
}) {
  // Der Name als Seitentitel: 26 px am Telefon, 32 ab 640 px, in 800
  // (Design-Handoff 2026-10-01, Abschnitt 7).
  const ueberschrift = (
    <h1 className="text-accent text-h2-mobil sm:text-h2 tracking-display min-w-0 font-extrabold">
      {titel}
    </h1>
  );

  return (
    <header className="border-line bg-surface rounded-card overflow-hidden border">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3 px-4 py-3 sm:px-5 sm:py-4">
        <div className="min-w-0">
          {rueckweg ? (
            // Die Titelzeile beginnt am Telefon 10 px vom Rand (Pfeil), alles
            // darunter bleibt auf den 16 der Karte (Variante 4b).
            <div className="-ml-1.5 flex items-center gap-1 sm:ml-0 sm:block">
              <Link
                to={rueckweg.to}
                aria-label={rueckweg.beschriftung}
                title={rueckweg.beschriftung}
                className="text-accent hover:bg-surface-sunken rounded-button inline-flex size-10 shrink-0 items-center justify-center transition-colors sm:hidden"
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 20 20"
                  className="size-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m12.5 4.5-5.5 5.5 5.5 5.5" />
                </svg>
              </Link>
              {ueberschrift}
            </div>
          ) : (
            ueberschrift
          )}
          {meta || status ? (
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1.5">
              {meta ? <p className="text-ink-muted text-sm">{meta}</p> : null}
              {status}
            </div>
          ) : null}
          {abzeichen ? <div className="mt-2 flex flex-wrap gap-2">{abzeichen}</div> : null}
        </div>

        {/* Kompakt (44 px, 14 px Schrift): In voller Größe standen zwei Knöpfe
            bei 375 px untereinander und kosteten den Kopf über hundert Pixel.
            Ein Knopf allein nutzt am Telefon die ganze Breite, zwei teilen
            sie sich; ein zweizeiliger Text steht mittig (PAT-18, RSP-18). */}
        {aktionen ? (
          <div className="flex w-full gap-2 *:flex-1 *:text-center sm:w-auto sm:*:flex-none">
            <KnopfGroesse value="kompakt">{aktionen}</KnopfGroesse>
          </div>
        ) : null}

        {fuss ? <p className="text-ink-muted w-full text-sm">{fuss}</p> : null}
      </div>

      {hinweise === undefined || hinweise === null ? null : (
        <div className="flex flex-col gap-3 px-4 pb-3 empty:hidden sm:px-5 sm:pb-4">{hinweise}</div>
      )}

      {reiter}
    </header>
  );
}

/**
 * Eine Warnung als Zeile im Objektkopf: „! Anmeldebogen fehlt“ mit dem Weg,
 * es zu erledigen (AKTE-007). Fläche Warnung, 14 px in 600, das Zeichen vorn
 * für Vorlesesoftware ausgeblendet - das Wort trägt die Bedeutung.
 *
 * Eine Zeile, kein Kasten mit Überschrift: Sie steht schon in einer Karte.
 */
export function Warnzeile({ children, aktion }: { children: ReactNode; aktion?: ReactNode }) {
  return (
    <div className="bg-warnung-soft text-warnung rounded-card flex min-h-11 flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2 text-sm font-semibold">
      <p>
        <span aria-hidden="true">! </span>
        {children}
      </p>
      {aktion}
    </div>
  );
}
