import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Checkbox } from '@/components/ui/Checkbox';
import { Fehlerzusammenfassung } from '@/components/ui/Fehlerzusammenfassung';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { roleLabels } from '@/components/ui/roleLabels';
import {
  EINGABETEXTE,
  useTextverlustschutz,
  type Verlustschutztexte,
} from '@/features/documentation/Textverlustschutz';
import { canManageAppointments, type CurrentUser } from '@/features/session/types';
import { EreignisArbeitszeitRueckfrage, EreignisFormFields } from './EreignisFormFields';
import { fetchStaffMembers } from '@/features/staff/api';
import { alsFormularfehler } from '@/lib/formularfehler';
import { leseRueckweg } from '@/lib/rueckweg';
import {
  EREIGNIS_BESCHRIFTUNGEN,
  EREIGNIS_FEHLERFELDER,
  EREIGNIS_FELD_IDS,
  ereignisGeaendert,
  FEHLZEIT_BEISPIELE,
  mitEingetragenerFehlzeit,
} from './calendar';
import {
  createAppointmentEvent,
  ereignisFormSchema,
  fetchLocations,
  istAusserhalbArbeitszeit,
  leseTerminVorbelegung,
  todayInTimeZone,
  type EreignisFormValues,
} from './api';

/**
 * Eine Fehlzeit des Praxisbetriebs eintragen (CAL-015b, CAL-015c).
 *
 * Besprechung, Teamtermin, alles, was Zeit im Kalender belegt und **keine
 * Behandlung** ist. `PROJECT_PRINCIPLES.md` 0.9 §8.1: weder Patient:in noch
 * Verordnung, Beginn und Ende frei im Praxisraster, keine abrechenbare
 * Leistung.
 *
 * Bewusst ein eigenes Formular neben der Terminanlage. Die beiden Vorgänge
 * fragen Verschiedenes: Der eine eine Patient:in und eine feste Länge, der
 * andere eine Bezeichnung und einen Kreis von Beteiligten. Ein gemeinsames
 * Formular mit der Hälfte ausgeblendeter Felder wäre für beide schlechter.
 *
 * **Mehrere Beteiligte, ein Vorgang:** Der Server legt je Person einen Termin
 * an — alles oder nichts. Eine Besprechung, die nur in einem Kalender steht,
 * sagt den übrigen nicht, dass ihre Zeit belegt ist.
 *
 * **Eingaben gehen nicht still verloren (KAL-20, NAV-01).** Weicht das
 * Formular von der Vorbelegung ab, fragt jeder Weg hinaus - Rückweg,
 * „Abbrechen", Tableiste, Abmelden - erst nach; Neuladen warnt der Browser.
 * Einen Entwurf gibt es nicht, also nur „Verwerfen und weitergehen" oder
 * „Hier bleiben" (ANN-046).
 */
type Feld = keyof EreignisFormValues;

const leer: EreignisFormValues = {
  title: '',
  staff_member_ids: [],
  appointment_type: 'practice',
  date: '',
  start_time: '',
  end_time: '',
  location_id: '',
};

/** Die Sätze des Verlustschutzes für dieses Formular. */
const FEHLZEITTEXTE: Verlustschutztexte = {
  ...EINGABETEXTE,
  bezeichnung: 'Ungespeicherte Fehlzeit',
};

/** Kennung des Fehlers der Beteiligten, für `aria-describedby` (KAL-17). */
const BETEILIGTE_FEHLER_ID = `${EREIGNIS_FELD_IDS.staff_member_ids}-fehler`;

