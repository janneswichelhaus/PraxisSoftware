import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Checkbox } from '@/components/ui/Checkbox';
import { Fehlerzusammenfassung } from '@/components/ui/Fehlerzusammenfassung';
import { Field } from '@/components/ui/Field';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { Section } from '@/components/ui/Section';
import { Select } from '@/components/ui/Select';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { roleLabels } from '@/components/ui/roleLabels';
import {
  EINGABETEXTE,
  useTextverlustschutz,
  type Verlustschutztexte,
} from '@/features/documentation/Textverlustschutz';
import { formatDate } from '@/lib/datum';
import { alsFormularfehler } from '@/lib/formularfehler';
import { canManageAppointments, type CurrentUser } from '@/features/session/types';
import { EreignisArbeitszeitRueckfrage, EreignisFormFields } from './EreignisFormFields';
import { fetchStaffMembers } from '@/features/staff/api';
import { leseRueckweg } from '@/lib/rueckweg';
import {
  EREIGNIS_BESCHRIFTUNGEN,
  EREIGNIS_FEHLERFELDER,
  EREIGNIS_FELD_IDS,
  ereignisGeaendert,
  FEHLZEIT_BEISPIELE,
  istIsoDatum,
  mitEingetragenerFehlzeit,
  type EreignisFehlerfeld,
} from './calendar';
import {
  createEventSeries,
  ereignisFormSchema,
  fetchLocations,
  istAusserhalbArbeitszeit,
  leseTerminVorbelegung,
  todayInTimeZone,
  type EreignisFormValues,
} from './api';
import { SERIE_HOECHSTZAHL, rhythmen, serienTermine, type Rhythmus } from './serie';

/**
 * Dauerfehlzeit eintragen (CAL-021).
 *
 * Eine Fehlzeit ist ein Ereignis: Teammeeting, Achtsamkeitspuffer, Kaffeezeit
 * mit Kolleg:in. Sie belegt Zeit im Kalender, sie ist ausdrücklich **keine
 * Behandlung** (`PROJECT_PRINCIPLES.md` §8.1) und erzeugt nie eine
 * abrechenbare Leistung (§19). Die Dauerfehlzeit ist dieselbe Fehlzeit über
 * mehrere Wochen.
 *
 * Bewusst dasselbe Formular wie beim einzelnen Ereignis, ergänzt um Rhythmus
 * und Anzahl: Es fragt dieselben Dinge, und ein zweites Ereignisformular
 * daneben wäre eine zweite Wahrheit über dieselbe Sache.
 *
 * Die Tage rechnet `serienTermine` - dieselbe deterministische Rechnung und
 * dieselben drei Rhythmen wie bei der Terminserie (CAL-007, §6.2). Was daraus
 * wird, entscheidet `create_event_series`: alles oder nichts, mit derselben
 * Prüfung auf Raster, Arbeitszeit und Überschneidung wie bei jedem Termin.
 *
 * Wie beim einzelnen Ereignis: Eingaben gehen nicht still verloren (KAL-20),
 * und was fehlt, steht zusammengefasst über dem Formular (KAL-17) - auch eine
 * Anzahl außerhalb von 1 bis 30, die bisher still gekappt wurde.
 */
type Feld = keyof EreignisFormValues;
type Fehlerfeld = EreignisFehlerfeld | 'anzahl';

const leer: EreignisFormValues = {
  title: '',
  staff_member_ids: [],
  appointment_type: 'practice',
  date: '',
  start_time: '',
  end_time: '',
  location_id: '',
};

/** Vorbelegte Anzahl: sechs Wochen sind die übliche Dauer einer Reihe. */
const ANZAHL_VORGABE = '6';

/** Die Sätze des Verlustschutzes für dieses Formular. */
const FEHLZEITTEXTE: Verlustschutztexte = {
  ...EINGABETEXTE,
  bezeichnung: 'Ungespeicherte Dauerfehlzeit',
};

