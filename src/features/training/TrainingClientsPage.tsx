import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { TrainingRueckfragen } from '@/features/messages/RueckfragenAbschnitt';
import { PlanWiedervorlage } from '@/features/exercise-plans/Wiedervorlage';
import { Badge } from '@/components/ui/Badge';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { EmptyState } from '@/components/ui/Feedback';
import { Filterleiste } from '@/components/ui/Filterleiste';
import { Kleingedrucktes } from '@/components/ui/Kleingedrucktes';
import { ListRow, ListRows } from '@/components/ui/ListRow';
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
  const abfrage = useQuery({
    queryKey: ['training-clients'],
    queryFn: listTrainingClients,
    retry: false,
  });
  const { data } = abfrage;
  const sichtbar = (data ?? []).filter((eintrag) => passt(eintrag, suche));

  return (
    <>
      {/* Seitentyp „Liste“ (DESIGN.md, Welle B3a): Titel und „Anlegen“
          kompakt in einer Zeile, darunter die Suche, dann die Zeilen. Der
          Satz zur Trennung von der Behandlung bleibt - als Kleingedrucktes
          am Ende statt als zweite Zeile im Kopf (ADR-021). */}
      <PageHeader
        title={BEGRIFFE.trainingskundInnen}
        actions={
          canWriteTrainingClients(user.roles) ? (
            // „Anlegen“ kompakt neben dem Titel (DESIGN.md „Liste“): Mit dem
            // ganzen Wort brach der Knopf am Telefon unter den Titel. Der
            // zugängliche Name nennt, was angelegt wird (WCAG 2.5.3).
            <ButtonLink to="/training/neu" aria-label={TRAINING_ANLEGEN}>
              Anlegen
            </ButtonLink>
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

      <Filterleiste
        beschriftung={`${BEGRIFFE.trainingskundInnen} durchsuchen`}
        suche={
          <SearchField
            label={`${BEGRIFFE.trainingskundIn} suchen`}
            placeholder="Name"
            value={suche}
            onChange={setSuche}
          />
        }
        ergebnis={
          data && data.length > 0 && suche.trim() !== ''
            ? `${sichtbar.length} von ${data.length}`
            : undefined
        }
      />

      <Abfragezustand
        abfrage={abfrage}
        laden="Trainingskund:innen werden geladen …"
        fehler="Die Trainingskund:innen konnten nicht geladen werden."
        inKarte
        leer={{
          wenn: (liste) => liste.length === 0,
          titel: 'Noch keine Trainingskund:innen',
          beschreibung: 'Die erste entsteht über „Anlegen“.',
        }}
      >
        {() =>
          sichtbar.length === 0 ? (
            <EmptyState inKarte title="Keine Treffer" description="Suche anpassen." />
          ) : (
            <ListRows>
              {sichtbar.map((eintrag) => (
                <ListRow
                  key={eintrag.id}
                  to={`/training/${eintrag.id}`}
                  titel={
                    <span className="wrap-anywhere">
                      {eintrag.given_name} {eintrag.family_name}
                    </span>
                  }
                  meta={vertragszeile(eintrag)}
                  gedaempft={eintrag.status === 'inactive'}
                  // Ein laufender Vertrag ist der Regelfall und trägt kein
                  // Abzeichen (UX-005i).
                  status={eintrag.status === 'inactive' ? <Badge>Beendet</Badge> : undefined}
                />
              ))}
            </ListRows>
          )
        }
      </Abfragezustand>

      <Kleingedrucktes className="mt-8">
        Personal Training – Vertrag und Kontakt, getrennt von der Behandlung.
      </Kleingedrucktes>
    </>
  );
}
