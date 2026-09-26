import { Suspense, lazy, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Field } from '@/components/ui/Field';
import { PageHeader } from '@/components/ui/PageHeader';
import { Section } from '@/components/ui/Section';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Select } from '@/components/ui/Select';
import { fetchAssignableTherapists, todayInTimeZone } from '@/features/appointments/api';
import type { CurrentUser } from '@/features/session/types';
import { fetchStandorte, startpunkt } from './startort';
import { Fahrtabschnitt, Routenzusammenfassung } from './Fahrten';
import { useFahrten, useTagesstopps } from './fahrpuffer';
import { Tourenliste } from './Tourenliste';

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
 * und behält Zeit, Name und Anschrift in Fahrtreihenfolge.
 */

type Startwahl = 'standort' | 'erster';

export function TourenPage({ user }: { user: CurrentUser }) {
  const zeitzone = user.organizationTimeZone ?? 'Europe/Berlin';
  const [suche, setSuche] = useSearchParams();
  const tag = suche.get('tag') ?? todayInTimeZone(zeitzone);
  const gewuenscht = suche.get('person');
  const [startwahl, setStartwahl] = useState<Startwahl>('standort');

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

  const { stopps, laedt, fehler } = useTagesstopps(tag, person);
  const praxisstart = startpunkt(standorte.data?.[0]);
  const start = startwahl === 'standort' ? praxisstart : null;
  const fahrten = useFahrten(start, stopps);
  const personName = personen.data?.find((p) => p.staff_member_id === person)?.display_name;

  return (
    <>
      {/* Die Tour ist eine Ansicht des Kalenders (BEF-044, ANN-113): Der Weg
          zurück führt in die Tagesansicht mit demselben Tag und derselben
          Person, nicht an den Anfang. */}
      <PageHeader
        title="Tour"
        description="Die Besuche eines Tages in Fahrtreihenfolge — mit Karte, Route und Fahrzeiten."
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

      <div className="mb-6 grid max-w-3xl gap-4 sm:grid-cols-3 print:hidden">
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
        <Select
          label="Start"
          value={startwahl}
          onChange={(e) => setStartwahl(e.target.value === 'erster' ? 'erster' : 'standort')}
        >
          <option value="standort" disabled={praxisstart === null}>
            {praxisstart === null ? 'Praxis (noch nicht verortet)' : 'Praxis'}
          </option>
          <option value="erster">Erster Besuch</option>
        </Select>
      </div>

      {personen.isError ? (
        <ErrorState title="Die behandelnden Personen konnten nicht geladen werden." />
      ) : null}
      {person === '' ? null : laedt ? (
        <LoadingState label="Tagesroute wird geladen …" />
      ) : fehler ? (
        <ErrorState
          title="Die Tagesroute konnte nicht geladen werden."
          description="Bitte später erneut versuchen. Sind Sie noch angemeldet?"
        />
      ) : stopps.length === 0 ? (
        <EmptyState
          title="An diesem Tag gibt es keine Besuche mit Ort"
          description="Videotermine und interne Termine haben keinen Weg und stehen deshalb nicht in der Tour."
        />
      ) : (
        <>
          <Suspense fallback={<LoadingState label="Karte wird geladen …" />}>
            <TagesrouteKarte start={start} stopps={stopps} />
          </Suspense>

          <Section
            titel={`Tourenliste${personName ? ` · ${personName}` : ''}`}
            aktion={
              <Button
                type="button"
                variant="secondary"
                className="print:hidden"
                onClick={() => window.print()}
              >
                Drucken
              </Button>
            }
          >
            <div className="mb-4">
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
              zwischen={(index) => (
                <Fahrtabschnitt
                  sekunden={fahrten.zwischen[index]?.sekunden ?? null}
                  pruefung={fahrten.zwischen[index]?.pruefung ?? null}
                  zeitzone={zeitzone}
                />
              )}
            />
          </Section>
        </>
      )}

      <p className="text-ink-subtle mt-8 max-w-prose text-xs leading-relaxed print:hidden">
        Zur Route gehen nur Koordinaten in Fahrtreihenfolge über den eigenen Server an den
        Kartendienst — kein Name, keine Uhrzeit. Gespeichert wird davon nichts. Echte
        Patientenadressen erreichen den Kartendienst erst nach dem Gate aus ADR-019 (Vertrag, §203
        StGB, Datenschutz-Folgenabschätzung).
      </p>
    </>
  );
}
