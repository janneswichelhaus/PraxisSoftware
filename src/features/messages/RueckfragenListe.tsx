import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/Badge';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { ListRow, ListRows } from '@/components/ui/ListRow';
import { formatDate } from '@/lib/datum';
import {
  THEMA_LABEL,
  VON_LABEL,
  fetchRueckfragen,
  rueckfragenKey,
  type Rueckfragezeile,
  type Verhaeltnisart,
} from './api';

/**
 * Die Rückfragen als Liste (KOM-002, DSN-001 Abschnitt 6): Person, Thema,
 * Zustand und „Antwort fällig bis …" - ohne Text. Überfälliges steht mit
 * Wort, nie nur in Farbe (ANN-309). Gebraucht unter Kommunikation, an der
 * Akte und am Trainingsverhältnis.
 */
export function RueckfragenListe({
  art,
  verhaeltnisId = null,
  mitErledigten = false,
  mitName = true,
  leer,
}: {
  art: Verhaeltnisart | null;
  verhaeltnisId?: string | null;
  mitErledigten?: boolean;
  mitName?: boolean;
  leer: string;
}) {
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: rueckfragenKey(art, verhaeltnisId, mitErledigten),
    queryFn: () => fetchRueckfragen(art, verhaeltnisId, mitErledigten),
    retry: false,
  });
  if (isPending) return <LoadingState label="Rückfragen werden geladen …" />;
  if (isError) {
    return (
      <ErrorState
        title="Die Rückfragen konnten nicht geladen werden."
        description="Bitte die Verbindung prüfen und erneut versuchen."
        onErneut={() => refetch()}
      />
    );
  }
  if (data.length === 0) return <p className="text-ink-muted text-sm">{leer}</p>;
  return (
    <ListRows>
      {data.map((z) => (
        <Rueckfragezeile key={z.id} zeile={z} mitName={mitName} />
      ))}
    </ListRows>
  );
}

function Rueckfragezeile({ zeile, mitName }: { zeile: Rueckfragezeile; mitName: boolean }) {
  const name = [zeile.given_name, zeile.family_name].filter(Boolean).join(' ') || 'Ohne Namen';
  const thema =
    THEMA_LABEL[zeile.topic] + (zeile.reference_label ? ` · ${zeile.reference_label}` : '');
  const von =
    zeile.asked_by && zeile.asked_by !== 'self'
      ? ` · über ${VON_LABEL[zeile.asked_by]}${zeile.representative_name ? ` ${zeile.representative_name}` : ''}`
      : '';
  return (
    <ListRow
      zeit={formatDate(zeile.last_entry_at.slice(0, 10))}
      titel={mitName ? name : thema}
      meta={`${mitName ? thema : `${zeile.entry_count} Einträge`}${von}${
        zeile.record_assigned_at ? ' · in der Akte' : ''
      }`}
      status={<Zustand zeile={zeile} />}
      to={`/rueckfragen/${zeile.id}`}
      gedaempft={zeile.status === 'closed'}
    />
  );
}

export function Zustand({
  zeile,
}: {
  zeile: Pick<Rueckfragezeile, 'status' | 'due_on' | 'overdue' | 'can_answer'>;
}) {
  if (zeile.status === 'closed') return <Badge ton="positiv">erledigt</Badge>;
  if (zeile.status === 'answered') return <Badge ton="neutral">beantwortet</Badge>;
  if (zeile.overdue) {
    return (
      <Badge ton="warnung">
        überfällig{zeile.due_on ? ` seit ${formatDate(zeile.due_on)}` : ''}
      </Badge>
    );
  }
  return (
    <Badge ton="akzent">
      offen{zeile.due_on ? ` · Antwort bis ${formatDate(zeile.due_on)}` : ''}
    </Badge>
  );
}
