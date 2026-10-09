import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { TrainingRueckfragen } from '@/features/messages/RueckfragenAbschnitt';
import { PlanWiedervorlage } from '@/features/exercise-plans/Wiedervorlage';
import { Badge } from '@/components/ui/Badge';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/Feedback';
import { PageHeader } from '@/components/ui/PageHeader';
import { SearchField } from '@/components/ui/SearchField';
import { BEGRIFFE } from '@/lib/begriffe';
import { formatDate } from '@/lib/datum';
import {
  canWriteExercisePlans,
  canWriteTrainingClients,
  type CurrentUser,
} from '@/features/session/types';
import { listTrainingClients, type TrainingClientListItem } from './api';

export const TRAINING_ANLEGEN = `${BEGRIFFE.trainingskundIn} anlegen`;

function passt(eintrag: TrainingClientListItem, suche: string): boolean {
  const s = suche.trim().toLocaleLowerCase('de');
  if (s === '') return true;
  return `${eintrag.given_name} ${eintrag.family_name}`.toLocaleLowerCase('de').includes(s);
}

function vertragszeile(eintrag: TrainingClientListItem): string {
  if (eintrag.contract_ended_on)
    return `Vertrag beendet am ${formatDate(eintrag.contract_ended_on)}`;
  if (eintrag.contract_started_on) return `Vertrag seit ${formatDate(eintrag.contract_started_on)}`;
  return 'Vertragsbeginn nicht erfasst';
}

/**
 * Die Trainingskund:innen der Praxis (TRN-002).
 *
 * Die Liste zeigt Name und Vertrag, keinen Kontakt - der steht erst in der
 * Detailansicht, deren Öffnen protokolliert wird (ANN-175). Wer sie sieht,
 * entscheidet der Server (owner, Trainingsbetreuung, Büro); therapist und
 * team_lead bekommen den Bereich gar nicht angeboten und vom Server keine
 * Zeile (ADR-021 Punkt 6).
 */
export function TrainingClientsPage({ user }: { user: CurrentUser }) {
  const [suche, setSuche] = useState('');
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ['training-clients'],
    queryFn: listTrainingClients,
    retry: false,
  });
  const sichtbar = (data ?? []).filter((eintrag) => passt(eintrag, suche));

  return (
    <>
      <PageHeader
        title={BEGRIFFE.trainingskundInnen}
        description="Personal Training – Vertrag und Kontakt, getrennt von der Behandlung."
        actions={
          canWriteTrainingClients(user.roles) ? (
            <ButtonLink to="/training/neu">{TRAINING_ANLEGEN}</ButtonLink>
          ) : null
        }
      />

      {/* KOM-003: offene Rückfragen aus dem Training (DSN-001 D1 b). */}
      <TrainingRueckfragen />

      {/* UEB-007: auslaufende Trainingspläne - die Trainingsbetreuung öffnet
          „Offene Punkte" nicht, also stehen sie hier (ANN-302). */}
      {canWriteExercisePlans(user.roles, 'training') ? (
        <div className="mb-6">
          <PlanWiedervorlage bereiche={['training']} rueckweg="/training" nurWennVorhanden />
        </div>
      ) : null}

      <div className="mb-5 max-w-sm">
        <SearchField label="Liste filtern" placeholder="Name" value={suche} onChange={setSuche} />
      </div>

      {isPending ? <LoadingState label="Trainingskund:innen werden geladen …" /> : null}
      {isError ? (
        <ErrorState
          title="Die Trainingskund:innen konnten nicht geladen werden."
          description="Bitte die Verbindung prüfen und erneut versuchen."
          onErneut={() => refetch()}
        />
      ) : null}

      {data && sichtbar.length === 0 ? (
        <EmptyState
          title={data.length === 0 ? 'Noch keine Trainingskund:innen' : 'Keine Treffer'}
          description={
            data.length === 0 ? `Die erste entsteht über „${TRAINING_ANLEGEN}“.` : 'Suche anpassen.'
          }
        />
      ) : null}

      {sichtbar.length > 0 ? (
        <ul className="divide-line border-line bg-surface rounded-card divide-y border px-4 sm:px-5">
          {sichtbar.map((eintrag) => (
            <li key={eintrag.id}>
              <Link
                to={`/training/${eintrag.id}`}
                className="hover:bg-surface-sunken flex min-h-16 items-center justify-between gap-4 py-3 transition-colors"
              >
                <span className="min-w-0">
                  <span className="text-ink text-liste block truncate font-medium">
                    {eintrag.given_name} {eintrag.family_name}
                  </span>
                  <span className="text-ink-muted mt-0.5 block text-sm">
                    {vertragszeile(eintrag)}
                  </span>
                </span>
                {eintrag.status === 'inactive' ? <Badge>Beendet</Badge> : null}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}
