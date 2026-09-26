import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { canManageAppointments, type CurrentUser } from '@/features/session/types';
import { EreignisArbeitszeitRueckfrage, EreignisFormFields } from './EreignisFormFields';
import { fetchStaffMembers } from '@/features/staff/api';
import { leseRueckweg } from '@/lib/rueckweg';
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
  const [fehler, setFehler] = useState<Partial<Record<Feld, string>>>({});

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
  // (FIX-013).
  useEffect(() => {
    const nurEiner = standorte.data?.length === 1 ? standorte.data[0] : undefined;
    if (nurEiner) {
      setWerte((bisher) =>
        bisher.location_id === '' ? { ...bisher, location_id: nurEiner.id } : bisher,
      );
    }
  }, [standorte.data]);

  const mutation = useMutation({
    mutationFn: (eingabe: { werte: EreignisFormValues; bestaetigt: boolean }) =>
      createAppointmentEvent(eingabe.werte, eingabe.bestaetigt),
    onSuccess: async () => {
      // Kalender und Tagesplan führen den Zeitraum sonst weiter als frei.
      await queryClient.invalidateQueries({ queryKey: ['appointments'] });
      await queryClient.invalidateQueries({ queryKey: ['day-plan'] });
      void navigate(zurueck, { replace: true });
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
        description="Termine und Fehlzeiten eintragen dürfen die Rollen der Terminverwaltung."
      />
    );
  }

  if (personen.isPending || standorte.isPending) {
    return <LoadingState label="Formular wird vorbereitet …" />;
  }

  const aktive = (personen.data ?? []).filter((p) => p.employment_status === 'active');
  const ausserhalb = mutation.isError && istAusserhalbArbeitszeit(mutation.error);

  return (
    <>
      <Rueckweg standard="/kalender" />

      <PageHeader
        title="Fehlzeit eintragen"
        description="Besprechung, Teamtermin oder anderes. Ohne Patient:in und ohne Verordnung – es entsteht keine Behandlungsleistung."
      />

      <form onSubmit={absenden} noValidate className="max-w-xl">
        <EreignisFormFields
          werte={werte}
          fehler={fehler}
          onChange={setzen}
          standorte={standorte.data ?? []}
          zeitzone={user.organizationTimeZone}
          rasterMinuten={user.appointmentGridMinutes}
          beteiligte={
            <fieldset>
              <legend className="text-ink text-sm font-medium">Beteiligte Personen *</legend>
              <p className="text-ink-muted mt-1 text-sm">
                Die Fehlzeit belegt den Zeitraum in jedem gewählten Kalender.
              </p>
              <div className="mt-3 flex flex-col gap-2">
                {aktive.map((person) => (
                  <Checkbox
                    key={person.id}
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
              {fehler.staff_member_ids ? (
                <p className="text-danger mt-2 text-xs">{fehler.staff_member_ids}</p>
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

        <div className="mt-8 flex flex-wrap gap-3">
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? 'Wird eingetragen …' : 'Fehlzeit eintragen'}
          </Button>
          <Button type="button" variant="secondary" onClick={() => void navigate(zurueck)}>
            Abbrechen
          </Button>
        </div>
      </form>
    </>
  );
}
