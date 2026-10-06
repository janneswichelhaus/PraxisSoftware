import { Suspense, lazy, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Disclosure } from '@/components/ui/Card';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Field } from '@/components/ui/Field';
import { PageHeader } from '@/components/ui/PageHeader';
import { Section } from '@/components/ui/Section';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Select } from '@/components/ui/Select';
import { formatDate } from '@/lib/datum';
import { fetchAssignableTherapists, todayInTimeZone } from '@/features/appointments/api';
import type { CurrentUser } from '@/features/session/types';
import { fetchStandorte, garagenpunkt, startpunkt } from './startort';
import { Fahrtabschnitt, Routenzusammenfassung } from './Fahrten';
import { useFahrten, useTagesstopps } from './fahrpuffer';
import { Tourenliste } from './Tourenliste';
import { Kleingedrucktes } from '@/components/ui/Kleingedrucktes';

const TagesrouteKarte = lazy(() => import('./TagesrouteKarte'));

/**
 * Touren — die Tagesroute einer Person (MAP-006b, ersetzt die Vorschau).
 * Seit BEF-044 eine Ansicht des Kalenders: erreichbar über „Tour" neben Tag
 * und Woche, ohne eigenen Unterpunkt.
 *
 * Der Kalender beantwortet „wer behandelt wen wann", diese Seite „wie kommt
 * die Person dahin". Beide lesen dieselben Termine; es gibt keine zweite
 * Terminliste und nichts Gespeichertes: Route und Fahrzeiten werden beim
 * Öffnen abgerufen und mit der Seite verworfen (ADR-019 Punkt 16).
 *
 * Der Startort gilt für diesen Besuch der Seite (ANN-096): der Standort der
 * Praxis oder der erste Besuch. Ein persönlicher Startort ist nicht gebaut —
 * er wäre eine Wohnadresse beim Kartendienst (§20).
 *
 * Die Liste ist druckbar: Der Browserdruck lässt Karte und Bedienelemente weg
 * und behält Zeit, Name und Anschrift in Fahrtreihenfolge. Das Datum steht
 * dafür im Titel der Liste (TER-12) - das Feld „Tag" druckt nicht mit, und
 * ein Blatt von gestern sähe sonst aus wie eins von heute.
 */

/**
 * UBK-015, ANN-240: Wo die Tour beginnt und endet - Garage, Praxis oder der
 * erste bzw. letzte Besuch. `null` ist die Voreinstellung: die Garage, falls
 * gesetzt, sonst die Praxis.
 */
type Ortswahl = 'garage' | 'standort' | 'besuch';

/** Der nächste Schritt nach einem Ladefehler (WRT-01) - ohne Ratefrage. */
const NACH_LADEFEHLER = 'Bitte die Verbindung prüfen und erneut versuchen.';

function alsOrtswahl(wert: string): Ortswahl {
  return wert === 'garage' || wert === 'besuch' ? wert : 'standort';
}

