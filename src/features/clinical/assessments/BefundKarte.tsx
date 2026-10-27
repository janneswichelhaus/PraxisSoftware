import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { formatDate } from '@/lib/datum';
import type { Patient } from '@/features/patients/api';
import { erhebungenQueryKey, fetchErhebungen } from './api';
import { hervorhebungen } from './hervorhebung';
import { fassungFuer } from './instrumente';

/**
 * Der Befund oben in der Doku, als eine Karte mit Weg (Akte entschlacken,
 * 2026-10-03): „Erstbefund vom …", darunter wer erhoben hat und die
 * hervorgehobenen Angaben in Kurzform. Alles Weitere - Bögen, Liege,
 * Messverlauf - steht auf der eigenen Seite `doku/befund`.
 *
 * Gelesen wird über denselben Weg und Schlüssel wie dort; jede gelieferte
 * Erhebung wird auf dem Server protokolliert (ADR-010). Die Kurzform nennt nur,
 * was angekreuzt ist, wörtlich und ohne Wertung (§7.1, ADR-006).
 */
export function BefundKarte({ patient }: { patient: Patient }) {
  const erhebungen = useQuery({
    queryKey: erhebungenQueryKey(patient.id),
    queryFn: () => fetchErhebungen(patient.id),
  });
  const ziel = `/patienten/${patient.id}/doku/befund`;

  // Der Erstbefund ist die älteste abgeschlossene Erhebung, die nicht durch
  // eine Korrektur ersetzt ist.
  const abgeschlossen = (erhebungen.data ?? [])
    .filter((e) => e.status === 'abgeschlossen' && e.superseded_by_response_id === null)
    .sort((a, b) => a.recorded_on.localeCompare(b.recorded_on));
  const erst = abgeschlossen[0];
  const definition = erst ? fassungFuer(erst.instrument_id, erst.definition_version) : undefined;
  const kurz =
    erst && definition
      ? hervorhebungen(definition, erst.answers)
          .flatMap((h) => h.angaben)
          .join(', ')
      : '';

  return (
    <Link
      to={ziel}
      className="border-line bg-surface rounded-card hover:bg-surface-sunken flex items-start gap-3 border px-4 py-3.5 transition-colors"
    >
      <span className="min-w-0 flex-1">
        <span className="text-ink-muted tracking-label block text-xs font-semibold uppercase">
          Befund
        </span>
        {erhebungen.isPending ? (
          <span className="text-ink-muted mt-1 block text-sm">Befund wird geladen …</span>
        ) : erst ? (
          <>
            <span className="text-ink mt-1 block text-base font-bold">
              Erstbefund vom {formatDate(erst.recorded_on)}
            </span>
            <span className="text-ink-muted block truncate text-sm">
              {[erst.completed_by_name ?? erst.author_name, kurz].filter(Boolean).join(' · ')}
            </span>
          </>
        ) : (
          <span className="text-ink mt-1 block text-base font-bold">
            {erhebungen.isError ? 'Befund öffnen' : 'Noch kein Befund erhoben'}
          </span>
        )}
      </span>
      <span aria-hidden="true" className="text-accent text-lg leading-none">
        →
      </span>
    </Link>
  );
}
