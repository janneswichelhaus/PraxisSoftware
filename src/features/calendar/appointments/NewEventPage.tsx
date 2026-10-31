import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Checkbox } from '@/components/ui/Checkbox';
import { Fehlerzusammenfassung } from '@/components/ui/Fehlerzusammenfassung';
import { Formularfuss } from '@/components/ui/Formularfuss';
import { VERBINDUNG_PRUEFEN } from '@/components/ui/abfrageTexte';
import { Field } from '@/components/ui/Field';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { Section } from '@/components/ui/Section';
import { Select } from '@/components/ui/Select';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { roleLabels } from '@/components/ui/roleLabels';
import { EINGABETEXTE, useTextverlustschutz } from '@/app/Textverlustschutz';
import { canManageAppointments, type CurrentUser } from '@/features/core';
import { EreignisArbeitszeitRueckfrage, EreignisFormFields } from './EreignisFormFields';
import { fetchStaffMembers, fetchLocations } from '@/features/workforce';
import { formatDate, istIsoDatum, todayInTimeZone } from '@/lib/datum';
import { alsFormularfehler } from '@/lib/formularfehler';
import { leseRueckweg } from '@/lib/rueckweg';
import { leseTerminVorbelegung } from '@/lib/termin';
import {
  EREIGNIS_BESCHRIFTUNGEN,
  EREIGNIS_FEHLERFELDER,
  EREIGNIS_FELD_IDS,
  ereignisGeaendert,
  FEHLZEIT_BEISPIELE,
  mitEingetragenerFehlzeit,
  type EreignisFehlerfeld,
} from './calendar';
import {
  createAppointmentEvent,
  createEventSeries,
  ereignisFormSchema,
  istAusserhalbArbeitszeit,
  type EreignisFormValues,
} from './api';
import { SERIE_HOECHSTZAHL, rhythmen, serienTermine, type Rhythmus } from './serie';

type Feld = keyof EreignisFormValues;
type Fehlerfeld = EreignisFehlerfeld | 'anzahl';

/** Ein Zweck aus einem Hinweis wird zur Bezeichnung; in der Adresse steht nur der Schlüssel (ADR-011). */
const ZWECKE: Readonly<Record<string, string>> = { checkup: 'Fahrrad-Check-Up' };

function titelZumZweck(zweck: string | null): string {
  return zweck && Object.hasOwn(ZWECKE, zweck) ? (ZWECKE[zweck] ?? '') : '';
}

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

const ANZAHL_ID = 'fehlzeit-anzahl';
const BETEILIGTE_FEHLER_ID = `${EREIGNIS_FELD_IDS.staff_member_ids}-fehler`;

const FEHLERFELDER: readonly Fehlerfeld[] = [...EREIGNIS_FEHLERFELDER, 'anzahl'];
const BESCHRIFTUNGEN: Readonly<Record<Fehlerfeld, string>> = {
  ...EREIGNIS_BESCHRIFTUNGEN,
  anzahl: 'Anzahl Fehlzeiten',
};
/** Bei einer Serie ist der Tag ihr erster; sonst behauptete das Formular einen einzelnen Termin. */
const SERIE_BESCHRIFTUNGEN = { ...BESCHRIFTUNGEN, date: 'Erste Fehlzeit am' };

/** „1 Fehlzeit“ gegen „6 Fehlzeiten“ - an einer Stelle statt in jeder Meldung. */
function fehlzeitenWort(anzahl: number): string {
  return anzahl === 1 ? '1 Fehlzeit' : `${anzahl} Fehlzeiten`;
}

/** Wochentag eines Kalendertags, ohne Zeitzonenrechnung. */
function wochentag(tag: string, form: 'short' | 'long'): string {
  return new Intl.DateTimeFormat('de-DE', { weekday: form, timeZone: 'UTC' }).format(
    new Date(`${tag}T00:00:00Z`),
  );
}

/** „So, 27.09.2026“: Ohne Wochentag fiele ein falscher Tag der Serie nicht auf. */
function tagMitWochentag(tag: string): string {
  return `${wochentag(tag, 'short')}, ${formatDate(tag)}`;
}

const WOCHENTAGE_ADVERB = [
  'sonntags',
  'montags',
  'dienstags',
  'mittwochs',
  'donnerstags',
  'freitags',
  'samstags',
] as const;

/** Die Wochentage einer Serie für die Zeile über der Liste: „mittwochs“. */
function wochentageDerSerie(tage: readonly string[]): string {
  const namen = [
    ...new Set(tage.map((tag) => WOCHENTAGE_ADVERB[new Date(`${tag}T00:00:00Z`).getUTCDay()]!)),
  ];
  return namen.length <= 1
    ? namen.join('')
    : `${namen.slice(0, -1).join(', ')} und ${namen.at(-1)!}`;
}

