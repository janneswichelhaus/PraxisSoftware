import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { TextArea } from '@/components/ui/TextArea';
import { ErrorState } from '@/components/ui/Feedback';
import { canWriteTreatmentNote, type CurrentUser } from '@/features/session/types';
import {
  formatLocalDate,
  formatLocalTimeRange,
  patientName,
  type Appointment,
} from '@/features/appointments/api';
import { DocumentationShell } from './DocumentationShell';
import { useTextverlustschutz } from './Textverlustschutz';
import { TextbausteinLeiste } from './TextbausteinLeiste';
import { bausteinEinfuegen } from './textbausteine';
import {
  completeTreatment,
  createTreatmentNote,
  inhaltFehler,
  updateTreatmentNote,
  type TreatmentNote,
} from './api';

/**
 * Behandlung abschließen in einem Schritt (UX-007).
 *
 * Am Ende eines Hausbesuchs standen bisher sechs Schritte über drei Ansichten:
 * Termin abschließen, Dokumentation anlegen, Text schreiben, Entwurf speichern,
 * zurück zum Termin, finalisieren, Rückfrage bestätigen. Auf dem Telefon, im
 * Hausflur, mit einer Hand.
 *
 * Hier ist es eine Seite: Text schreiben, abschließen. Serverseitig laufen
 * dieselben drei Vorgänge in **einer** Transaktion (`complete_treatment`).
 *
 * ADR-016 Punkt 4 verlangt, dass die Finalisierung ein **ausdrücklicher**
 * Schritt bleibt. Sie ist es: Die Schaltfläche heißt nach dem, was sie tut,
 * und ihre Folge steht unmittelbar darüber - nicht in einer zweiten Rückfrage,
 * die erst nach dem Klick erscheint. Wer nur speichern will, hat daneben den
 * Weg „Nur als Entwurf speichern".
 */

