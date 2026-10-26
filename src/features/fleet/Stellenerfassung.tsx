import { Button } from '@/components/ui/Button';
import { Disclosure } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';
import { ListRow, ListRows } from '@/components/ui/ListRow';
import { Wahlreihe } from '@/components/ui/Wahlreihe';
import { BIKE_ZONES, checkItemLabels, isZoneKey, zoneCheckItem, zoneLabel } from './zones';
import type { Spot } from './api';
import { Bauteilwahl } from './Bauteilwahl';
import { Einstufung } from './Einstufung';
import { Fotovormerkung } from './Fotovormerkung';
import type { Entwurf, Stellenzustand } from './stellen';

/**
 * Stellen erfassen in Check-Up und Panne: Bauteil aus der Liste, Einstufung, Notiz, Fotos.
 * Schon offene Stellen werden nicht übernommen; erst die Freigabe erledigt sie (ANN-555).
 */

/**
 * Ohne offene Stelle: die gesetzten Stellen mit „Ändern“, darunter die Liste für die nächste.
 * Ohne Rahmen, weil das Fenster schon die Fläche ist (kein Kasten im Kasten).
 */
export function Stellenflaeche({
  zustand,
  bestehend,
}: {
  zustand: Stellenzustand;
  /** Die offenen Stellen des Rads aus früheren Meldungen. */
  bestehend: readonly Spot[];
}) {
  const { art, stellen, entwurf } = zustand;

  if (entwurf) return <Entwurfsfeld zustand={zustand} entwurf={entwurf} />;

  return (
    <div className="flex flex-col gap-3">
      {stellen.length > 0 ? (
        <ListRows
          rahmen={false}
          beschriftung={art === 'panne' ? 'Schäden am Rad' : 'Markierte Stellen'}
        >
          {stellen.map((stelle) => {
            const pruefpunkt = zoneCheckItem(stelle.zone);
            return (
              <ListRow
                key={stelle.key}
                titel={zoneLabel(stelle.zone)}
                meta={
                  <>
                    {art === 'checkup' ? (
                      <span className="block">
                        <Einstufung einstufung={stelle.severity} />
                        {pruefpunkt
                          ? ` · Prüfpunkt ${checkItemLabels[pruefpunkt]}`
                          : ' · weitere Stelle'}
                      </span>
                    ) : null}
                    <span className="block">{stelle.note.trim() || 'Ohne Notiz'}</span>
                    {stelle.fotos.length > 0 ? (
                      <span className="block">
                        {stelle.fotos.length === 1 ? '1 Foto' : `${stelle.fotos.length} Fotos`}
                      </span>
                    ) : null}
                  </>
                }
                aktion={
                  <Button
                    type="button"
                    variant="secondary"
                    aria-label={`${zoneLabel(stelle.zone)} ändern`}
                    onClick={() => zustand.bearbeite(stelle.key)}
                  >
                    Ändern
                  </Button>
                }
              />
            );
          })}
        </ListRows>
      ) : null}

      <Bauteilwahl
        label={stellen.length > 0 ? 'Weiteres Bauteil' : 'Bauteil'}
        wert=""
        onWahl={zustand.waehle}
        autofokus={stellen.length === 0}
      />

      <SchonOffen offene={bestehend} />
    </div>
  );
}

/**
 * Die offenen Stellen des Rads aus früheren Meldungen, eingeklappt - in der Panne und im
 * Abschluss des Check-Ups.
 */
export function SchonOffen({ offene }: { offene: readonly Spot[] }) {
  if (offene.length === 0) return null;
  return (
    <Disclosure summary="Schon offen am Rad" anzahl={offene.length}>
      <ListRows rahmen={false} beschriftung="Schon offen am Rad">
        {offene.map((spot) => (
          <ListRow
            key={spot.id}
            titel={zoneLabel(spot.zone)}
            meta={
              <>
                <span className="block">
                  <Einstufung einstufung={spot.severity} />
                </span>
                {spot.note ? <span className="block">{spot.note}</span> : null}
              </>
            }
          />
        ))}
      </ListRows>
    </Disclosure>
  );
}

/** Die offene Stelle: Bauteil, im Check-Up die Bewertung, Notiz und Fotos, dann „Stelle setzen“. */
export function Entwurfsfeld({ zustand, entwurf }: { zustand: Stellenzustand; entwurf: Entwurf }) {
  const { art } = zustand;
  const zone = isZoneKey(entwurf.zone) ? BIKE_ZONES[entwurf.zone] : null;
  const zuordnung =
    !zone || art === 'panne'
      ? undefined
      : zone.check
        ? `Gehört zum Prüfpunkt „${checkItemLabels[zone.check]}“.`
        : 'Kein eigener Prüfpunkt. Wird als weitere Stelle festgehalten.';
  const bezug = zone ? `zu ${zone.label}` : 'zur Stelle';

  return (
    <div className="flex flex-col gap-4">
      <Bauteilwahl
        label="Bauteil"
        wert={entwurf.zone}
        onWahl={(wert) => zustand.aendere({ zone: wert })}
        hinweis={zuordnung}
        autofokus
      />

      {art === 'checkup' ? (
        <Wahlreihe
          legende="Bewertung der Stelle"
          wahlen={[
            { wert: 'beobachten', text: 'Beobachten' },
            { wert: 'problem', text: 'Problem' },
          ]}
          gewaehlt={entwurf.severity}
          onWaehlen={(severity) => zustand.aendere({ severity })}
        />
      ) : null}

      <Field
        label={art === 'panne' ? 'Was ist passiert?' : 'Notiz zur Stelle'}
        placeholder={art === 'panne' ? 'z. B. Riemen springt über' : 'Was ist aufgefallen?'}
        hint="Keine Angaben zu Patient:innen."
        maxLength={500}
        value={entwurf.note}
        onChange={(event) => zustand.aendere({ note: event.target.value })}
      />

      <div>
        <p className="text-ink mb-2 text-sm font-medium">Fotos zur Stelle</p>
        <Fotovormerkung
          fotos={entwurf.fotos}
          onFotos={(fotos) => zustand.aendere({ fotos })}
          titel={`Foto ${bezug}`}
          bezug={bezug}
        />
      </div>

      <div className="flex flex-wrap gap-3">
        <Button type="button" disabled={!zone} onClick={zustand.uebernehmen}>
          {entwurf.key ? 'Änderung übernehmen' : 'Stelle setzen'}
        </Button>
        {/* Nicht „Abbrechen“: Darunter steht das „Abbrechen“ der ganzen Meldung. */}
        <Button type="button" variant="quiet" onClick={zustand.verwerfen}>
          Verwerfen
        </Button>
        {entwurf.key ? (
          <Button type="button" variant="quiet" onClick={zustand.entfernen}>
            Entfernen
          </Button>
        ) : null}
      </div>
    </div>
  );
}
