import { createPlan, createVersion, fetchPlanliste } from './api';

/**
 * Wohin eine Übung aus der Bibliothek geht (ANN-503): in den Entwurf der
 * Person, sonst in eine neue Fassung des laufenden Plans, sonst in einen
 * neuen Plan. Ein zugewiesener Plan ist eingefroren (ANN-300) - geändert
 * wird er nur über eine neue Fassung, wie auf der Planseite.
 */
export async function planFuerUebung(patientId: string): Promise<string> {
  const liste = await fetchPlanliste('therapy', patientId);
  if (!liste) throw new Error('Die Pläne konnten nicht geladen werden.');
  const entwurf = liste.plans.find((plan) => plan.status === 'draft');
  if (entwurf) return entwurf.id;
  const laufend = liste.plans.find((plan) => plan.status === 'assigned');
  if (laufend) return createVersion(laufend.id);
  return createPlan('therapy', patientId, 'Übungsplan');
}
