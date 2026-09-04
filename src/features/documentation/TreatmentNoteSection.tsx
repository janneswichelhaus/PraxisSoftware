import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import {
  canReadTreatmentNote,
  canWriteTreatmentNote,
  type CurrentUser,
} from '@/features/session/types';
import type { Appointment } from '@/features/appointments/api';
import {
  fetchTreatmentDocumentation,
  finalizeTreatmentNote,
  treatmentNoteStatusLabels,
  type TreatmentNote,
} from './api';
import { zeitpunkt } from './format';

const linkPrimaer =
  'bg-accent hover:bg-accent-hover inline-flex min-h-11 items-center justify-center rounded-lg px-4 text-[0.9375rem] font-medium text-white transition-colors';
const linkSekundaer =
  'border-line-strong bg-surface text-ink hover:bg-surface-sunken inline-flex min-h-11 items-center justify-center rounded-lg border px-4 text-[0.9375rem] font-medium transition-colors';

/**
 * Die Herkunftszeile eines Eintrags.
 *
 * Für einen Entwurf zählt, wer ihn zuletzt geändert hat; für einen
 * finalisierten Eintrag, wer ihn zum Bestandteil der Akte gemacht hat. Beides
 * in einer Zeile zu zeigen wäre für den Alltag zu viel - die vollständige
 * Urheberschaft je Version steht im Änderungsverlauf.
 */
function herkunft(note: TreatmentNote, zone: string): string {
  const verfasst = note.author_name ? `Verfasst von ${note.author_name}. ` : '';

  if (note.status === 'final' && note.finalized_at) {
    const wer = note.finalized_by_name ? ` von ${note.finalized_by_name}` : '';
    return `${verfasst}Finalisiert am ${zeitpunkt(note.finalized_at, zone)}${wer}.`;
  }

  const wer = note.last_editor_name ? ` von ${note.last_editor_name}` : '';
  return `${verfasst}Zuletzt geändert am ${zeitpunkt(note.updated_at, zone)}${wer}.`;
}

/**
 * Ein Eintrag - Haupteintrag oder Nachtrag - mit seinen Handlungen.
 *
 * Angezeigt wird der Freitext unverändert. Die Anwendung fügt ihm nichts hinzu
 * - keine Hervorhebung, keine Einordnung, keine Bewertung (ADR-006).
 */
