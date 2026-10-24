import type { ReactNode } from 'react';
import { knopfKlassen } from './buttonStile';

/** Eine Rufnummer zum Wählen: Art, Schreibweise und Wählziel (`telHref`). */
export interface Anrufnummer {
  label: string;
  anzeige: string;
  href: string;
}

/**
 * Die Rufnummern einer Person als Knöpfe, je Nummer einer - groß genug für
 * den Daumen, denn Kontakt ist eine Aktion (BEF-175). Ein `tel:`-Link in
 * Gestalt eines Knopfs: „Mobil anrufen“ mit der Nummer daneben. Ohne Nummer
 * steht `ohneNummer` da, sonst „Keine Rufnummer hinterlegt.“; `null` zeigt nichts.
 *
 * Mit `hauptknopf` ist die erste Nummer der Hauptknopf einer Seite, deren
 * Haupthandlung der Anruf ist, die übrigen bleiben sekundär (BEF-192).
 */
export function Anrufknoepfe({
  nummern,
  fokusbeginn = false,
  hauptknopf = false,
  ohneNummer,
}: {
  nummern: readonly Anrufnummer[];
  /** Der Fokus eines Fensters beginnt bei der ersten Nummer (`data-autofocus`). */
  fokusbeginn?: boolean;
  /** Die erste Nummer als Hauptknopf (`primary`). */
  hauptknopf?: boolean;
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
      {nummern.map((nummer, index) => (
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
      ))}
    </div>
  );
}
