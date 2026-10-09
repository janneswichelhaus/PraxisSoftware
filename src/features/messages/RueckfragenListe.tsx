import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/Badge';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { ListRow, ListRows } from '@/components/ui/ListRow';
import { formatDate } from '@/lib/datum';
import {
  THEMA_LABEL,
  VON_LABEL,
  fetchRueckfragen,
  rueckfragePfad,
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
  nurWennVorhanden = false,
}: {
  art: Verhaeltnisart | null;
  verhaeltnisId?: string | null;
  mitErledigten?: boolean;
  mitName?: boolean;
  leer: string;
  /** Ohne Rückfrage gar nichts zeigen - für Seiten, auf denen sie nur dazukommen. */
  nurWennVorhanden?: boolean;
}) {
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: rueckfragenKey(art, verhaeltnisId, mitErledigten),
    queryFn: () => fetchRueckfragen(art, verhaeltnisId, mitErledigten),
    retry: false,
  });
  if (isPending)
    return nurWennVorhanden ? null : <LoadingState label="Rückfragen werden geladen …" />;
  if (isError) {
    return (
      <ErrorState
        title="Die Rückfragen konnten nicht geladen werden."
        description="Bitte die Verbindung prüfen und erneut versuchen."
        onErneut={() => refetch()}
      />
    );
  }
  if (data.length === 0) {
    return nurWennVorhanden ? null : <p className="text-ink-muted text-sm">{leer}</p>;
  }
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
  // Die Frist steht in der Nebenzeile, die Marke bleibt kurz: Am Telefon
  // überdeckte eine lange Marke sonst den Namen.
  const frist =
    zeile.status === 'open' && zeile.due_on
      ? zeile.overdue
        ? ` · fällig war ${formatDate(zeile.due_on)}`
        : ` · Antwort bis ${formatDate(zeile.due_on)}`
      : '';
  return (
    <ListRow
      zeit={formatDate(zeile.last_entry_at.slice(0, 10)).slice(0, 6)}
      titel={mitName ? name : thema}
      meta={`${mitName ? thema : `${zeile.entry_count} Einträge`}${frist}${von}${
        zeile.record_assigned_at ? ' · in der Akte' : ''
      }`}
      status={<Zustand zeile={zeile} kurz />}
      to={rueckfragePfad(zeile)}
      gedaempft={zeile.status === 'closed'}
    />
  );
}

export function Zustand({
  zeile,
  kurz = false,
}: {
  zeile: Pick<Rueckfragezeile, 'status' | 'due_on' | 'overdue' | 'can_answer'>;
  /** Nur das Wort - in Listen steht die Frist in der Nebenzeile. */
  kurz?: boolean;
}) {
  if (zeile.status === 'closed') return <Badge ton="positiv">erledigt</Badge>;
  if (zeile.status === 'answered') return <Badge ton="neutral">beantwortet</Badge>;
  if (kurz) {
    return zeile.overdue ? (
      <Badge ton="warnung">überfällig</Badge>
    ) : (
      <Badge ton="akzent">offen</Badge>
    );
  }
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
