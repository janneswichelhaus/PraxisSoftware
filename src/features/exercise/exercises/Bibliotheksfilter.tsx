import { useMemo } from 'react';
import { Button } from '@/components/ui/Button';
import { Disclosure } from '@/components/ui/Card';
import { Filterchips } from '@/components/ui/Chip';
import { Filterleiste } from '@/components/ui/Filterleiste';
import { SearchField } from '@/components/ui/SearchField';
import type { Uebung } from './api';
import { facetten, gesetzteFilter, ohneFilter, type Filter } from './suche';

/**
 * Suche und Filterchips der Übungsbibliothek (Welle B) - dieselbe Leiste in
 * der Bibliothek und im Auswahlblatt des Planeditors.
 *
 * Die Suche steht offen; Region, Ziel, Ausgangsstellung, Hilfsmittel und
 * Niveau stehen am Telefon hinter „Filter (n)“, ab 640 px offen. Es gibt nur
 * Chips für Werte, die in der Bibliothek vorkommen. Gesetzt wird von Hand -
 * nichts ist aus Angaben einer Person vorbelegt (ADR-006 Punkt 10).
 *
 * `eingeklappt` (im Auswahlblatt): Die Filter stehen auf jeder Breite hinter
 * einem Aufklapper - im Fenster gehört der Platz der Liste. Die
 * `Filterleiste` öffnet sie ab 640 px immer.
 */
export function Bibliotheksfilter({
  filter,
  setFilter,
  uebungen,
  ergebnis,
  suchbeschriftung = 'Suche',
  eingeklappt = false,
}: {
  filter: Filter;
  setFilter: (filter: Filter) => void;
  uebungen: readonly Uebung[];
  /** „12 von 40“ - Vorlesesoftware liest es beim Tippen mit. */
  ergebnis?: string;
  suchbeschriftung?: string;
  eingeklappt?: boolean;
}) {
  const werte = useMemo(() => facetten(uebungen), [uebungen]);
  const gesetzt = gesetzteFilter(filter);
  const suche = (
    <SearchField
      label={suchbeschriftung}
      placeholder="Bezeichnung, auch in Alltagssprache"
      value={filter.text}
      onChange={(text) => setFilter({ ...filter, text })}
    />
  );
  const chips = (
    <>
      {werte.regionen.length > 0 ? (
        <Filterchips
          beschriftung="Körperregion"
          wahlen={werte.regionen}
          gewaehlt={filter.regionen}
          onAendern={(regionen) => setFilter({ ...filter, regionen })}
        />
      ) : null}
      {werte.ziele.length > 0 ? (
        <Filterchips
          beschriftung="Ziel"
          wahlen={werte.ziele}
          gewaehlt={filter.ziele}
          onAendern={(ziele) => setFilter({ ...filter, ziele })}
        />
      ) : null}
      {werte.stellungen.length > 0 ? (
        <Filterchips
          beschriftung="Ausgangsstellung"
          wahlen={werte.stellungen}
          gewaehlt={filter.stellungen}
          onAendern={(stellungen) => setFilter({ ...filter, stellungen })}
        />
      ) : null}
      {werte.hilfsmittel.length > 0 ? (
        <Filterchips
          beschriftung="Hilfsmittel"
          wahlen={werte.hilfsmittel}
          gewaehlt={filter.hilfsmittel}
          onAendern={(hilfsmittel) => setFilter({ ...filter, hilfsmittel })}
        />
      ) : null}
      {werte.niveaus.length > 0 ? (
        <Filterchips
          beschriftung="Niveau"
          wahlen={werte.niveaus}
          gewaehlt={filter.niveaus}
          onAendern={(niveaus) => setFilter({ ...filter, niveaus })}
        />
      ) : null}
    </>
  );

  if (eingeklappt) {
    return (
      <div role="search" aria-label="Übungen filtern" className="mb-4 flex flex-col gap-2">
        {suche}
        <Disclosure
          summary="Filter"
          {...(gesetzt > 0 ? { anzahl: gesetzt } : {})}
          offen={gesetzt > 0}
        >
          <div className="flex flex-col gap-4">
            {chips}
            {gesetzt > 0 ? (
              <div>
                <Button
                  type="button"
                  variant="quiet"
                  groesse="kompakt"
                  onClick={() => setFilter(ohneFilter(filter))}
                >
                  Filter zurücksetzen
                </Button>
              </div>
            ) : null}
          </div>
        </Disclosure>
        <p className="text-ink-muted text-sm">
          <span role="status">{ergebnis}</span>
        </p>
      </div>
    );
  }

  return (
    <Filterleiste
      beschriftung="Übungen filtern"
      suche={suche}
      gesetzt={gesetzt}
      onZuruecksetzen={() => setFilter(ohneFilter(filter))}
      ergebnis={<span role="status">{ergebnis}</span>}
    >
      {chips}
    </Filterleiste>
  );
}
