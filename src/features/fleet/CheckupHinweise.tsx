import { useQuery } from '@tanstack/react-query';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Disclosure } from '@/components/ui/Card';
import { ListRow, ListRows } from '@/components/ui/ListRow';
import { Listenabschnitt } from '@/components/ui/Listenabschnitt';
import { fetchFleet, flotteSchluessel } from './api';
import { formatTag, wochentageKurz } from './format';
import { istMeinRad } from './rad';
import {
  CHECKUP_DAUER_MINUTEN,
  checkupVorschlaege,
  eintragenPfad,
  faelligAm,
  faelligText,
  faelligkeit,
  uhrzeit,
  type Tagesspalte,
} from './rhythmus';

/**
 * Hinweise auf den fälligen Fahrrad-Check-Up (FLT-009, ANN-570) - nie ein
 * fester Termin. Beide lesen die Flotte über dieselbe Abfrage wie die
 * Radflotte (`list_fleet`); wer sie nicht lesen darf, bekommt die Hinweise
 * gar nicht erst angeboten (die Seiten fragen `isTherapyStaff`).
 */

function useFlotte() {
  return useQuery({
    queryKey: flotteSchluessel(null),
    queryFn: () => fetchFleet(null),
    retry: false,
    staleTime: 5 * 60_000,
  });
}

/**
 * In der Übersicht: die eigenen Räder - Stammrad oder Schlüssel in der Hand -,
 * deren Check-Up heute fällig ist, mit dem Weg in den Check-Up.
 */
export function CheckupErinnerung({ heute, zone }: { heute: string; zone: string | null }) {
  const flotte = useFlotte();
  if (!flotte.data) return null;
  const { bikes, checkup_interval_days: rhythmus, my_staff_member_id: ich } = flotte.data;
  const faellig = bikes
    .filter((rad) => istMeinRad(rad, ich))
    .map((rad) => ({ rad, f: faelligkeit(rad, rhythmus, zone) }))
    .filter(
      (eintrag): eintrag is { rad: typeof eintrag.rad; f: NonNullable<typeof eintrag.f> } =>
        eintrag.f !== null && faelligAm(eintrag.f, heute),
    );
  if (faellig.length === 0) return null;
  return (
    <Listenabschnitt titel="Fahrrad-Check-Up fällig">
      {faellig.map(({ rad, f }) => (
        <ListRow
          key={rad.id}
          titel={rad.name}
          meta={`${faelligText(f, heute)} · etwa ${CHECKUP_DAUER_MINUTEN} Minuten`}
          aktion={
            <ButtonLink
              to={`/betrieb/flotte/checkup?rad=${rad.id}`}
              variant="secondary"
              groesse="kompakt"
              aria-label={`Check-Up ${rad.name} starten`}
            >
              Prüfen
            </ButtonLink>
          }
        />
      ))}
    </Listenabschnitt>
  );
}

/**
 * Im Kalender: die fälligen Räder der Personen im Ausschnitt, je mit der
 * frühesten freien Lücke von {@link CHECKUP_DAUER_MINUTEN} Minuten an einem
 * Einsatztag - ohne Termine zu berühren - und dem Weg, sie als Fehlzeit
 * einzutragen. Eingeklappt in einer Zeile: Der Kalender bleibt der Kalender.
 */
export function CheckupKalenderhinweis({
  spalten,
  heute,
  jetztMinute,
  zone,
  rueckweg,
}: {
  spalten: readonly Tagesspalte[];
  heute: string;
  jetztMinute: number | null;
  zone: string | null;
  rueckweg: string;
}) {
  const flotte = useFlotte();
  if (!flotte.data || spalten.length === 0) return null;
  const vorschlaege = checkupVorschlaege({
    raeder: flotte.data.bikes,
    rhythmus: flotte.data.checkup_interval_days,
    zone,
    heute,
    jetztMinute,
    spalten,
  });
  if (vorschlaege.length === 0) return null;
  return (
    <div className="nicht-drucken mt-3">
      <Disclosure summary="Fahrrad-Check-Up fällig" anzahl={vorschlaege.length}>
        <ListRows rahmen={false} beschriftung="Fällige Check-Ups">
          {vorschlaege.map(({ rad, faellig, luecke }) => (
            <ListRow
              key={rad.id}
              titel={`${rad.name} · ${rad.regular_rider?.name ?? ''}`}
              meta={
                <>
                  <span className="block">{faelligText(faellig, heute)}</span>
                  <span className="block">
                    {luecke
                      ? `Frei: ${luecke.tag === heute ? 'heute' : formatTag(`${luecke.tag}T12:00:00Z`, 'UTC')}, ${uhrzeit(luecke.von)}–${uhrzeit(luecke.bis)}`
                      : `Keine Lücke von ${CHECKUP_DAUER_MINUTEN} Minuten an den Radtagen (${wochentageKurz(rad.planned_weekdays) || 'alle Tage'}) im Ausschnitt`}
                  </span>
                </>
              }
              aktion={
                luecke ? (
                  <ButtonLink
                    to={eintragenPfad(luecke, rueckweg)}
                    variant="secondary"
                    groesse="kompakt"
                    aria-label={`Check-Up ${rad.name} eintragen`}
                  >
                    Eintragen
                  </ButtonLink>
                ) : undefined
              }
            />
          ))}
        </ListRows>
      </Disclosure>
    </div>
  );
}
