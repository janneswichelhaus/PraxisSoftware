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
 * steht `ohneNummer` da, sonst „Keine Rufnummer hinterlegt.“
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
    return ohneNummer ?? <p className="text-ink-muted text-sm">Keine Rufnummer hinterlegt.</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      {nummern.map((nummer, index) => (
        <a
          key={nummer.href}
          href={nummer.href}
          className={knopfKlassen(
            hauptknopf && index === 0 ? 'primary' : 'secondary',
            'normal',
            'w-full',
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