/**
 * Eine Fehlzeit des Praxisbetriebs eintragen, mit `serie` über mehrere Wochen: keine Behandlung,
 * keine Leistung (§8.1). Der Server legt je beteiligter Person einen Termin an, alles oder nichts.
 */
export function NewEventPage({ user, serie = false }: { user: CurrentUser; serie?: boolean }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [suche] = useSearchParams();
  const zurueck = leseRueckweg(suche, '/kalender');

  // Tag und Zeiten aus der Stelle im Kalender; bei einer Serie ist der Tag ihr erster.
  const [vorbelegung] = useState(() => leseTerminVorbelegung(suche));
  const [werte, setWerte] = useState<EreignisFormValues>(() => ({
    ...leer,
    title: serie ? '' : titelZumZweck(suche.get('zweck')),
    date:
      vorbelegung.datum ??
      (user.organizationTimeZone ? todayInTimeZone(user.organizationTimeZone) : ''),
    start_time: vorbelegung.beginn ?? '',
    end_time: vorbelegung.ende ?? '',
    // Wer im Kalender von Anna eine Spanne aufzieht, meint Anna; sonst die eigene Person.
    staff_member_ids: vorbelegung.person
      ? [vorbelegung.person]
      : user.staffMemberId
        ? [user.staffMemberId]
        : [],
  }));
  // Der Stand, mit dem das Formular begann - Vorbelegung ist keine Eingabe.
  const [anfang, setAnfang] = useState(werte);
  const [rhythmus, setRhythmus] = useState<Rhythmus>('woechentlich');
  // Als Text: Ein leeres Feld ist keine 0, und 40 wird nicht still zu 30.
  const [anzahlText, setAnzahlText] = useState(ANZAHL_VORGABE);
  const [fehler, setFehler] = useState<Partial<Record<Feld | 'anzahl', string>>>({});

  // Ohne Entwurf: Die Rückfrage bietet nur Verwerfen und Bleiben an (ANN-046).
  const { freigeben, schutz } = useTextverlustschutz({
    ungespeichert:
      ereignisGeaendert(werte, anfang) ||
      rhythmus !== 'woechentlich' ||
      anzahlText !== ANZAHL_VORGABE,
    texte: {
      ...EINGABETEXTE,
      bezeichnung: serie ? 'Ungespeicherte Dauerfehlzeit' : 'Ungespeicherte Fehlzeit',
    },
  });

  const personen = useQuery({
    queryKey: ['staff-members'],
    queryFn: fetchStaffMembers,
    retry: false,
  });
  const standorte = useQuery({ queryKey: ['locations'], queryFn: fetchLocations, retry: false });

  // Eine Auswahl ohne Alternative ist keine Entscheidung; auch das ist Vorbelegung.
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
  const tage =
    serie && anzahlGueltig
      ? serienTermine(werte.date, werte.start_time, rhythmus, anzahl).map((t) => t.datum)
      : [];

  const mutation = useMutation({
    mutationFn: async (eingabe: {
      werte: EreignisFormValues;
      tage: string[];
      bestaetigt: boolean;
    }) => {
      await (serie
        ? createEventSeries(eingabe.werte, eingabe.tage, eingabe.bestaetigt)
        : createAppointmentEvent(eingabe.werte, eingabe.bestaetigt));
    },
    onSuccess: async () => {
      // Kalender und Tagesplan führen den Zeitraum sonst weiter als frei.
      await queryClient.invalidateQueries({ queryKey: ['appointments'] });
      await queryClient.invalidateQueries({ queryKey: ['day-plan'] });
      // Eingetragen: Der eigene Weg hinaus ist kein Verlust; der Kalender meldet den Erfolg.
      freigeben();
      void navigate(mitEingetragenerFehlzeit(zurueck, serie ? 'dauerfehlzeit' : 'fehlzeit'), {
        replace: true,
      });
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
    if (serie && !anzahlGueltig) gesammelt.anzahl = `Bitte 1 bis ${SERIE_HOECHSTZAHL} angeben.`;
    if (!ergebnis.success || gesammelt.anzahl) {
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
  // Ohne die Liste einer Pflichtangabe lässt sich nicht eintragen; das Feld sagt es.
  const listeFehlt =
    personen.isError || (standorte.isError && werte.appointment_type === 'practice');

  return (
    <>
      <Rueckweg standard="/kalender" />

      {/* Beschreibungen enden mit Punkt, nur Namen und Daten nicht. */}
      <PageHeader
        title={serie ? 'Dauerfehlzeit eintragen' : 'Fehlzeit eintragen'}
        description={
          serie
            ? `Über mehrere Wochen: ${FEHLZEIT_BEISPIELE}.`
            : `${FEHLZEIT_BEISPIELE} oder anderes.`
        }
      />

      <form onSubmit={absenden} noValidate className="max-w-formular">
        {/* Was noch fehlt - und wo: Auf dem Telefon steht der Knopf einen Bildschirm tiefer. */}
        <Fehlerzusammenfassung
          fehler={alsFormularfehler(
            FEHLERFELDER,
            serie ? SERIE_BESCHRIFTUNGEN : BESCHRIFTUNGEN,
            fehler,
            (feld) => (feld === 'anzahl' ? ANZAHL_ID : EREIGNIS_FELD_IDS[feld]),
          )}
        />

        <EreignisFormFields
          werte={werte}
          fehler={fehler}
          onChange={setzen}
          standorte={standorte.data ?? []}
          zeitzone={user.organizationTimeZone}
          rasterMinuten={user.appointmentGridMinutes}
          datumBeschriftung={`${serie ? SERIE_BESCHRIFTUNGEN.date : BESCHRIFTUNGEN.date} *`}
          datumHinweis={
            serie && istIsoDatum(werte.date)
              ? `Das ist ein ${wochentag(werte.date, 'long')}.`
              : undefined
          }
          standorteFehler={
            standorte.isError ? (
              <ErrorState
                title="Die Standorte konnten nicht geladen werden."
                description={VERBINDUNG_PRUEFEN}
                onErneut={() => standorte.refetch()}
              />
            ) : null
          }
          beteiligte={
            <fieldset aria-describedby={fehler.staff_member_ids ? BETEILIGTE_FEHLER_ID : undefined}>
              <legend className="text-ink text-sm font-medium">Beteiligte Personen *</legend>
              {personen.isError ? (
                <div className="mt-3">
                  <ErrorState
                    title="Die Personen konnten nicht geladen werden."
                    description={VERBINDUNG_PRUEFEN}
                    onErneut={() => personen.refetch()}
                  />
                </div>
              ) : (
                // Ab 640 px zwei Spalten: Die Namen sind kurz, die Liste wird halb so lang.
                <div className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
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
              {/* Der Fehler der Gruppe - mit Rolle, in Feldgröße und an der Gruppe angebunden. */}
              {fehler.staff_member_ids ? (
                <p id={BETEILIGTE_FEHLER_ID} role="alert" className="text-danger mt-2 text-sm">
                  {fehler.staff_member_ids}
                </p>
              ) : null}
            </fieldset>
          }
        />

        {serie ? (
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
                    setFehler(({ anzahl: _entfaellt, ...rest }) => rest);
                  }
                }}
              />
            </div>

            {/* Die Tage stehen vor dem Eintragen da: Die Serie gilt ganz oder gar nicht. */}
            {tage.length > 0 ? (
              <div className="mt-6">
                <p className="text-ink text-sm font-medium">
                  {fehlzeitenWort(tage.length)}
                  {werte.start_time && werte.end_time
                    ? `, jeweils ${wochentageDerSerie(tage)} ${werte.start_time}–${werte.end_time} Uhr`
                    : `, ${wochentageDerSerie(tage)}`}
                </p>
                {/* Im Fluss statt untereinander: Dreißig Tage stehen am Telefon in zwölf Zeilen. */}
                <ul className="text-ink-muted mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm tabular-nums">
                  {tage.map((tag) => (
                    <li key={tag}>{tagMitWochentag(tag)}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </Section>
        ) : null}

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
          <Statusmeldung ton="fehler" className="mt-6">
            {mutation.error.message}
          </Statusmeldung>
        ) : null}

        {/* Die Rückfrage vor dem Weggehen steht dort, wo gearbeitet wird. */}
        {schutz}

        {/* Am Telefon untereinander in voller Breite; Abbrechen ist ein Link durch dieselbe Rückfrage. */}
        <Formularfuss>
          <Button type="submit" disabled={mutation.isPending || listeFehlt}>
            {mutation.isPending
              ? 'Wird eingetragen …'
              : !serie
                ? 'Fehlzeit eintragen'
                : tage.length > 0
                  ? `${fehlzeitenWort(tage.length)} eintragen`
                  : 'Fehlzeiten eintragen'}
          </Button>
          <ButtonLink to={zurueck} variant="quiet">
            Abbrechen
          </ButtonLink>
        </Formularfuss>
      </form>
    </>
  );
}
