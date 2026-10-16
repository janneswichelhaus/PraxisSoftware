import { useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import { Disclosure } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';
import { ListRow, ListRows } from '@/components/ui/ListRow';
import { Select } from '@/components/ui/Select';
import { Wahlreihe } from '@/components/ui/Wahlreihe';
import { BikeModel3D } from './bike3d/BikeModel3D';
import {
  BIKE_ZONES,
  ZONE_GROUPS,
  checkItemLabels,
  isZoneKey,
  zoneCheckItem,
  zoneLabel,
  type BikeType,
} from './bike3d/zones';
import type { Spot } from './api';
import { Fotovormerkung } from './Fotovormerkung';
import { Einstufung, Nadel } from './Nadel';
import { nummerDerStelle, radBild, type Entwurf, type Stellenzustand } from './stellen';

/**
 * Stellen am 3D-Rad markieren - im Check-Up und in der Pannenmeldung
 * (Handoff Lastenrad 3D, Abschnitt 4; AC 1, 2 und 7).
 *
 * **Antippen** eines Bauteils setzt eine neue Nadel und öffnet darunter die
 * Stelle: Bauteil (vorbelegt), im Check-Up die Bewertung, eine Notiz, Fotos.
 * Eine offene Stelle wandert mit jedem weiteren Tippen mit; „Stelle setzen“
 * übernimmt sie. **Ohne 3D-Rad** legt „Bauteil aus Liste wählen“ dieselbe
 * Stelle an - Pflicht, nicht Komfort: Bedienung ohne Ziehen und ohne Tippen
 * auf kleine Flächen, und ohne WebGL.
 *
 * Seit Überholung 6 (G3) im Fenster des geführten Ablaufs: das Rad als Bühne
 * (`Stellenbuehne`), darunter die offene Stelle oder die Liste der Schäden
 * (`Stellenflaeche`). Der geführte Check-Up setzt sich dieselben Teile selbst
 * zusammen (`Entwurfsfeld`, `SchonOffen`).
 *
 * Gespeichert wird der Punkt in Modellkoordinaten (ANN-555). Nummeriert wird
 * über alle offenen Stellen des Rads: Die schon offenen stehen mit ihrer
 * Nummer am Rad, die neuen zählen weiter - dieselbe Nummer danach an der
 * Nadel, in der Liste und in der Unterlage für die Werkstatt. Schon offene
 * Stellen werden nicht übernommen, nicht bestätigt und erst mit der
 * Freigabe erledigt (ANN-555).
 */

/** Das 3D-Rad als Bühne: Antippen setzt eine Nadel oder versetzt die offene. */
export function Stellenbuehne({
  zustand,
  bestehend,
  bauart,
}: {
  zustand: Stellenzustand;
  /** Die offenen Stellen des Rads aus früheren Meldungen, mit ihrer Nummer. */
  bestehend: readonly Spot[];
  bauart: BikeType;
}) {
  const { entwurf, hervorgehoben } = zustand;
  const { markers, draft } = radBild(zustand, bestehend, bauart);
  const highlight = entwurf?.zone ? [entwurf.zone] : hervorgehoben ? hervorgehoben.zonen : [];
  const hinweis = entwurf
    ? 'Antippen versetzt die Nadel'
    : hervorgehoben
      ? 'Betroffene Stelle antippen'
      : 'Ziehen dreht · Antippen markiert';

  return (
    <BikeModel3D
      hoehe="100%"
      markers={markers}
      draft={draft}
      activeMarkerId={entwurf?.key ?? null}
      highlight={highlight}
      focus={zustand.fokus}
      hinweis={hinweis}
      onPick={zustand.tippen}
    />
  );
}

/**
 * Unter der Bühne: die offene Stelle mit „Stelle setzen“ als Hauptknopf -
 * oder die neuen Stellen mit „Ändern“, der Weg ohne 3D-Rad und die schon
 * offenen. Ohne Rahmen: Das Fenster ist schon die Fläche (kein Kasten im
 * Kasten).
 */
export function Stellenflaeche({
  zustand,
  bestehend,
  bauart,
}: {
  zustand: Stellenzustand;
  bestehend: readonly Spot[];
  bauart: BikeType;
}) {
  const { art, stellen, entwurf } = zustand;
  const { offene, aktivNummer } = radBild(zustand, bestehend, bauart);

  if (entwurf) {
    return (
      <Entwurfsfeld
        zustand={zustand}
        entwurf={entwurf}
        nummer={aktivNummer}
        rahmen={false}
        hauptknopf
        knapp
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {stellen.length > 0 ? (
        <ListRows
          rahmen={false}
          beschriftung={art === 'panne' ? 'Schäden am Rad' : 'Markierte Stellen'}
        >
          {stellen.map((stelle, index) => {
            const nummer = nummerDerStelle(index, offene.length);
            const pruefpunkt = zoneCheckItem(stelle.zone);
            return (
              <ListRow
                key={stelle.key}
                zeit={<Nadel nummer={nummer} einstufung={stelle.severity} />}
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
                    aria-label={`Stelle ${nummer} ändern: ${zoneLabel(stelle.zone)}`}
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

      <Button type="button" variant="secondary" className="w-full" onClick={zustand.ohneModell}>
        Bauteil aus Liste wählen
      </Button>

      <SchonOffen offene={offene} />
    </div>
  );
}

/**
 * Die offenen Stellen des Rads aus früheren Meldungen, eingeklappt - in der
 * Pannenmeldung und im Abschluss des Check-Ups. Ohne 3D-Rad die einzige
 * Stelle, an der sie stehen (Design-Review FLT-005, B8).
 */
export function SchonOffen({ offene }: { offene: readonly Spot[] }) {
  if (offene.length === 0) return null;
  return (
    <Disclosure summary="Schon offen am Rad" anzahl={offene.length}>
      <ListRows rahmen={false} beschriftung="Schon offen am Rad">
        {offene.map((spot) => (
          <ListRow
            key={spot.id}
            zeit={<Nadel nummer={spot.number ?? 0} einstufung={spot.severity} />}
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

/** Das Bauteil der offenen Stelle - es gibt immer nur eine. */
const BAUTEIL_ID = 'stelle-bauteil';

export function Entwurfsfeld({
  zustand,
  entwurf,
  nummer,
  rahmen = true,
  hauptknopf = false,
  knapp = false,
}: {
  zustand: Stellenzustand;
  entwurf: Entwurf;
  nummer: number;
  /** Als Karte unter dem Rad; im Fenster des Check-Ups ohne (kein Kasten im Kasten). */
  rahmen?: boolean;
  /** „Stelle setzen“ als Hauptknopf - dort, wo die Stelle die ganze Seite ist. */
  hauptknopf?: boolean;
  /**
   * Knapp, unter dem Rad im Fenster der Panne (Überholung 6, G3): Ein am Rad
   * getipptes Bauteil steht im Titel der Stelle, ein anderes ist ein Tipp aufs
   * Rad. Die Liste der Bauteile steht nur ohne Punkt am Rad - über „Bauteil aus
   * Liste wählen“ geöffnet. So bleibt „Stelle setzen“ am Telefon im Bild.
   */
  knapp?: boolean;
}) {
  const { art } = zustand;
  const zone = isZoneKey(entwurf.zone) ? BIKE_ZONES[entwurf.zone] : null;
  const pruefpunkt = zone?.check ?? null;
  const zuordnung = !zone
    ? 'Bauteil am Rad antippen oder in der Liste wählen.'
    : art === 'panne'
      ? null
      : pruefpunkt
        ? `Gehört zum Prüfpunkt „${checkItemLabels[pruefpunkt]}“.`
        : 'Kein eigener Prüfpunkt. Wird als weitere Stelle festgehalten.';

  // Geöffnet über die Liste oder die Tastatur: der Fokus auf das Bauteil.
  const offenVonListe = entwurf.zone === '';
  const mitListe = !knapp || entwurf.point === null;
  useEffect(() => {
    if (offenVonListe) document.getElementById(BAUTEIL_ID)?.focus();
  }, [offenVonListe]);

  return (
    <div
      role="group"
      aria-labelledby="stelle-titel"
      className={`flex flex-col ${knapp ? 'gap-3' : 'gap-4'} ${rahmen ? 'rounded-card border-line bg-surface border p-4' : ''}`.trim()}
    >
      <div className="flex items-start gap-3">
        <Nadel nummer={nummer} einstufung={entwurf.severity} neu={!entwurf.key} />
        <div className="min-w-0">
          <p id="stelle-titel" className="text-ink text-liste font-semibold">
            {zone ? zone.label : 'Neue Stelle'}
          </p>
          {zuordnung ? <p className="text-ink-muted text-sm">{zuordnung}</p> : null}
        </div>
      </div>

      {mitListe ? (
        <Select
          feldId={BAUTEIL_ID}
          label="Bauteil"
          value={entwurf.zone}
          onChange={(event) => zustand.aendere({ zone: event.target.value })}
        >
          <option value="">Bauteil wählen</option>
          {ZONE_GROUPS.map((gruppe) => (
            <optgroup key={gruppe.label} label={gruppe.label}>
              {gruppe.zones.map((key) => (
                <option key={key} value={key}>
                  {BIKE_ZONES[key].label}
                </option>
              ))}
            </optgroup>
          ))}
        </Select>
      ) : null}

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
        {knapp ? null : <p className="text-ink mb-2 text-sm font-medium">Fotos zur Stelle</p>}
        <Fotovormerkung
          fotos={entwurf.fotos}
          onFotos={(fotos) => zustand.aendere({ fotos })}
          titel={`Foto zu Stelle ${nummer}`}
          bezug={`zu Stelle ${nummer}`}
        />
      </div>

      <div className="flex flex-wrap gap-3">
        <Button
          type="button"
          variant={hauptknopf ? 'primary' : 'secondary'}
          disabled={!zone}
          onClick={zustand.uebernehmen}
        >
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
