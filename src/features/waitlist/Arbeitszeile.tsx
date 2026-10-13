import type { ReactNode } from 'react';
import { KnopfGroesse } from '@/components/ui/knopfGroesse';

/**
 * Eine Zeile in `ListRows`, an der mehr Arbeit hängt, als neben das Ziel
 * passt (Design-Rollout B1; Kandidat für `src/components/ui`).
 *
 * `ListRow` trägt eine `aktion` neben dem Ziel - am Telefon ist dort Platz
 * für einen kompakten Knopf. Ein Eintrag der Warteliste braucht mehr: die
 * Nummern zum Anrufen, „Freie Termine suchen“, „Bearbeiten“ und „Von der
 * Liste nehmen“ samt Rückfrage (Leitfaden L3). Diese Zeile hat deshalb einen
 * Kopf wie eine `ListRow` - Titel, Status rechts -, darunter die Nebenzeilen
 * über die volle Breite und eine eigene Zeile für die Aktionen, kompakt
 * (44 px) wie in jeder Zeile.
 *
 * Steht in `ListRows` wie eine `ListRow`: Linie oben, die erste ohne.
 */
export function Arbeitszeile({
  titel,
  meta,
  status,
  aktionen,
  children,
}: {
  titel: ReactNode;
  /** Nebenzeile(n) unter dem Titel, 14 px Leise. */
  meta?: ReactNode;
  /** `Badge` rechts neben dem Titel. */
  status?: ReactNode;
  /** Knöpfe, Links und Rückfragen unter dem Inhalt - ohne Angabe kompakt. */
  aktionen?: ReactNode;
  /** Weiterer Inhalt zwischen Kopf und Aktionen, etwa eine Notiz. */
  children?: ReactNode;
}) {
  return (
    <li className="border-line border-t py-3 first:border-t-0">
      {/* Der Status steht neben dem Titel, die Nebenzeilen darunter über die
          volle Breite - am Telefon sonst eine schmale Spalte neben dem
          Abzeichen. */}
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <div className="text-ink min-w-0 text-base font-semibold break-words">{titel}</div>
        {status ? <div className="flex flex-wrap gap-2">{status}</div> : null}
      </div>
      {meta ? <div className="text-ink-muted mt-1 text-sm">{meta}</div> : null}
      {children}
      {aktionen ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <KnopfGroesse value="kompakt">{aktionen}</KnopfGroesse>
        </div>
      ) : null}
    </li>
  );
}