function Abschluss({
  appointment,
  note,
}: {
  appointment: Appointment;
  note: TreatmentNote | null;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const zone = appointment.organization_time_zone;
  const zurueck = `/termine/${appointment.id}`;

  const gespeichert = note?.content ?? '';
  const [entwurf, setEntwurf] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | undefined>(undefined);

  const wert = entwurf ?? gespeichert;
  const geaendert = wert !== gespeichert;

  /**
   * Nur den Entwurf sichern - ohne Abschluss und ohne Seitenwechsel.
   *
   * Derselbe Weg, den „Nur als Entwurf speichern" nimmt, und der Weg, den der
   * Navigationsschutz anbietet. Ausdrücklich **nicht** `completeTreatment`:
   * Ein Seitenwechsel darf keinen Termin abschließen und keine Dokumentation
   * festschreiben (ADR-016, ADR-018).
   */
  async function entwurfSichern() {
    if (note) {
      await updateTreatmentNote(note.id, note.updated_at, wert);
    } else {
      await createTreatmentNote(appointment.id, wert);
    }
    await queryClient.invalidateQueries({ queryKey: ['treatment-note', appointment.id] });
  }

  const { freigeben, schutz } = useTextverlustschutz({
    ungespeichert: geaendert,
    speichern: async () => {
      const meldung = inhaltFehler(wert);
      if (meldung) {
        setFehler(meldung);
        throw new Error(meldung);
      }
      await entwurfSichern();
    },
  });

  async function nachSchreiben() {
    await queryClient.invalidateQueries({ queryKey: ['treatment-note', appointment.id] });
    await queryClient.invalidateQueries({ queryKey: ['appointment', appointment.id] });
    // Kalender und Tagesliste führen den Termin sonst weiter im alten Zustand.
    await queryClient.invalidateQueries({ queryKey: ['appointments'] });
    await queryClient.invalidateQueries({ queryKey: ['day-plan'] });
    freigeben();
    void navigate(zurueck);
  }

  const abschliessen = useMutation({
    mutationFn: () =>
      completeTreatment(appointment.id, wert, appointment.updated_at, note?.updated_at ?? null),
    onSuccess: nachSchreiben,
  });

  const entwurfSpeichern = useMutation({
    mutationFn: entwurfSichern,
    onSuccess: nachSchreiben,
  });

  const laeuft = abschliessen.isPending || entwurfSpeichern.isPending;

  /** Gemeinsame Eingabeprüfung beider Wege. Verbindlich prüft der Server. */
  function geprueft(): boolean {
    const meldung = inhaltFehler(wert);
    setFehler(meldung);
    return meldung === undefined;
  }

  return (
    <>
      <PageHeader
        title="Behandlung abschließen"
        description={`${patientName(appointment)} · ${formatLocalDate(appointment.starts_at, zone)}, ${formatLocalTimeRange(appointment.starts_at, appointment.ends_at, zone)}`}
        kompakt
      />

      <form
        noValidate
        className="max-w-2xl"
        onSubmit={(event) => {
          event.preventDefault();
          if (laeuft || !geprueft()) return;
          abschliessen.mutate();
        }}
      >
        <TextbausteinLeiste onEinfuegen={(text) => setEntwurf(bausteinEinfuegen(wert, text))} />

        <TextArea
          label="Eintrag zur Behandlung"
          hint="Freitext. Was hier steht, wird mit dem Abschluss Bestandteil der Akte."
          rows={12}
          value={wert}
          error={fehler}
          onChange={(event) => {
            setEntwurf(event.target.value);
            if (fehler) setFehler(undefined);
          }}
        />

        {/* Die Folge steht vor der Schaltfläche, nicht in einer Rückfrage
            danach: So liest man sie, bevor man tippt (ADR-016 Punkt 4, 5). */}
        <div className="border-line-strong bg-surface-sunken rounded-card mt-5 border p-4">
          <p className="text-ink text-sm leading-relaxed">
            Mit dem Abschluss geschieht zweierlei in einem Schritt: Der Termin wird als durchgeführt
            geführt, und der Eintrag wird als Version 1 festgeschrieben. Ab dann ist er Bestandteil
            der Patientenakte; jede spätere Änderung braucht eine Begründung und bleibt
            nachvollziehbar.
            {appointment.status === 'completed'
              ? ' Dieser Termin ist bereits abgeschlossen – es wird nur noch die Dokumentation festgeschrieben.'
              : ''}
          </p>
        </div>

        {abschliessen.isError ? (
          <div className="mt-4">
            <ErrorState title="Nicht abgeschlossen" description={abschliessen.error.message} />
          </div>
        ) : null}
        {entwurfSpeichern.isError ? (
          <div className="mt-4">
            <ErrorState title="Nicht gespeichert" description={entwurfSpeichern.error.message} />
          </div>
        ) : null}

        {schutz}

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={laeuft}>
            {abschliessen.isPending ? 'Wird abgeschlossen …' : 'Behandlung abschließen'}
          </Button>

          <Button
            type="button"
            variant="secondary"
            disabled={laeuft || !geaendert}
            onClick={() => {
              if (laeuft || !geprueft()) return;
              entwurfSpeichern.mutate();
            }}
          >
            {entwurfSpeichern.isPending ? 'Wird gespeichert …' : 'Nur als Entwurf speichern'}
          </Button>

          {/* Die Rückfrage vor dem Verwerfen stellt seit FIX-011 der
              Navigationsschutz - für diesen Weg wie für jeden anderen aus
              dieser Seite heraus. */}
          <Link
            to={zurueck}
            className="text-ink-muted hover:bg-surface-sunken hover:text-ink rounded-button inline-flex min-h-11 items-center justify-center px-4 text-[0.9375rem] font-medium transition-colors"
          >
            Abbrechen
          </Link>
        </div>
      </form>

      <p className="text-ink-subtle mt-10 max-w-prose text-xs leading-relaxed">
        Der Text wird auf dem Server gespeichert, nicht auf diesem Gerät. Anlegen, Finalisieren und
        Lesen werden protokolliert.
      </p>
    </>
  );
}

export function CompleteTreatmentPage({ user }: { user: CurrentUser }) {
  const { appointmentId } = useParams<{ appointmentId: string }>();

  return (
    <DocumentationShell
      appointmentId={appointmentId}
      darf={canWriteTreatmentNote(user.roles)}
      verweigert="Eine Behandlung abschließen dürfen ausschließlich therapeutische Rollen."
    >
      {({ appointment, dokumentation }) => {
        if (appointment.status === 'cancelled') {
          return (
            <ErrorState
              title="Termin abgesagt"
              description="Zu einem abgesagten Termin hat keine Behandlung stattgefunden."
            />
          );
        }

        if (dokumentation.primary?.status === 'final') {
          return (
            <ErrorState
              title="Bereits abgeschlossen"
              description="Die Dokumentation dieses Termins ist finalisiert. Eine Änderung ist nur als Korrektur mit Begründung möglich, eine Ergänzung als Nachtrag."
            />
          );
        }

        return <Abschluss appointment={appointment} note={dokumentation.primary} />;
      }}
    </DocumentationShell>
  );
}
