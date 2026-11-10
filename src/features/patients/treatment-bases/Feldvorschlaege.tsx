import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/Button';
import { Kleingedrucktes } from '@/components/ui/Kleingedrucktes';
import { ListRow, ListRows } from '@/components/ui/ListRow';
import { Section } from '@/components/ui/Section';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { FELDER_NACHBILDUNG, FELDER_RECHTSSATZ, type FelderVorschlag } from './felderVorschlag';
import type { Feldvorschlag } from './rezeptfelder';

/**
 * Unter dem Foto: „Felder vorschlagen“, danach je Wert seine Zeile vom Foto zum Vergleich.
 * Eingetragen wird erst auf ausdrücklichen Tipp, gespeichert erst mit „Speichern“.
 */
export function Feldvorschlaege({
  felder,
  vorschlaege,
  onUebernehmen,
}: {
  felder: FelderVorschlag;
  /** Die Werte im Formularsinn; fehlt, solange kein Vorschlag offen ist. */
  vorschlaege: readonly Feldvorschlag[] | undefined;
  onUebernehmen: () => void;
}) {
  const abschnitt = useRef<HTMLDivElement>(null);
  const da = vorschlaege !== undefined;

  // Der Vorschlag erscheint unter dem Foto; der Fokus folgt ihm für Vorlesesoftware.
  useEffect(() => {
    if (da) abschnitt.current?.focus();
  }, [da]);

  if (!felder.angeboten) return null;
  if (!vorschlaege) {
    return (
      <div className="mt-3 flex flex-col gap-3">
        {felder.meldung ? (
          <Statusmeldung ton={felder.meldung.ton}>{felder.meldung.text}</Statusmeldung>
        ) : null}
        <Button
          type="button"
          variant="secondary"
          className="self-start"
          disabled={felder.laeuft}
          onClick={() => void felder.starten()}
        >
          {felder.laeuft ? 'Felder werden gesucht …' : 'Felder vorschlagen'}
        </Button>
      </div>
    );
  }

  return (
    <div ref={abschnitt} tabIndex={-1} className="mt-4 focus:outline-none">
      <Section titel="Vom Foto – bitte prüfen" ebene={3}>
        <div className="flex flex-col gap-3">
          {felder.nachbildung ? (
            <Statusmeldung ton="warnung">{FELDER_NACHBILDUNG}</Statusmeldung>
          ) : null}
          <ListRows beschriftung="Vorgeschlagene Felder">
            {vorschlaege.map((vorschlag, nummer) => (
              <ListRow
                key={`${vorschlag.feld}-${String(nummer)}`}
                bezeichnung={vorschlag.beschriftung}
                titel={<span className="wrap-anywhere">{vorschlag.anzeige}</span>}
                meta={
                  <span className="wrap-anywhere">
                    Aus: „{vorschlag.quelle}“{vorschlag.grund ? ` · ${vorschlag.grund}` : ''}
                  </span>
                }
                gedaempft={vorschlag.wert === null}
              />
            ))}
          </ListRows>
          <Kleingedrucktes>{FELDER_RECHTSSATZ}</Kleingedrucktes>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="quiet" onClick={felder.verwerfen}>
              Verwerfen
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={vorschlaege.every((vorschlag) => vorschlag.wert === null)}
              onClick={onUebernehmen}
            >
              Übernehmen
            </Button>
          </div>
        </div>
      </Section>
    </div>
  );
}
