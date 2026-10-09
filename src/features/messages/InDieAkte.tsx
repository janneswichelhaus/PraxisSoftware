import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Rueckfrage as Nachfrage } from '@/components/ui/Rueckfrage';
import { Section } from '@/components/ui/Section';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { formatLocalTime } from '@/features/appointments/api';
import {
  RUECKFRAGEN_KEY,
  THEMA_LABEL,
  aktenNachrichtenKey,
  assignRueckfrage,
  fetchAktenNachrichten,
  kurzesDatum,
  verfasser,
  type Rueckfrage,
} from './api';

/**
 * „In die Akte übernehmen" an der Rückfrage (KOM-004, §10, IDEA-KOM-007).
 *
 * Erkennt eine Therapeut:in klinischen Inhalt in einer Nachricht, ordnet sie
 * den Vorgang der Akte zu: unverändert, mit Herkunft, endgültig (ANN-312).
 * Wer darf, sagt der Server (`can_assign`); im Training gibt es keine Akte.
 */
export function InDieAkte({ vorgang, zeitzone }: { vorgang: Rueckfrage; zeitzone: string }) {
  const queryClient = useQueryClient();
  const zuordnen = useMutation({
    mutationFn: () => assignRueckfrage(vorgang.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: RUECKFRAGEN_KEY }),
  });

  if (vorgang.record_assigned_at) {
    return (
      <Statusmeldung ton="erfolg">
        In der Akte seit {kurzesDatum(vorgang.record_assigned_at, zeitzone)}
        {vorgang.record_assigned_by_label
          ? `, übernommen von ${vorgang.record_assigned_by_label}`
          : ''}
        .{' '}
        {vorgang.patient_id ? (
          <Link to={`/patienten/${vorgang.patient_id}/doku`} className="underline">
            Zur Doku
          </Link>
        ) : null}
      </Statusmeldung>
    );
  }
  if (!vorgang.can_assign) return null;
  return (
    <div>
      <Nachfrage
        ausloeser="In die Akte übernehmen"
        bestaetigen="Ja, in die Akte"
        bestaetigenLaeuft="Wird übernommen …"
        fehler={zuordnen.error?.message}
        onBestaetigen={() => zuordnen.mutateAsync()}
      >
        <p>
          Die Nachricht und alle Antworten stehen dann unverändert in der Doku der Akte, mit Datum
          und wer sie geschrieben hat. Das lässt sich nicht rückgängig machen; die Nachricht wird
          dann aufbewahrt wie die Akte.
        </p>
      </Nachfrage>
    </div>
  );
}

/**
 * Nachrichten in der Akte (KOM-004): die zugeordneten Vorgänge mit Herkunft,
 * im Reiter „Doku". Nur, wenn es welche gibt. Lesen ist „Akte geöffnet".
 */
export function NachrichtenInDerAkte({
  patientId,
  zeitzone,
}: {
  patientId: string;
  zeitzone: string;
}) {
  const { data } = useQuery({
    queryKey: aktenNachrichtenKey(patientId),
    queryFn: () => fetchAktenNachrichten(patientId),
    retry: false,
  });
  if (!data || data.length === 0) return null;
  return (
    <div className="mt-8">
      <Section
        titel="Nachrichten in der Akte"
        hinweis="Über die Plattform eingegangen und von der Praxis der Akte zugeordnet – unverändert."
      >
        <ul className="flex flex-col gap-4">
          {data.map((m) => (
            <li key={m.id} className="rounded-card border-line bg-surface border p-4">
              <p className="text-ink font-semibold">
                {THEMA_LABEL[m.topic]}
                {m.reference_label ? ` · ${m.reference_label}` : ''}
              </p>
              <p className="text-ink-muted text-sm">
                Nachricht vom {kurzesDatum(m.created_at, zeitzone)} · in die Akte übernommen am{' '}
                {kurzesDatum(m.record_assigned_at, zeitzone)} von {m.record_assigned_by_label}
              </p>
              <ol className="mt-3 flex flex-col gap-2">
                {m.entries.map((e) => (
                  <li key={e.id}>
                    <p className="text-ink-muted text-sm">
                      <span className="text-ink font-medium">{verfasser(e, 'Patient:in')}</span> ·{' '}
                      {kurzesDatum(e.created_at, zeitzone)},{' '}
                      {formatLocalTime(e.created_at, zeitzone)}
                    </p>
                    <p className="text-ink leading-relaxed whitespace-pre-line">{e.body}</p>
                  </li>
                ))}
              </ol>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