export function NewEventPage({ user }: { user: CurrentUser }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [suche] = useSearchParams();
  const zurueck = leseRueckweg(suche, '/kalender');

  // Zeit und Tag kommen aus der angetippten Stelle im Kalender, wenn der Weg
  // von dort kam (UX-005). Die Länge nicht: Ein Ereignis hat keine.
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
  const [fehler, setFehler] = useState<Partial<Record<Feld, string>>>({});

  const { freigeben, schutz } = useTextverlustschutz({
    ungespeichert: ereignisGeaendert(werte, anfang),
    texte: FEHLZEITTEXTE,
  });

  const personen = useQuery({
    queryKey: ['staff-members'],
    queryFn: fetchStaffMembers,
    retry: false,
  });
  const standorte = useQuery({ queryKey: ['locations'], queryFn: fetchLocations, retry: false });

  // Bei genau einem verfügbaren Standort darf vorausgewählt werden - eine
  // Auswahl ohne Alternative ist keine Entscheidung. Dieselbe Regel und
  // dieselbe Begründung wie in `NewAppointmentPage`; hier fehlte sie, und das
  // Formular verlangte ein Pflichtfeld, für das es nur eine Antwort gab
  // (FIX-013). Auch das ist Vorbelegung, keine Eingabe.
  useEffect(() => {
    const nurEiner = standorte.data?.length === 1 ? standorte.data[0] : undefined;
    if (nurEiner) {
      const vorwaehlen = (bisher: EreignisFormValues) =>
        bisher.location_id === '' ? { ...bisher, location_id: nurEiner.id } : bisher;
      setWerte(vorwaehlen);
      setAnfang(vorwaehlen);
    }
  }, [standorte.data]);

  const mutation = useMutation({
    mutationFn: (eingabe: { werte: EreignisFormValues; bestaetigt: boolean }) =>
      createAppointmentEvent(eingabe.werte, eingabe.bestaetigt),
    onSuccess: async () => {
      // Kalender und Tagesplan führen den Zeitraum sonst weiter als frei.
      await queryClient.invalidateQueries({ queryKey: ['appointments'] });
      await queryClient.invalidateQueries({ queryKey: ['day-plan'] });
      // Eingetragen: Der eigene Weg hinaus ist kein Verlust (ANN-046). Der
      // Kalender sagt, dass es geklappt hat (KAL-22).
      freigeben();
      void navigate(mitEingetragenerFehlzeit(zurueck, 'fehlzeit'), { replace: true });
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

    const ergebnis = ereignisFormSchema.safeParse(werte);
    if (!ergebnis.success) {
      const gesammelt: Partial<Record<Feld, string>> = {};
      for (const problem of ergebnis.error.issues) {
        const feld = problem.path[0] as Feld | undefined;
        if (feld && !gesammelt[feld]) gesammelt[feld] = problem.message;
      }
      setFehler(gesammelt);
      return;
    }

    setFehler({});
    mutation.mutate({ werte: ergebnis.data, bestaetigt: false });
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
  // Ohne die Liste einer Pflichtangabe lässt sich nicht eintragen (ZST-07):
  // Das Formular sagt es am Feld, statt still leer zu bleiben.
  const listeFehlt =
    personen.isError || (standorte.isError && werte.appointment_type === 'practice');

  return (
    <>
      <Rueckweg standard="/kalender" />

      {/* Ohne den Satz zu Patient:in und Verordnung: Er erklärte, was eine
          Fehlzeit nicht ist (UX-005g). */}
      <PageHeader title="Fehlzeit eintragen" description={`${FEHLZEIT_BEISPIELE} oder anderes.`} />

      <form onSubmit={absenden} noValidate className="max-w-xl">
        {/* Was noch fehlt - und wo (KAL-17): Auf dem Telefon steht der
            Absendeknopf einen Bildschirm unter der Bezeichnung. */}
        <Fehlerzusammenfassung
          fehler={alsFormularfehler(
            EREIGNIS_FEHLERFELDER,
            EREIGNIS_BESCHRIFTUNGEN,
            fehler,
            (feld) => EREIGNIS_FELD_IDS[feld],
          )}
        />

        <EreignisFormFields
          werte={werte}
          fehler={fehler}
          onChange={setzen}
          standorte={standorte.data ?? []}
          zeitzone={user.organizationTimeZone}
          rasterMinuten={user.appointmentGridMinutes}
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
              {/* Kein Satz zum Belegen der Kalender: Er erklärte das System (UX-005g). */}
              <legend className="text-ink text-sm font-medium">Beteiligte Personen *</legend>
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

        {ausserhalb ? (
          <EreignisArbeitszeitRueckfrage
            beschriftung="Trotzdem eintragen"
            laeuft={mutation.isPending}
            onBestaetigen={() => {
              const ergebnis = ereignisFormSchema.safeParse(werte);
              if (!ergebnis.success) return;
              mutation.mutate({ werte: ergebnis.data, bestaetigt: true });
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
            {mutation.isPending ? 'Wird eingetragen …' : 'Fehlzeit eintragen'}
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
