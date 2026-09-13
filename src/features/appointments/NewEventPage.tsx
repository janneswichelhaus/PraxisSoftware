import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { Field } from '@/components/ui/Field';
import { Select } from '@/components/ui/Select';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { canManageAppointments, type CurrentUser } from '@/features/session/types';
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
 * Ein Ereignis des Praxisbetriebs eintragen (CAL-015b, CAL-015c).
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
    // Die eigene Person ist fast immer dabei.
    staff_member_ids: user.staffMemberId ? [user.staffMemberId] : [],
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
        description="Termine und Ereignisse eintragen dürfen die Rollen der Terminverwaltung."
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
        title="Ereignis eintragen"
        description="Besprechung, Teamtermin oder anderes. Ohne Patient:in und ohne Verordnung – es entsteht keine Behandlungsleistung."
      />

      <form onSubmit={absenden} noValidate className="max-w-xl">
        <div className="flex flex-col gap-5">
          <Field
            label="Bezeichnung *"
            value={werte.title}
            error={fehler.title}
            maxLength={120}
            hint="Steht so im Kalender. Keine Angaben über Patient:innen."
            onChange={(e) => setzen('title', e.target.value)}
          />

          <fieldset>
            <legend className="text-ink text-sm font-medium">Beteiligte Personen *</legend>
            <p className="text-ink-muted mt-1 text-sm">
              Das Ereignis belegt den Zeitraum in jedem gewählten Kalender.
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

          <Select
            label="Ort *"
            value={werte.appointment_type}
            onChange={(e) =>
              setzen('appointment_type', e.target.value === 'video' ? 'video' : 'practice')
            }
          >
            <option value="practice">In der Praxis</option>
            <option value="video">Video</option>
          </Select>

          {werte.appointment_type === 'practice' ? (
            <Select
              label="Standort *"
              value={werte.location_id}
              error={fehler.location_id}
              onChange={(e) => setzen('location_id', e.target.value)}
            >
              <option value="">Bitte wählen …</option>
              {(standorte.data ?? []).map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </Select>
          ) : null}

          <Field
            label="Datum *"
            type="date"
            value={werte.date}
            error={fehler.date}
            min={user.organizationTimeZone ? todayInTimeZone(user.organizationTimeZone) : undefined}
            onChange={(e) => setzen('date', e.target.value)}
          />

          {/* Beide Enden im Raster: Anders als beim Behandlungstermin ist die
              Länge hier frei (§8.1) - gebunden bleibt sie ans Praxisraster,
              und das prüft der Server an beiden Enden. */}
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Field
              label="Beginn *"
              type="time"
              value={werte.start_time}
              error={fehler.start_time}
              step={user.appointmentGridMinutes ? user.appointmentGridMinutes * 60 : undefined}
              hint={
                user.appointmentGridMinutes
                  ? `Praxisraster: ${user.appointmentGridMinutes} Minuten`
                  : undefined
              }
              onChange={(e) => setzen('start_time', e.target.value)}
            />
            <Field
              label="Ende *"
              type="time"
              value={werte.end_time}
              error={fehler.end_time}
              step={user.appointmentGridMinutes ? user.appointmentGridMinutes * 60 : undefined}
              hint="Frei wählbar, im Praxisraster."
              onChange={(e) => setzen('end_time', e.target.value)}
            />
          </div>
        </div>

        {/* Dieselbe Rückfrage wie beim Termin (CAL-005): außerhalb der
            Arbeitszeit ist eine Warnung, keine Grenze. */}
        {ausserhalb ? (
          <div
            role="group"
            aria-label="Außerhalb der Arbeitszeit"
            className="border-line-strong bg-surface-sunken rounded-card mt-5 border p-4"
          >
            <p className="text-ink text-sm">
              Mindestens eine beteiligte Person hat zu dieser Zeit keine hinterlegte Arbeitszeit. Es
              wurde noch nichts eingetragen.
            </p>
            <div className="mt-3 flex flex-wrap gap-3">
              <Button
                type="button"
                disabled={mutation.isPending}
                onClick={() => {
                  const ergebnis = ereignisFormSchema.safeParse(werte);
                  if (!ergebnis.success) return;
                  mutation.mutate({ werte: ergebnis.data, bestaetigt: true });
                }}
              >
                Trotzdem eintragen
              </Button>
              <Button type="button" variant="quiet" onClick={() => mutation.reset()}>
                Abbrechen
              </Button>
            </div>
          </div>
        ) : null}

        {mutation.isError && !ausserhalb ? (
          <Statusmeldung ton="fehler" className="mt-5">
            {mutation.error.message}
          </Statusmeldung>
        ) : null}

        <div className="mt-8 flex flex-wrap gap-3">
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? 'Wird eingetragen …' : 'Ereignis eintragen'}
          </Button>
          <Button type="button" variant="secondary" onClick={() => void navigate(zurueck)}>
            Abbrechen
          </Button>
        </div>
      </form>
    </>
  );
}
