import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/Feedback';
import { Kleingedrucktes } from '@/components/ui/Kleingedrucktes';
import { Rueckweg } from '@/components/ui/Rueckweg';
import type { CurrentUser } from '@/features/core/session/types';
import { fetchPlan, planPfad, planSchluessel } from './api';
import { Planblatt } from './Planblatt';
import { dayKey } from '@/lib/datum';

/**
 * Der Plan als Blatt aus der Praxis (UEB-008, ANN-303) - unter
 * `…/plaene/:planId/blatt` an Akte und Trainingsverhältnis.
 *
 * Gelesen wird über `get_exercise_plan` wie auf der Planseite, mit denselben
 * Rollen und demselben Protokoll; ein Entwurf hat kein Blatt: Was die Person
 * mitnimmt, ist das, was ihr zugewiesen wurde (ANN-300). Seitentyp
 * „Druckblatt“ (DESIGN.md): Bedienung über dem Blatt, `nicht-drucken`.
 */
export function PlanblattSeite({ user }: { user: CurrentUser }) {
  const { planId = '' } = useParams();
  const abfrage = useQuery({
    queryKey: planSchluessel(planId),
    queryFn: () => fetchPlan(planId),
    retry: false,
  });

  return (
    <Abfragezustand
      abfrage={abfrage}
      laden="Plan wird geladen …"
      fehler="Der Plan konnte nicht geladen werden."
      inKarte
    >
      {(plan) =>
        !plan || plan.status === 'draft' ? (
          <>
            <Rueckweg standard="/" />
            <EmptyState
              inKarte
              title="Kein Blatt"
              description="Ein Blatt gibt es erst, wenn der Plan zugewiesen ist."
            />
          </>
        ) : (
          <>
            <div className="nicht-drucken mx-auto mb-4 flex max-w-[210mm] flex-wrap items-start justify-between gap-x-4">
              <Rueckweg
                standard={planPfad(plan.service_area, plan.relationship_id, plan.id)}
                beschriftung="Zurück zum Plan"
              />
              <Button type="button" onClick={() => window.print()}>
                Drucken oder als PDF sichern
              </Button>
            </div>
            <div className="mx-auto max-w-[210mm]">
              <Planblatt
                plan={plan}
                praxis={user.organizationName}
                fuer={`${plan.given_name} ${plan.family_name}`}
                stand={
                  plan.assigned_at
                    ? dayKey(plan.assigned_at, user.organizationTimeZone ?? 'Europe/Berlin')
                    : null
                }
              />
              <div className="nicht-drucken mt-8">
                <Kleingedrucktes>
                  Der Druckdialog des Browsers führt zu Papier oder zu einer PDF-Datei. Die Datei
                  entsteht auf diesem Gerät; die Anwendung legt sie nicht ab. Aufbewahrt wird der
                  Plan in der Anwendung.
                </Kleingedrucktes>
              </div>
            </div>
          </>
        )
      }
    </Abfragezustand>
  );
}