function Eintrag({
  appointment,
  note,
  darfSchreiben,
  istNachtrag,
}: {
  appointment: Appointment;
  note: TreatmentNote;
  darfSchreiben: boolean;
  istNachtrag: boolean;
}) {
  const queryClient = useQueryClient();
  const zone = appointment.organization_time_zone;
  const [frage, setFrage] = useState(false);

  const finalisieren = useMutation({
    mutationFn: () => finalizeTreatmentNote(note.id, note.updated_at),
    onSuccess: async () => {
      setFrage(false);
      await queryClient.invalidateQueries({ queryKey: ['treatment-note', appointment.id] });
    },
  });

  const basis = `/termine/${appointment.id}/dokumentation`;

  return (
    <div className="border-line mt-2 border-t pt-4">
      <div className="flex flex-wrap items-center gap-2">
        {istNachtrag ? (
          <span className="border-line-strong bg-surface-sunken text-ink-muted rounded-full border px-2.5 py-0.5 text-xs font-medium">
            Nachtrag
          </span>
        ) : null}
        <span className="border-line-strong bg-surface-sunken text-ink-muted rounded-full border px-2.5 py-0.5 text-xs font-medium">
          {treatmentNoteStatusLabels[note.status]}
        </span>
        {note.status === 'draft' ? (
          <span className="text-ink-subtle text-xs">noch nicht finalisiert</span>
        ) : null}
        {note.status === 'final' && note.version_count > 1 ? (
          <span className="text-ink-subtle text-xs">
            {note.version_count} Versionen, zuletzt korrigiert am {zeitpunkt(note.updated_at, zone)}
          </span>
        ) : null}
      </div>

      <p className="text-ink mt-3 max-w-prose text-[0.9375rem] leading-relaxed whitespace-pre-wrap">
        {note.content}
      </p>

      <p className="text-ink-subtle mt-3 text-xs leading-relaxed">{herkunft(note, zone)}</p>

      {finalisieren.isError ? (
        <div className="mt-3">
          <ErrorState title="Nicht finalisiert" description={finalisieren.error.message} />
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-3">
        {darfSchreiben && note.status === 'draft' ? (
          <Link
            to={istNachtrag ? `${basis}/${note.id}/bearbeiten` : basis}
            className={linkSekundaer}
          >
            {istNachtrag ? 'Nachtrag bearbeiten' : 'Dokumentation bearbeiten'}
          </Link>
        ) : null}

        {darfSchreiben && note.status === 'draft' ? (
          <Button type="button" onClick={() => setFrage(true)} disabled={finalisieren.isPending}>
            Finalisieren
          </Button>
        ) : null}

        {darfSchreiben && note.status === 'final' ? (
          <Link to={`${basis}/${note.id}/korrektur`} className={linkSekundaer}>
            Korrigieren
          </Link>
        ) : null}

        {note.version_count > 0 ? (
          <Link to={`${basis}/${note.id}/verlauf`} className={linkSekundaer}>
            Änderungsverlauf
          </Link>
        ) : null}
      </div>

      {/* Die Finalisierung ist nicht rückgängig zu machen: ab hier ist der
          Eintrag Bestandteil der Akte, und jede weitere Änderung erzeugt eine
          Version mit Begründung (ADR-016 Punkt 4 bis 6). Ein versehentlicher
          Klick darf das nicht auslösen (PROJECT_PRINCIPLES.md 13). */}
      {frage ? (
        <div
          role="group"
          aria-label="Dokumentation finalisieren"
          className="border-line-strong bg-surface-sunken mt-4 rounded-lg border p-4"
        >
          <p className="text-ink text-sm leading-relaxed">
            Nach der Finalisierung ist der Eintrag Bestandteil der Patientenakte. Der jetzige
            Wortlaut wird als Version 1 festgeschrieben; jede spätere Änderung braucht eine
            Begründung und bleibt nachvollziehbar.
          </p>
          <div className="mt-3 flex flex-wrap gap-3">
            <Button
              type="button"
              onClick={() => finalisieren.mutate()}
              disabled={finalisieren.isPending}
            >
              {finalisieren.isPending ? 'Wird finalisiert …' : 'Ja, jetzt finalisieren'}
            </Button>
            <Button type="button" variant="quiet" onClick={() => setFrage(false)}>
              Abbrechen
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Behandlungsdokumentation am Termin (DOK-001, DOK-002).
 *
 * Der Abschnitt wird für `office` und Patientenkonten gar nicht erst
 * gerendert und auch nicht abgefragt (PROJECT_PRINCIPLES.md 4.3, 4.6). Das ist
 * ausdrücklich keine Zugriffskontrolle: `get_treatment_note` prüft die Rolle
 * selbst, und auf die Tabellen gibt es überhaupt kein Recht.
 */
export function TreatmentNoteSection({
  appointment,
  user,
}: {
  appointment: Appointment;
  user: CurrentUser;
}) {
  const darfLesen = canReadTreatmentNote(user.roles);
  const darfSchreiben = canWriteTreatmentNote(user.roles);
  const abgesagt = appointment.status === 'cancelled';

  const { data, isPending, isError } = useQuery({
    queryKey: ['treatment-note', appointment.id],
    queryFn: () => fetchTreatmentDocumentation(appointment.id),
    enabled: darfLesen,
    retry: false,
  });

  if (!darfLesen) return null;

  const eintrag = data?.primary ?? null;

  return (
    <section className="mt-8">
      <h2 className="text-ink-muted text-sm font-semibold tracking-wide uppercase">
        Behandlungsdokumentation
      </h2>

      {isPending ? <LoadingState label="Dokumentation wird geladen …" /> : null}

      {isError ? (
        <div className="mt-2">
          <ErrorState title="Die Behandlungsdokumentation konnte nicht geladen werden." />
        </div>
      ) : null}

      {!isPending && !isError && !eintrag ? (
        <div className="border-line mt-2 border-t pt-4">
          <p className="text-ink-muted text-[0.9375rem]">
            {abgesagt
              ? 'Zu einem abgesagten Termin entsteht keine Behandlungsdokumentation.'
              : 'Für diesen Termin ist noch keine Behandlungsdokumentation hinterlegt.'}
          </p>
          {darfSchreiben && !abgesagt ? (
            <Link to={`/termine/${appointment.id}/dokumentation`} className={`${linkPrimaer} mt-3`}>
              Dokumentation anlegen
            </Link>
          ) : null}
        </div>
      ) : null}

      {eintrag ? (
        <>
          <Eintrag
            appointment={appointment}
            note={eintrag}
            darfSchreiben={darfSchreiben}
            istNachtrag={false}
          />

          {data?.addenda.map((nachtrag) => (
            <Eintrag
              key={nachtrag.id}
              appointment={appointment}
              note={nachtrag}
              darfSchreiben={darfSchreiben}
              istNachtrag
            />
          ))}

          {/* Der Nachtrag setzt einen finalisierten Ursprung voraus: solange der
              Eintrag Entwurf ist, wird er schlicht bearbeitet (ADR-016 Punkt 6). */}
          {darfSchreiben && eintrag.status === 'final' ? (
            <Link
              to={`/termine/${appointment.id}/dokumentation/${eintrag.id}/nachtrag`}
              className={`${linkSekundaer} mt-4`}
            >
              Nachtrag hinzufügen
            </Link>
          ) : null}
        </>
      ) : null}

      <p className="text-ink-subtle mt-4 max-w-prose text-xs leading-relaxed">
        Zugriffe auf die Behandlungsdokumentation werden protokolliert.
      </p>
    </section>
  );
}
