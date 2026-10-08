import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Kleingedrucktes } from '@/components/ui/Kleingedrucktes';
import { Rueckweg } from '@/components/ui/Rueckweg';
import type { CurrentUser } from '@/features/session/types';
import { fetchPlan, planPfad, planSchluessel } from './api';
import { Planblatt } from './Planblatt';

/**
 * Der Plan als Blatt aus der Praxis (UEB-008, ANN-303) - unter
 * `…/plaene/:planId/blatt` an Akte und Trainingsverhältnis.
 *
 * Gelesen wird über `get_exercise_plan` wie auf der Planseite, mit denselben
 * Rollen und demselben Protokoll; ein Entwurf hat kein Blatt: Was die Person
 * mitnimmt, ist das, was ihr zugewiesen wurde (ANN-300).
 */
export function PlanblattSeite({ user }: { user: CurrentUser }) {
  const { planId = '' } = useParams();
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: planSchluessel(planId),
    queryFn: () => fetchPlan(planId),
    retry: false,
  });

  if (isPending) return <LoadingState />;
  if (isError) {
    return (
      <>
        <Rueckweg standard="/" />
        <ErrorState
          title="Der Plan konnte nicht geladen werden."
          description="Bitte die Verbindung prüfen und erneut versuchen."
          onErneut={() => refetch()}
        />
      </>
    );
  }
  if (!data || data.status === 'draft') {
    return (
      <>
        <Rueckweg standard="/" />
        <EmptyState
          title="Kein Blatt"
          description="Ein Blatt gibt es erst, wenn der Plan zugewiesen ist."
        />
      </>
    );
  }

  return (
    <>
      <div className="nicht-drucken mx-auto mb-4 flex max-w-[210mm] flex-wrap items-start justify-between gap-x-4">
        <Rueckweg
          standard={planPfad(data.service_area, data.relationship_id, data.id)}
          beschriftung="Zurück zum Plan"
        />
        <Button type="button" onClick={() => window.print()}>
          Drucken oder als PDF sichern
        </Button>
      </div>
      <div className="mx-auto max-w-[210mm]">
        <Planblatt
          plan={data}
          praxis={user.organizationName}
          fuer={`${data.given_name} ${data.family_name}`}
        />
        <div className="nicht-drucken mt-8">
          <Kleingedrucktes>
            Der Druckdialog des Browsers führt zu Papier oder zu einer PDF-Datei. Die Datei entsteht
            auf diesem Gerät; die Anwendung legt sie nicht ab. Aufbewahrt wird der Plan in der
            Anwendung.
          </Kleingedrucktes>
        </div>
      </div>
    </>
  );
}