/** Kennungen außerhalb der gemeinsamen Ereignisfelder. */
const ANZAHL_ID = 'fehlzeit-anzahl';
const BETEILIGTE_FEHLER_ID = `${EREIGNIS_FELD_IDS.staff_member_ids}-fehler`;

const FEHLERFELDER: readonly Fehlerfeld[] = [...EREIGNIS_FEHLERFELDER, 'anzahl'];
const FEHLERBESCHRIFTUNGEN: Readonly<Record<Fehlerfeld, string>> = {
  ...EREIGNIS_BESCHRIFTUNGEN,
  date: 'Erste Fehlzeit am',
  anzahl: 'Anzahl Fehlzeiten',
};

/** „1 Fehlzeit" gegen „6 Fehlzeiten" - an einer Stelle statt in jeder Meldung. */
function fehlzeitenWort(anzahl: number): string {
  return anzahl === 1 ? '1 Fehlzeit' : `${anzahl} Fehlzeiten`;
}

/** Wochentag eines Kalendertags, ohne Zeitzonenrechnung. */
function wochentag(tag: string, form: 'short' | 'long'): string {
  return new Intl.DateTimeFormat('de-DE', { weekday: form, timeZone: 'UTC' }).format(
    new Date(`${tag}T00:00:00Z`),
  );
}

/**
 * Ein Tag der Serie mit Wochentag: „So, 27.09.2026" (KAL-B03). Ohne ihn fiel
 * ein falscher Wochentag nicht auf - ohne Vorbelegung ist der erste Tag
 * heute, und ein Teammeeting lag dann wochenlang sonntags.
 */
function tagMitWochentag(tag: string): string {
  return `${wochentag(tag, 'short')}, ${formatDate(tag)}`;
}

/** Die Wochentage einer Serie für die Zeile über der Liste: „mittwochs". */
const WOCHENTAGE_ADVERB = [
  'sonntags',
  'montags',
  'dienstags',
  'mittwochs',
  'donnerstags',
  'freitags',
  'samstags',
] as const;

function wochentageDerSerie(tage: readonly string[]): string {
  const namen = [
    ...new Set(tage.map((tag) => WOCHENTAGE_ADVERB[new Date(`${tag}T00:00:00Z`).getUTCDay()]!)),
  ];
  return namen.length <= 1
    ? namen.join('')
    : `${namen.slice(0, -1).join(', ')} und ${namen.at(-1)!}`;
}

