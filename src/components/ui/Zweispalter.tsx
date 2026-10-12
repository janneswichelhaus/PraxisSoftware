import type { ReactNode } from 'react';

/**
 * Hauptspalte und Kontextspalte (Design-Handoff 2026-10-01, Abschnitt 4;
 * herausgelöst aus der Übersicht im Design-Fundament, DESIGN.md).
 *
 * Zwei Spalten ab 900 px **Inhaltsbreite** (`--container-zweispaltig`):
 * Gemessen wird der Inhalt, nicht das Fenster - die Seitenleiste ist je nach
 * Breite 84 oder 248 px. Darunter rückt die Kontextspalte unter die
 * Hauptspalte; was dort am Rechner offen steht, setzt die Seite am Telefon in
 * einen Aufklapper (`Disclosure offenAb="lg"`).
 *
 * Die Kontextspalte ist 300 bis 380 px breit (`breit`, Übersicht) oder 280
 * bis 340 px (`schmal`, Termin und Objektseiten); ihre Karten stehen mit
 * 16 px Abstand untereinander.
 *
 * **Ohne Kontext** bleibt eine einzelne Spalte, ab 1024 px höchstens
 * `--container-spalte` (48rem) breit: Eine Arbeitsliste über 1200 px liest
 * niemand. Das Büro sieht die Übersicht so - für es ist der Plan des Teams
 * die Hauptsache, keine Randspalte.
 */
export function Zweispalter({
  kontext,
  kontextBreite = 'breit',
  className = '',
  children,
}: {
  /** Die Kontextspalte; ohne sie bleibt eine Spalte. */
  kontext?: ReactNode;
  kontextBreite?: 'breit' | 'schmal';
  /** Zusatzklassen am Raster, etwa `print:hidden`. */
  className?: string;
  children: ReactNode;
}) {
  const zweispaltig = kontext !== undefined && kontext !== null && kontext !== false;
  const spalten =
    kontextBreite === 'schmal'
      ? '@zweispaltig:grid-cols-[minmax(0,1fr)_minmax(280px,340px)]'
      : '@zweispaltig:grid-cols-[minmax(0,1fr)_minmax(300px,380px)]';
  return (
    <div className="@container">
      <div
        className={`${
          zweispaltig ? `${spalten} @zweispaltig:gap-x-8 grid items-start gap-6` : 'lg:max-w-spalte'
        } ${className}`.trim()}
      >
        <div className="min-w-0">{children}</div>
        {zweispaltig ? <aside className="flex min-w-0 flex-col gap-4">{kontext}</aside> : null}
      </div>
    </div>
  );
}
