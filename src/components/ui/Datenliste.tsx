import type { CSSProperties, ReactNode } from 'react';

export interface Datenspalte<Z> {
  /** Spaltenkopf am Rechner; am Telefon steht er vor dem Wert (Vorlesesoftware). */
  titel: string;
  /** Spur im Raster ab 1024 px, etwa `10rem` oder `minmax(0,1fr)` (Vorgabe). */
  breite?: string;
  /** Rechtsbündig und tabellarisch - für Beträge und Zahlen. */
  rechts?: boolean;
  /**
   * Wo der Wert unter 1024 px steht: `kopf` oben links (die erste Spalte,
   * meist die Kennung mit Link), `ende` oben rechts (der Betrag), `zeile` in
   * einer eigenen Zeile darunter (Vorgabe).
   */
  telefon?: 'kopf' | 'ende' | 'zeile';
  inhalt: (zeile: Z) => ReactNode;
}

/**
 * Daten zum Vergleichen: Rechnungen, Leistungen, Katalog, Mitarbeitende,
 * Urlaub (Design-Fundament, DESIGN.md „Tabellen“; nach dem Vorbild der
 * Rechnungsliste, ABR-034).
 *
 * **Ab 1024 px Spalten** mit Kopfzeile, Beträge rechtsbündig. **Darunter
 * Zeilen:** jede Zeile sagt alles selbst - oben links der Kopf, oben rechts
 * das Ende (Betrag), darunter die übrigen Werte. Kein waagerechtes Rollen,
 * keine Tabelle mit `min-w-[36rem]` am Telefon.
 *
 * Gebaut als Liste (`ul`), nicht als `<table>`: Am Telefon ist es eine Liste.
 * Die Kopfzeile ist für Vorlesesoftware ausgeblendet; dafür trägt jeder Wert
 * außerhalb des Kopfs seinen Spaltentitel unsichtbar vor sich („Zustand: …“).
 *
 * `rahmen` (Vorgabe) stellt die Liste in eine Karte; ohne steht sie in einer,
 * die es schon gibt (`Section rahmen`).
 */
export function Datenliste<Z>({
  spalten,
  zeilen,
  schluessel,
  beschriftung,
  rahmen = true,
}: {
  spalten: readonly Datenspalte<Z>[];
  zeilen: readonly Z[];
  schluessel: (zeile: Z) => string;
  /** Name der Liste für Vorlesesoftware, etwa „Rechnungen“. */
  beschriftung: string;
  rahmen?: boolean;
}) {
  // Die Spuren als Variable am Element: Tailwind kennt nur Klassen, die
  // wörtlich im Quelltext stehen, die Breiten kommen aber von der Seite.
  const raster = {
    '--datenliste-spalten': spalten.map((spalte) => spalte.breite ?? 'minmax(0,1fr)').join(' '),
  } as CSSProperties;
  const zeilenRaster = 'lg:grid lg:grid-cols-(--datenliste-spalten) lg:items-baseline lg:gap-4';

  return (
    <div
      style={raster}
      className={rahmen ? 'rounded-card border-line bg-surface border px-4 sm:px-5' : undefined}
    >
      <div
        aria-hidden="true"
        className={`text-ink-muted tracking-label border-line hidden border-b py-2 text-xs font-semibold uppercase ${zeilenRaster}`}
      >
        {spalten.map((spalte) => (
          <span key={spalte.titel} className={spalte.rechts ? 'text-right' : undefined}>
            {spalte.titel}
          </span>
        ))}
      </div>
      <ul aria-label={beschriftung}>
        {zeilen.map((zeile) => (
          <li
            key={schluessel(zeile)}
            className={`border-line flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t py-3 first:border-t-0 ${zeilenRaster}`}
          >
            {spalten.map((spalte, index) => {
              const ort = spalte.telefon ?? (index === 0 ? 'kopf' : 'zeile');
              const lage =
                ort === 'kopf'
                  ? 'min-w-0'
                  : ort === 'ende'
                    ? 'ml-auto lg:ml-0'
                    : 'order-last w-full min-w-0 lg:order-none lg:w-auto';
              return (
                <div
                  key={spalte.titel}
                  className={`${lage} ${
                    spalte.rechts
                      ? 'text-liste text-ink font-medium tabular-nums lg:text-right'
                      : 'text-ink text-sm'
                  }`}
                >
                  {ort === 'kopf' ? null : <span className="sr-only">{spalte.titel}: </span>}
                  {spalte.inhalt(zeile)}
                </div>
              );
            })}
          </li>
        ))}
      </ul>
    </div>
  );
}
