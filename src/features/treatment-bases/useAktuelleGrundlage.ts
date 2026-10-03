import { useQuery } from '@tanstack/react-query';
import { canReadTreatmentBases, type CurrentUser } from '@/features/session/types';
import {
  fetchPatientTreatmentBases,
  fetchPatientTreatmentBasisSlots,
  type TreatmentBasis,
  type TreatmentBasisKontingent,
} from './api';

/**
 * Die jüngste Behandlungsgrundlage einer Person mit ihren Zahlen - für die
 * Kachel im Terminbereich und die Karte der Kontextspalte der Akte
 * (Design-Handoff 2026-10-01, Abschnitt 7).
 *
 * Gelesen über die beiden organisatorischen Lesepfade, die Akte und
 * Terminformular schon nutzen (`list_patient_treatment_bases`,
 * `list_patient_treatment_basis_slots`), unter denselben Schlüsseln - kein
 * neuer Lesepfad, nichts Klinisches (ANN-011). „Jüngste" heißt: das späteste
 * Ausstellungsdatum.
 */
export function useAktuelleGrundlage(
  patientId: string,
  user: CurrentUser,
): { grundlage: TreatmentBasis; kontingent: TreatmentBasisKontingent | null } | null {
  const darf = canReadTreatmentBases(user.roles);
  const grundlagen = useQuery({
    queryKey: ['patient-treatment-bases', patientId],
    queryFn: () => fetchPatientTreatmentBases(patientId),
    enabled: darf,
    retry: false,
  });
  const kontingente = useQuery({
    queryKey: ['patient-treatment-basis-slots', patientId],
    queryFn: () => fetchPatientTreatmentBasisSlots(patientId),
    enabled: darf,
    retry: false,
  });

  const liste = grundlagen.data ?? [];
  if (!darf || liste.length === 0) return null;
  const grundlage = liste.reduce((juengste, g) =>
    g.issued_on > juengste.issued_on ? g : juengste,
  );
  const kontingent =
    kontingente.data?.find((zeile) => zeile.treatment_basis_id === grundlage.id) ?? null;
  return { grundlage, kontingent };
}

/** „1 von 6 verbraucht · 4 geplant · 1 frei" - die Zahlen als Satz. */
export function kontingentSatz(kontingent: TreatmentBasisKontingent): string {
  return `${kontingent.used} von ${kontingent.prescribed} verbraucht · ${kontingent.upcoming} geplant · ${kontingent.remaining} frei`;
}

/**
 * Wie die Person abgerechnet wird, als Abzeichen im Kopf (AKTE-007).
 *
 * An der Person gibt es kein Feld für Kostenträger oder Abrechnungsart; die
 * Praxis rechnet privat ab (ADR-009). Was sich unterscheidet, ist die Bauart
 * der Grundlage (ADR-020): Verordnung oder Selbstzahler. Das Abzeichen folgt
 * deshalb der jüngsten Grundlage, über denselben organisatorischen Lesepfad
 * wie der Reiter Behandlungsgrundlagen (ANN-011). Ohne Grundlage kein Abzeichen.
 */
export function versicherungsart(kind: TreatmentBasis['treatment_basis_kind']): string {
  return kind === 'self_pay' ? 'Selbstzahler' : 'Privat · mit Verordnung';
}