export function TourenPage({ user }: { user: CurrentUser }) {
  const zeitzone = user.organizationTimeZone ?? 'Europe/Berlin';
  const [suche, setSuche] = useSearchParams();
  const tag = suche.get('tag') ?? todayInTimeZone(zeitzone);
  const gewuenscht = suche.get('person');
  const [startwahl, setStartwahl] = useState<Ortswahl | null>(null);
  const [endwahl, setEndwahl] = useState<Ortswahl | null>(null);
  // UBK-009: Die Karte steht am Telefon zugeklappt, am Rechner offen - die
  // Liste ist das, wofür man die Tour öffnet. Gezeichnet (und damit Kacheln
  // geladen) wird sie erst, wenn sie offen ist.
  const [karteOffen, setKarteOffen] = useState(
    () =>
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(min-width: 1024px)').matches,
  );

  const personen = useQuery({
    queryKey: ['assignable-therapists'],
    queryFn: fetchAssignableTherapists,
    retry: false,
  });
  const standorte = useQuery({ queryKey: ['standorte'], queryFn: fetchStandorte, retry: false });

  const [person, setPerson] = useState('');
  useEffect(() => {
    const liste = personen.data;
    if (!liste || liste.length === 0) return;
    const ausAdresse = liste.find((p) => p.staff_member_id === gewuenscht);
    const selbst = liste.find((p) => p.staff_member_id === user.staffMemberId);
    setPerson(
      (bisher) => ausAdresse?.staff_member_id ?? (bisher || (selbst ?? liste[0]!).staff_member_id),
    );
  }, [personen.data, gewuenscht, user.staffMemberId]);

  function setzen(schluessel: 'tag' | 'person', wert: string) {
    const naechste = new URLSearchParams(suche);
    naechste.set(schluessel, wert);
    setSuche(naechste, { replace: true });
    if (schluessel === 'person') setPerson(wert);
  }

  const { stopps, laedt, fehler, erneut } = useTagesstopps(tag, person);
  const praxisstart = startpunkt(standorte.data?.[0]);
  const garage = garagenpunkt(standorte.data?.[0]);
  const voreinstellung: Ortswahl = garage ? 'garage' : 'standort';
  const startArt = startwahl ?? voreinstellung;
  const endArt = endwahl ?? voreinstellung;
  const ortDer = (art: Ortswahl) =>
    art === 'garage' ? garage : art === 'standort' ? praxisstart : null;
  const start = ortDer(startArt);
  const ende = ortDer(endArt);
  const fahrten = useFahrten(start, stopps, ende);
  const personName = personen.data?.find((p) => p.staff_member_id === person)?.display_name;
  // Der Weg zurück aus einem Termin führt in diese Tour, mit Tag und Person -
  // auch wenn die Adresszeile sie noch nicht trägt (TER-03).
  const rueckweg = `/touren?${new URLSearchParams({
    tag,
    ...(person ? { person } : {}),
  }).toString()}`;

  // Was die Option „Praxis" über den Startort sagt, steht erst nach dem Laden
  // fest (TER-11, ZST-09): Vorher behauptete sie „noch nicht verortet", auch
  // wenn die Abfrage bloß noch lief oder gescheitert war.
  const praxisOption = standorte.isPending
    ? 'Praxis'
    : standorte.isError
      ? 'Praxis (Startort nicht geladen)'
      : praxisstart === null
        ? 'Praxis (ohne Kartenposition)'
        : 'Praxis';

  return (
    <>
      {/* Die Tour ist eine Ansicht des Kalenders (BEF-044, ANN-113): Der Weg
          zurück führt in die Tagesansicht mit demselben Tag und derselben
          Person, nicht an den Anfang. */}
      {/* UBK-009: kein Erklärsatz über der Bedienung - die Liste soll ohne
          Scrollen beginnen (Sichtung Jannes 2026-10-05). */}
      <PageHeader
        title="Tour"
        actions={
          <span className="print:hidden">
            <ButtonLink
              to={`/kalender?${new URLSearchParams({
                ansicht: 'tag',
                datum: tag,
                ...(person ? { person } : {}),
              }).toString()}`}
              variant="secondary"
            >
              Zum Kalender
            </ButtonLink>
          </span>
        }
      />

      {/* Person und Tag in einer Zeile, auch am Telefon (UBK-009); der Start
          steht an der Liste, wo er wirkt. */}
      <div className="mb-4 grid max-w-xl grid-cols-2 gap-3 print:hidden">
        <Select label="Person" value={person} onChange={(e) => setzen('person', e.target.value)}>
          {(personen.data ?? []).map((p) => (
            <option key={p.staff_member_id} value={p.staff_member_id}>
              {p.display_name}
            </option>
          ))}
        </Select>
        <Field
          label="Tag"
          type="date"
          value={tag}
          onChange={(e) => setzen('tag', e.target.value)}
        />
      </div>

      {/* Ohne Personen gibt es keine Tour - das sagt die Seite, statt eine
          leere Auswahl stehen zu lassen (TER-11, ZST-07). */}
      {personen.isPending ? (
        <LoadingState label="Personen werden geladen …" />
      ) : personen.isError ? (
        <ErrorState
          title="Die behandelnden Personen konnten nicht geladen werden."
          description={NACH_LADEFEHLER}
          onErneut={() => personen.refetch()}
        />
      ) : personen.data.length === 0 ? (
        <EmptyState title="Keine behandelnde Person hinterlegt" />
      ) : person === '' ? null : laedt ? (
        <LoadingState label="Tagesroute wird geladen …" />
      ) : fehler ? (
        <ErrorState
          title="Die Tagesroute konnte nicht geladen werden."
          description={NACH_LADEFEHLER}
          onErneut={erneut}
        />
      ) : stopps.length === 0 ? (
        <EmptyState
          title="An diesem Tag gibt es keine Besuche mit Ort"
          description="Videotermine und Fehlzeiten haben keinen Weg und stehen deshalb nicht in der Tour."
        />
      ) : (
        <>
          <div className="mb-4 print:hidden">
            <Disclosure
              kopf="label"
              offen={karteOffen}
              onUmschalten={setKarteOffen}
              summary={<h2>Karte</h2>}
            >
              {karteOffen ? (
                <Suspense fallback={<LoadingState label="Karte wird geladen …" />}>
                  <TagesrouteKarte start={start} stopps={stopps} ende={ende} />
                </Suspense>
              ) : null}
            </Disclosure>
          </div>

          <Section titel={['Tourenliste', personName, formatDate(tag)].filter(Boolean).join(' · ')}>
            {/* Routensumme und ihre Meldungen gehören zur Bedienung, nicht
                aufs Papier (TER-12). */}
            <div className="mb-4 space-y-3 print:hidden">
              {/* Start und Drucken in einer Zeile: Am Telefon steht die Liste
                  so ohne Scrollen im Blick (UBK-009). */}
              <div className="flex items-end gap-3">
                <div className="w-40 min-w-0">
                  <Select
                    label="Start"
                    value={startArt}
                    onChange={(e) => setStartwahl(alsOrtswahl(e.target.value))}
                  >
                    <option value="garage" disabled={garage === null}>
                      {garage === null ? 'Garage (nicht gesetzt)' : 'Garage'}
                    </option>
                    <option value="standort" disabled={praxisstart === null}>
                      {praxisOption}
                    </option>
                    <option value="besuch">Erster Besuch</option>
                  </Select>
                </div>
                {/* UBK-015: das Ende der Tour - der Rückweg steht als letzte Zeile. */}
                <div className="w-40 min-w-0">
                  <Select
                    label="Ende"
                    value={endArt}
                    onChange={(e) => setEndwahl(alsOrtswahl(e.target.value))}
                  >
                    <option value="garage" disabled={garage === null}>
                      {garage === null ? 'Garage (nicht gesetzt)' : 'Garage'}
                    </option>
                    <option value="standort" disabled={praxisstart === null}>
                      {praxisOption}
                    </option>
                    <option value="besuch">Letzter Besuch</option>
                  </Select>
                </div>
                <Button type="button" variant="secondary" onClick={() => window.print()}>
                  Drucken
                </Button>
              </div>
              <Routenzusammenfassung
                laedt={fahrten.route.isFetching}
                ergebnis={fahrten.route.data}
                erneutVersuchen={() => void fahrten.route.refetch()}
              />
              {fahrten.pruefungFehler ? (
                <Statusmeldung ton="warnung" className="mt-2">
                  Der Fahrpuffer ließ sich gerade nicht prüfen.
                </Statusmeldung>
              ) : null}
            </div>
            <Tourenliste
              stopps={stopps}
              zeitzone={zeitzone}
              startGewaehlt={start !== null}
              startText={startArt === 'garage' ? 'Start an der Garage' : 'Start an der Praxis'}
              ende={
                ende && fahrten.rueckweg
                  ? {
                      text: endArt === 'garage' ? 'Ende an der Garage' : 'Ende an der Praxis',
                      // Endet der Tag am Ort des letzten Besuchs, gibt es
                      // keinen Rückweg - nur das Ende.
                      fahrt:
                        fahrten.rueckweg.sekunden === 0 ? null : (
                          <Fahrtabschnitt
                            titel="Rückweg"
                            sekunden={fahrten.rueckweg.sekunden}
                            meter={fahrten.rueckweg.meter}
                            pruefung={null}
                            zeitzone={zeitzone}
                          />
                        ),
                    }
                  : null
              }
              rueckweg={rueckweg}
              zwischen={(index) => (
                <Fahrtabschnitt
                  sekunden={fahrten.zwischen[index]?.sekunden ?? null}
                  meter={fahrten.zwischen[index]?.meter ?? null}
                  pruefung={fahrten.zwischen[index]?.pruefung ?? null}
                  zeitzone={zeitzone}
                  naechsterBeginn={stopps[index + 1]?.termin.starts_at}
                />
              )}
            />
          </Section>
        </>
      )}

      {/* Ohne Projekt- und Technikwörter (WRT-03, TER-07): Was das Gerät
          verlässt und unter welcher Bedingung echte Adressen dazukommen. */}
      <Kleingedrucktes className="mt-8 print:hidden">
        Zur Route gehen nur Koordinaten in Fahrtreihenfolge an den Kartendienst – kein Name, keine
        Uhrzeit. Gespeichert wird davon nichts. Echte Patientenadressen erreichen den Kartendienst
        erst, wenn Vertrag, Schweigepflicht (§ 203 StGB) und Datenschutz-Folgenabschätzung geklärt
        sind.
      </Kleingedrucktes>
    </>
  );
}
