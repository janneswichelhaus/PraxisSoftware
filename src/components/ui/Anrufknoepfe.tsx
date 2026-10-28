import type { ReactNode } from 'react';
import { knopfKlassen } from './buttonStile';
import { Terminsymbol } from './Terminsymbole';

/** Eine Rufnummer zum Wählen: Art, Schreibweise und Wählziel (`telHref`). */
export interface Anrufnummer {
  label: string;
  anzeige: string;
  href: string;
}

/**
 * Die Rufnummern einer Person als `tel:`-Knöpfe für den Daumen, denn Kontakt ist eine Aktion.
 * `zweizeilig` setzt die Nummer unter „{Art} anrufen“, mindestens 60 hoch und ohne `h-12`, weil das
 * Plattformgerüst Höhe und Innenabstand selbst setzt (ANN-768).
 */
export function Anrufknoepfe({
  nummern,
  fokusbeginn = false,
  hauptknopf = false,
  zweizeilig = false,
  ohneNummer,
}: {
  nummern: readonly Anrufnummer[];
  /** Der Fokus eines Fensters beginnt bei der ersten Nummer (`data-autofocus`). */
  fokusbeginn?: boolean;
  /** Die erste Nummer als Hauptknopf (`primary`). */
  hauptknopf?: boolean;
  /** Zeichen und Wort in der ersten Zeile, die Nummer in der zweiten. */
  zweizeilig?: boolean;
  ohneNummer?: ReactNode;
}) {
  if (nummern.length === 0) {
    // `null` heißt: nichts zeigen - die Seite sagt es schon (BEF-176).
    return ohneNummer === undefined ? (
      <p className="text-ink-muted text-sm">Keine Rufnummer hinterlegt.</p>
    ) : (
      ohneNummer
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {nummern.map((nummer, index) =>
        zweizeilig ? (
          <a
            key={nummer.href}
            href={nummer.href}
            className={knopfKlassen(
              hauptknopf && index === 0 ? 'primary' : 'secondary',
              'gross',
              'w-full text-center',
            )}
            {...(fokusbeginn && index === 0 ? { 'data-autofocus': true } : {})}
          >
            <span className="flex flex-col items-center py-1">
              <span className="inline-flex items-center gap-2">
                <Terminsymbol zeichen="telefon" className="size-5 shrink-0" />
                {nummer.label} anrufen
              </span>{' '}
              <span className="font-normal tabular-nums">{nummer.anzeige}</span>
            </span>
          </a>
        ) : (
          <a
            key={nummer.href}
            href={nummer.href}
            // Bei 200 % bricht der Knopf zwischen Wort und Nummer und zwischen den
            // Ziffergruppen um, nie mitten darin (Handoff 2026-10-22, Abschnitt 6):
            // Die Plattform erlaubt sonst Umbrüche überall (`overflow-wrap`).
            className={knopfKlassen(
              hauptknopf && index === 0 ? 'primary' : 'secondary',
              'normal',
              'w-full flex-wrap gap-x-2 gap-y-0 text-center wrap-normal',
            )}
            {...(fokusbeginn && index === 0 ? { 'data-autofocus': true } : {})}
          >
            {nummer.label} anrufen
            <span className="tabular-nums">{nummer.anzeige}</span>
          </a>
        ),
      )}
    </div>
  );
}