export function NewEventSeriesPage({ user }: { user: CurrentUser }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [suche] = useSearchParams();
  const zurueck = leseRueckweg(suche, '/kalender');

  // Tag und Zeiten kommen aus der aufgezogenen Spanne im Kalender, wenn der
  // Weg von dort kam (CAL-019). Der Tag ist dann der erste der Serie.
  const [vorbelegung] = useState(() => leseTerminVorbelegung(suche));

  const [werte, setWerte] = useState<EreignisFormValues>(() => ({
    ...leer,
    date:
      vorbelegung.datum ??
      (user.organizationTimeZone ? todayInTimeZone(user.organizationTimeZone) : ''),
    start_time: vorbelegung.beginn ?? '',
    end_time: vorbelegung.ende ?? '',
    // Die Person aus der angetippten Spalte, sonst die eigene: Wer im
    // Kalender von Anna eine Spanne aufzieht, meint Anna (CAL-019).
    staff_member_ids: vorbelegung.person
      ? [vorbelegung.person]
      : user.staffMemberId
        ? [user.staffMemberId]
        : [],
  }));
  // Der Stand, mit dem das Formular begann - Vorbelegung ist keine Eingabe.
  const [anfang, setAnfang] = useState(werte);
  const [rhythmus, setRhythmus] = useState<Rhythmus>('woechentlich');
  // Die Anzahl als eingegebener Text: Ein leeres Feld ist keine 0, und 40 wird
  // nicht still zu 30 (KAL-17) - die Prüfung beim Eintragen sagt es.
  const [anzahlText, setAnzahlText] = useState(ANZAHL_VORGABE);
  const [fehler, setFehler] = useState<Partial<Record<Feld | 'anzahl', string>>>({});

  const { freigeben, schutz } = useTextverlustschutz({
    ungespeichert:
      ereignisGeaendert(werte, anfang) ||
      rhythmus !== 'woechentlich' ||
      anzahlText !== ANZAHL_VORGABE,
    texte: FEHLZEITTEXTE,
  });

  const personen = useQuery({
    queryKey: ['staff-members'],
    queryFn: fetchStaffMembers,
    retry: false,
  });
  const standorte = useQuery({ queryKey: ['locations'], queryFn: fetchLocations, retry: false });

  // Bei genau einem verfügbaren Standort darf vorausgewählt werden - eine
  // Auswahl ohne Alternative ist keine Entscheidung (FIX-013). Auch das ist
  // Vorbelegung, keine Eingabe.
  useEffect(() => {
    const nurEiner = standorte.data?.length === 1 ? standorte.data[0] : undefined;
    if (nurEiner) {
      const vorwaehlen = (bisher: EreignisFormValues) =>
        bisher.location_id === '' ? { ...bisher, location_id: nurEiner.id } : bisher;
      setWerte(vorwaehlen);
      setAnfang(vorwaehlen);
    }
  }, [standorte.data]);

  const anzahl = Number(anzahlText);
  const anzahlGueltig =
    anzahlText.trim() !== '' &&
    Number.isInteger(anzahl) &&
    anzahl >= 1 &&
    anzahl <= SERIE_HOECHSTZAHL;
  const tage = anzahlGueltig
    ? serienTermine(werte.date, werte.start_time, rhythmus, anzahl).map((t) => t.datum)
    : [];

  const mutation = useMutation({
    mutationFn: (eingabe: { werte: EreignisFormValues; tage: string[]; bestaetigt: boolean }) =>
      createEventSeries(eingabe.werte, eingabe.tage, eingabe.bestaetigt),
    onSuccess: async () => {
      // Kalender und Tagesplan führen die Zeiträume sonst weiter als frei.
      await queryClient.invalidateQueries({ queryKey: ['appointments'] });
      await queryClient.invalidateQueries({ queryKey: ['day-plan'] });
      // Eingetragen: Der eigene Weg hinaus ist kein Verlust (ANN-046). Der
      // Kalender sagt, dass es geklappt hat (KAL-22).
      freigeben();
      void navigate(mitEingetragenerFehlzeit(zurueck, 'dauerfehlzeit'), { replace: true });
    },
  });

  function setzen<F extends Feld>(feld: F, wert: EreignisFormValues[F]) {
    setWerte((bisher) => ({ ...bisher, [feld]: wert }));
    if (fehler[feld]) setFehler((bisher) => ({ ...bisher, [feld]: undefined }));
    if (mutation.isError) mutation.reset();
  }

  function absenden(event: React.FormEvent) {
    event.preventDefault();
    if (mutation.isPending) return;

    const gesammelt: Partial<Record<Feld | 'anzahl', string>> = {};
    const ergebnis = ereignisFormSchema.safeParse(werte);
    if (!ergebnis.success) {
      for (const problem of ergebnis.error.issues) {
        const feld = problem.path[0] as Feld | undefined;
        if (feld && !gesammelt[feld]) gesammelt[feld] = problem.message;
      }
    }
    if (!anzahlGueltig) gesammelt.anzahl = `Bitte 1 bis ${SERIE_HOECHSTZAHL} angeben.`;
    if (!ergebnis.success || !anzahlGueltig) {
      setFehler(gesammelt);
      return;
    }

    setFehler({});
    mutation.mutate({ werte: ergebnis.data, tage, bestaetigt: false });
  }

  if (!canManageAppointments(user.roles)) {
    return (
      <ErrorState
        title="Nicht freigegeben"
        description={`Fehlzeiten eintragen dürfen alle vier Praxisrollen: ${roleLabels.owner}, ${roleLabels.therapist}, ${roleLabels.team_lead} und ${roleLabels.office}.`}
      />
    );
  }

  if (personen.isPending || standorte.isPending) {
    return <LoadingState label="Formular wird vorbereitet …" />;
  }

  const aktive = (personen.data ?? []).filter((p) => p.employment_status === 'active');
  const ausserhalb = mutation.isError && istAusserhalbArbeitszeit(mutation.error);
  // Ohne die Liste einer Pflichtangabe lässt sich nicht eintragen (ZST-07).
  const listeFehlt =
    personen.isError || (standorte.isError && werte.appointment_type === 'practice');

  return (
    <>
      <Rueckweg standard="/kalender" />

      <PageHeader
        title="Dauerfehlzeit eintragen"
        description={`Dieselbe Fehlzeit über mehrere Wochen – ${FEHLZEIT_BEISPIELE}. Ohne Patient:in und ohne Verordnung; es entsteht keine Behandlungsleistung.`}
      />

      <form onSubmit={absenden} noValidate className="max-w-xl">
        {/* Was noch fehlt - und wo (KAL-17). */}
        <Fehlerzusammenfassung
          fehler={alsFormularfehler(FEHLERFELDER, FEHLERBESCHRIFTUNGEN, fehler, (feld) =>
            feld === 'anzahl' ? ANZAHL_ID : EREIGNIS_FELD_IDS[feld],
          )}
        />

        <EreignisFormFields
          werte={werte}
          fehler={fehler}
          onChange={setzen}
          standorte={standorte.data ?? []}
          zeitzone={user.organizationTimeZone}
          rasterMinuten={user.appointmentGridMinutes}
          datumBeschriftung="Erste Fehlzeit am *"
          datumHinweis={
            istIsoDatum(werte.date) ? `Das ist ein ${wochentag(werte.date, 'long')}.` : undefined
          }
          standorteFehler={
            standorte.isError ? (
              <ErrorState
                title="Die Standorte konnten nicht geladen werden."
                description="Bitte die Verbindung prüfen und erneut versuchen."
                onErneut={() => standorte.refetch()}
              />
            ) : null
          }
          beteiligte={
            <fieldset aria-describedby={fehler.staff_member_ids ? BETEILIGTE_FEHLER_ID : undefined}>
              <legend className="text-ink text-sm font-medium">Beteiligte Personen *</legend>
              <p className="text-ink-muted mt-1 text-sm">
                Die Fehlzeit belegt den Zeitraum in jedem gewählten Kalender.
              </p>
              {personen.isError ? (
                <div className="mt-3">
                  <ErrorState
                    title="Die Personen konnten nicht geladen werden."
                    description="Bitte die Verbindung prüfen und erneut versuchen."
                    onErneut={() => personen.refetch()}
                  />
                </div>
              ) : (
                <div className="mt-3 flex flex-col gap-2">
                  {aktive.map((person, i) => (
                    <Checkbox
                      key={person.id}
                      // Das erste Kästchen ist das Sprungziel der Zusammenfassung.
                      feldId={i === 0 ? EREIGNIS_FELD_IDS.staff_member_ids : undefined}
                      label={`${person.given_name} ${person.family_name}`}
                      checked={werte.staff_member_ids.includes(person.id)}
                      onChange={(e) =>
                        setzen(
                          'staff_member_ids',
                          e.target.checked
                            ? [...werte.staff_member_ids, person.id]
                            : werte.staff_member_ids.filter((id) => id !== person.id),
                        )
                      }
                    />
                  ))}
                </div>
              )}
              {/* Der Fehler der Gruppe - mit Rolle, in Feldgröße und an der
                  Gruppe angebunden (KAL-17). */}
              {fehler.staff_member_ids ? (
                <p id={BETEILIGTE_FEHLER_ID} role="alert" className="text-danger mt-2 text-sm">
                  {fehler.staff_member_ids}
                </p>
              ) : null}
            </fieldset>
          }
        />

        {/* Ebene 2 unter dem Seitentitel - eine h3 direkt unter der h1
            übersprang eine Stufe (KAL-B02). */}
        <Section titel="Wiederholung">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:items-end">
            <Select
              label="Rhythmus *"
              value={rhythmus}
              onChange={(e) => setRhythmus(e.target.value as Rhythmus)}
            >
              {(Object.keys(rhythmen) as Rhythmus[]).map((key) => (
                <option key={key} value={key}>
                  {rhythmen[key].label}
                </option>
              ))}
            </Select>
            <Field
              label="Anzahl Fehlzeiten *"
              feldId={ANZAHL_ID}
              type="number"
              inputMode="numeric"
              min={1}
              max={SERIE_HOECHSTZAHL}
              value={anzahlText}
              error={fehler.anzahl}
              hint={`Höchstens ${SERIE_HOECHSTZAHL} je Vorgang.`}
              onChange={(e) => {
                setAnzahlText(e.target.value);
                if (fehler.anzahl) {
                  setFehler((bisher) => {
                    const naechste = { ...bisher };
                    delete naechste.anzahl;
                    return naechste;
                  });
                }
              }}
            />
          </div>

          {/* Die Tage stehen vor dem Eintragen da: Die Serie ist serverseitig
              alles oder nichts, und ohne diese Liste hieße ein Feiertag in
              Woche drei „Meldung lesen und raten" (wie bei CAL-007). Jeder Tag
              mit Wochentag (KAL-B03). */}
          {tage.length > 0 ? (
            <div className="mt-5">
              <p className="text-ink text-sm font-medium">
                {fehlzeitenWort(tage.length)}
                {werte.start_time && werte.end_time
                  ? `, jeweils ${wochentageDerSerie(tage)} ${werte.start_time}–${werte.end_time} Uhr`
                  : `, ${wochentageDerSerie(tage)}`}
              </p>
              <ul className="text-ink-muted mt-2 flex flex-col gap-1 text-sm">
                {tage.map((tag) => (
                  <li key={tag}>{tagMitWochentag(tag)}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </Section>

        {ausserhalb ? (
          <EreignisArbeitszeitRueckfrage
            beschriftung="Trotzdem eintragen"
            laeuft={mutation.isPending}
            onBestaetigen={() => {
              const ergebnis = ereignisFormSchema.safeParse(werte);
              if (!ergebnis.success) return;
              mutation.mutate({ werte: ergebnis.data, tage, bestaetigt: true });
            }}
            onAbbrechen={() => mutation.reset()}
          />
        ) : null}

        {mutation.isError && !ausserhalb ? (
          <Statusmeldung ton="fehler" className="mt-5">
            {mutation.error.message}
          </Statusmeldung>
        ) : null}

        {/* Die Rückfrage vor dem Weggehen steht dort, wo gearbeitet wird. */}
        {schutz}

        <div className="mt-8 flex flex-wrap gap-3">
          <Button type="submit" disabled={mutation.isPending || listeFehlt}>
            {mutation.isPending
              ? 'Wird eingetragen …'
              : tage.length > 0
                ? `${fehlzeitenWort(tage.length)} eintragen`
                : 'Fehlzeiten eintragen'}
          </Button>
          {/* Ein Seitenwechsel ist ein Link (UIK-13) - und läuft damit durch
              dieselbe Rückfrage wie jeder andere Weg hinaus. */}
          <ButtonLink to={zurueck} variant="secondary">
            Abbrechen
          </ButtonLink>
        </div>
      </form>
    </>
  );
}
