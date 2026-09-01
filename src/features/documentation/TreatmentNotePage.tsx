import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { TextArea } from '@/components/ui/TextArea';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { canWriteTreatmentNote, type CurrentUser } from '@/features/session/types';
import {
  fetchAppointment,
  formatLocalDate,
  formatLocalTimeRange,
  patientName,
  type Appointment,
} from '@/features/appointments/api';
import {
  createTreatmentNote,
  fetchTreatmentNote,
  inhaltFehler,
  updateTreatmentNote,
  type TreatmentNote,
} from './api';

/**
 * Entwurf der Behandlungsdokumentation schreiben (DOK-001).
 *
 * Eine Seite für beide Fälle - anlegen und ändern -, weil es fachlich derselbe
 * Vorgang ist: der Entwurf zu diesem Termin. Welche Serverfunktion greift,
 * entscheidet allein, ob es bereits einen gibt.
 *
 * Der Text wird ausschließlich auf dem Server gehalten. Es gibt bewusst kein
 * automatisches Zwischenspeichern im Browser: ein Entwurf, der nur lokal läge,
 * wäre nicht gespeichert, würde aber so aussehen (ADR-001, ADR-015).
 */
function Editor({ appointment, note }: { appointment: Appointment; note: TreatmentNote | null }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const zone = appointment.organization_time_zone;

  const gespeichert = note?.content ?? '';
  const [entwurf, setEntwurf] = useState<string | null>(null);
  const [abbruchfrage, setAbbruchfrage] = useState(false);
  const [fehler, setFehler] = useState<string | undefined>(undefined);

  const wert = entwurf ?? gespeichert;
  const geaendert = wert !== gespeichert;
  const zurueck = `/termine/${appointment.id}`;

  const speichern = useMutation({
    mutationFn: async () => {
      if (note) {
        // Der gelesene Stand geht unverändert zurück; der Server weist eine
        // Änderung auf veraltetem Stand ab (ADR-001).
        await updateTreatmentNote(note.id, note.updated_at, wert);
        return;
      }
      await createTreatmentNote(appointment.id, wert);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['treatment-note', appointment.id] });
      void navigate(zurueck);
    },
  });

  function absenden(event: React.FormEvent) {
    event.preventDefault();
    if (speichern.isPending) return;

    const meldung = inhaltFehler(wert);
    setFehler(meldung);
    if (meldung) return;

    speichern.mutate();
  }

  return (
    <>
      <PageHeader
        title="Behandlungsdokumentation"
        description={`${patientName(appointment)} · ${formatLocalDate(appointment.starts_at, zone)}, ${formatLocalTimeRange(appointment.starts_at, appointment.ends_at, zone)}`}
      />

      <form onSubmit={absenden} noValidate className="max-w-2xl">
        <TextArea
          label="Eintrag zur Behandlung"
          hint="Freitext. Der Eintrag bleibt ein Entwurf; die Finalisierung ist ein eigener, späterer Schritt."
          rows={14}
          value={wert}
          error={fehler}
          onChange={(event) => {
            setEntwurf(event.target.value);
            if (fehler) setFehler(undefined);
          }}
        />

        {speichern.isError ? (
          <div className="mt-4">
            <ErrorState title="Nicht gespeichert" description={speichern.error.message} />
          </div>
        ) : null}

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={speichern.isPending || !geaendert}>
            {speichern.isPending ? 'Wird gespeichert …' : 'Als Entwurf speichern'}
          </Button>

          {geaendert ? (
            <Button type="button" variant="quiet" onClick={() => setAbbruchfrage(true)}>
              Abbrechen
            </Button>
          ) : (
            <Link
              to={zurueck}
              className="text-ink-muted hover:bg-surface-sunken hover:text-ink inline-flex min-h-11 items-center justify-center rounded-lg px-4 text-[0.9375rem] font-medium transition-colors"
            >
              Abbrechen
            </Link>
          )}
        </div>

        {/* Ein versehentlicher Klick darf einen ungespeicherten Text nicht
            verwerfen (PROJECT_PRINCIPLES.md 13). */}
        {abbruchfrage ? (
          <div
            role="group"
            aria-label="Bearbeitung abbrechen"
            className="border-line-strong bg-surface-sunken mt-4 rounded-lg border p-4"
          >
            <p className="text-ink text-sm">
              Der eingegebene Text ist noch nicht gespeichert und geht beim Abbrechen verloren.
            </p>
            <div className="mt-3 flex flex-wrap gap-3">
              <Button type="button" variant="secondary" onClick={() => void navigate(zurueck)}>
                Ja, Bearbeitung verwerfen
              </Button>
              <Button type="button" variant="quiet" onClick={() => setAbbruchfrage(false)}>
                Weiter bearbeiten
              </Button>
            </div>
          </div>
        ) : null}
      </form>

      <p className="text-ink-subtle mt-10 max-w-prose text-xs leading-relaxed">
        Der Entwurf wird auf dem Server gespeichert, nicht auf diesem Gerät. Anlegen, Ändern und
        Lesen werden protokolliert.
      </p>
    </>
  );
}

export function TreatmentNotePage({ user }: { user: CurrentUser }) {
  const { appointmentId } = useParams<{ appointmentId: string }>();
  const darfSchreiben = canWriteTreatmentNote(user.roles);

  // Beide Abfragen haengen an der Schreibberechtigung: wer hier nicht
  // schreiben darf, hat auf dieser Seite nichts zu suchen - und loest dann
  // auch keinen protokollierten Lesezugriff aus (ADR-010).
  const termin = useQuery({
    queryKey: ['appointment', appointmentId],
    queryFn: () => fetchAppointment(appointmentId!),
    enabled: Boolean(appointmentId) && darfSchreiben,
    retry: false,
  });

  const doku = useQuery({
    queryKey: ['treatment-note', appointmentId],
    queryFn: () => fetchTreatmentNote(appointmentId!),
    enabled: Boolean(appointmentId) && darfSchreiben,
    retry: false,
  });

  return (
    <>
      <Link
        to={appointmentId ? `/termine/${appointmentId}` : '/kalender'}
        className="text-ink-muted hover:text-ink mb-4 inline-flex min-h-11 items-center text-sm"
      >
        ← Zurück zum Termin
      </Link>

      {/* Reine Darstellung. Verbindlich prüfen create_treatment_note und
          update_treatment_note die Rolle selbst (ADR-004). */}
      {!darfSchreiben ? (
        <ErrorState
          title="Nicht freigegeben"
          description="Behandlungsdokumentation schreiben dürfen ausschließlich therapeutische Rollen."
        />
      ) : null}

      {darfSchreiben && (termin.isPending || doku.isPending) ? (
        <LoadingState label="Termin wird geladen …" />
      ) : null}

      {darfSchreiben && (termin.isError || doku.isError) ? (
        <ErrorState title="Die Behandlungsdokumentation konnte nicht geladen werden." />
      ) : null}

      {darfSchreiben && termin.data === null ? (
        <ErrorState
          title="Nicht gefunden"
          description="Dieser Termin existiert nicht oder ist für Ihren Zugang nicht freigegeben."
        />
      ) : null}

      {darfSchreiben && termin.data && termin.data.status === 'cancelled' && !doku.data ? (
        <ErrorState
          title="Termin abgesagt"
          description="Zu einem abgesagten Termin entsteht keine Behandlungsdokumentation."
        />
      ) : null}

      {darfSchreiben &&
      termin.data &&
      !(termin.data.status === 'cancelled' && !doku.data) &&
      doku.data !== undefined ? (
        <Editor appointment={termin.data} note={doku.data} />
      ) : null}
    </>
  );
}
