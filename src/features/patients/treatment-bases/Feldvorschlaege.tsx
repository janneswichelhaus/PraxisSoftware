import { useEffect, useRef } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Formularfuss } from '@/components/ui/Formularfuss';
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
  meldung,
  onUebernehmen,
}: {
  felder: FelderVorschlag;
  /** Die Werte im Formularsinn; fehlt, solange kein Vorschlag offen ist. */
  vorschlaege: readonly Feldvorschlag[] | undefined;
  /** Warum gerade nicht gespeichert wird: Der Vorschlag ist noch offen. */
  meldung?: string | undefined;
  onUebernehmen: () => void;
}) {
  const abschnitt = useRef<HTMLDivElement>(null);
  const da = vorschlaege !== undefined;

  // Der Vorschlag erscheint unter dem Foto; der Fokus folgt ihm, auch nach einem Hinweis.
  useEffect(() => {
    if (da) abschnitt.current?.focus();
  }, [da, meldung]);

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
          {meldung ? <Statusmeldung ton="fehler">{meldung}</Statusmeldung> : null}
          {felder.nachbildung ? (
            <Statusmeldung ton="warnung">{FELDER_NACHBILDUNG}</Statusmeldung>
          ) : null}
          <ListRows beschriftung="Vorgeschlagene Felder">
            {vorschlaege.map((vorschlag, nummer) => (
              <ListRow
                key={`${vorschlag.feld}-${String(nummer)}`}
                bezeichnung={vorschlag.beschriftung}
                titel={<span className="wrap-anywhere">{vorschlag.anzeige}</span>}
                meta={<span className="wrap-anywhere">Aus: „{vorschlag.quelle}“</span>}
                status={
                  vorschlag.grund ? <Badge ton="warnung">{vorschlag.grund}</Badge> : undefined
                }
              />
            ))}
          </ListRows>
          <Kleingedrucktes>{FELDER_RECHTSSATZ}</Kleingedrucktes>
          {/* Solange der Vorschlag offen ist, ist Übernehmen der Hauptknopf, zuerst (DESIGN.md Regel 4). */}
          <Formularfuss dicht>
            <Button
              type="button"
              disabled={vorschlaege.every((vorschlag) => vorschlag.wert === null)}
              onClick={onUebernehmen}
            >
              Übernehmen
            </Button>
            <Button type="button" variant="quiet" onClick={felder.verwerfen}>
              Verwerfen
            </Button>
          </Formularfuss>
        </div>
      </Section>
    </div>
  );
}
