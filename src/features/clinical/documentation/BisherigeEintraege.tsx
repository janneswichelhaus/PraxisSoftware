import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Symbolknopf } from '@/components/ui/Symbolknopf';
import { Textlink } from '@/components/ui/Textlink';
import { LoadingState } from '@/components/ui/Feedback';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { fetchPatientTreatmentNotesPage, type TreatmentNote } from './api';

/** Ein früherer Eintrag, wie das Blatt ihn zeigt. */
interface FruehererEintrag {
  note: TreatmentNote;
  startsAt: string;
  zone: string;
}

/**
 * Die bisherigen Einträge der Person - neben dem Schreibfeld (Design-Handoff
 * 2026-10-01, Abschnitt 6a).
 *
 * **Gelesen wird erst, wenn jemand das Blatt öffnet.** Derselbe Lesepfad wie
 * der Behandlungsverlauf der Akte (`list_patient_treatment_notes`), und wie
 * dort protokolliert der Server jeden gezeigten Eintrag als
 * `treatment_note.viewed` (ADR-010 Punkt 2, ADR-016 Punkt 9). Der Handoff
 * lässt das Blatt am Rechner von selbst offen stehen; hier öffnet es nie von
 * selbst - ein Lesen klinischer Einträge folgt einer Handlung, wie am
 * Kurzblick (ANN-137, ANN-200).
 *
 * Gezeigt wird die erste Seite der Akte (die jüngsten 20 Termine) ohne den
 * Termin, der gerade dokumentiert wird; Termine ohne Eintrag fallen weg. Wer
 * weiter zurück will, geht über „Verlauf in der Akte".
 */
export function BisherigeEintraege({
  patientId,
  appointmentId,
  zurAkte,
  onAnzahl,
  onSchliessen,
}: {
  patientId: string;
  /** Der Termin dieser Schreibseite - sein Eintrag steht im Feld, nicht hier. */
  appointmentId: string;
  /** Der Behandlungsverlauf der Akte, samt Rückweg auf diese Seite. */
  zurAkte: string;
  /** Wie viele Einträge geladen sind - für „Verlauf (n)" in der Fußleiste. */
  onAnzahl?: (anzahl: number) => void;
  onSchliessen: () => void;
}) {
  const abfrage = useQuery({
    queryKey: ['patient-treatment-notes', patientId, 'schreibseite'],
    queryFn: () => fetchPatientTreatmentNotesPage(patientId, null),
    retry: false,
  });

  const eintraege: FruehererEintrag[] = (abfrage.data ?? [])
    .filter((termin) => termin.appointment_id !== appointmentId)
    .flatMap((termin) =>
      termin.notes.map((note) => ({
        note,
        startsAt: termin.starts_at,
        zone: termin.organization_time_zone,
      })),
    );

  const anzahl = abfrage.data ? eintraege.length : null;
  useEffect(() => {
    if (anzahl !== null) onAnzahl?.(anzahl);
  }, [anzahl, onAnzahl]);

  return (
    <section aria-labelledby="bisherige-eintraege" className="flex min-h-0 flex-1 flex-col">
      <div className="border-line flex min-h-11 shrink-0 items-center gap-2 border-b pl-4">
        <h2 id="bisherige-eintraege" className="text-ink text-sm font-bold">
          Bisherige Einträge{abfrage.data ? ` (${eintraege.length})` : ''}
        </h2>
        <span className="text-ink-muted text-xs">Lesen protokolliert</span>
        <Symbolknopf
          beschriftung="Bisherige Einträge schließen"
          className="ml-auto"
          onClick={onSchliessen}
        >
          <span className="text-xl leading-none">×</span>
        </Symbolknopf>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {abfrage.isPending ? <LoadingState label="Einträge werden geladen …" /> : null}
        {abfrage.isError ? (
          <Statusmeldung ton="fehler">{abfrage.error.message}</Statusmeldung>
        ) : null}
        {abfrage.data && eintraege.length === 0 ? (
          <p className="text-ink-muted text-sm">Noch kein Eintrag vor diesem Termin.</p>
        ) : null}
        <ol className="flex flex-col">
          {eintraege.map(({ note, startsAt, zone }) => (
            <li key={note.id} className="border-line border-b py-3 first:pt-0 last:border-b-0">
              <div className="flex items-baseline gap-2">
                <span className="text-ink text-sm font-bold tabular-nums">
                  {kurzesDatum(startsAt, zone)}
                </span>
                <span className="text-ink-muted text-[13px]">
                  {note.addendum_to_note_id ? 'Nachtrag' : 'Behandlung'}
                </span>
                <span
                  className={`ml-auto text-xs whitespace-nowrap ${note.status === 'final' ? 'text-ink-muted' : 'text-warnung font-semibold'}`}
                >
                  {note.status === 'final' ? (
                    `Version ${note.version_count}`
                  ) : (
                    <>
                      <span aria-hidden="true">! </span>Entwurf
                    </>
                  )}
                </span>
              </div>
              <p className="text-ink mt-1 text-sm leading-normal wrap-anywhere whitespace-pre-wrap">
                {note.content}
              </p>
            </li>
          ))}
        </ol>
      </div>

      <div className="border-line shrink-0 border-t px-4 py-1">
        <Textlink to={zurAkte} alleinstehend>
          Verlauf in der Akte →
        </Textlink>
      </div>
    </section>
  );
}

/** „28.09.2026" - in der Zeit der Praxis. */
function kurzesDatum(iso: string, zone: string): string {
  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: zone,
  }).format(new Date(iso));
}
