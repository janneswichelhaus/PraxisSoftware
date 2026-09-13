import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { canReadPatientFiles, type CurrentUser } from '@/features/session/types';
import { fetchPatientFiles, ladeDateiHoch, type PatientFile, type UploadAuftrag } from './api';

/**
 * Die Dateien einer Akte — für die beiden Stellen, die sie zeigen (DAT-001).
 *
 * Der Bereich „Dateien" zeigt alle, die Verordnung nur ihren eigenen Scan.
 * Beide fragen denselben Lesepfad; getrennte Abfrageschlüssel, damit ein
 * Upload an der Verordnung nicht die ganze Aktenliste neu lädt und umgekehrt
 * kein Filter verloren geht.
 *
 * Was ankommt, entscheidet die Datenbank (ADR-004): `list_patient_files`
 * liefert einer Verwaltungsrolle die klinischen Dateien gar nicht erst — nicht
 * ausgegraut und nicht gezählt. Diese Datei blendet nichts aus.
 */

export function dateienSchluessel(patientId: string, prescriptionId?: string | null) {
  return prescriptionId
    ? ['patient-files', patientId, prescriptionId]
    : ['patient-files', patientId];
}

export interface DateienDerAkte {
  dateien: PatientFile[];
  isPending: boolean;
  isError: boolean;
  /** Die Rolle darf Dateien überhaupt nicht lesen. */
  verborgen: boolean;
}

export function useDateien(
  patientId: string,
  user: CurrentUser,
  prescriptionId?: string | null,
): DateienDerAkte {
  const darfLesen = canReadPatientFiles(user.roles);

  const abfrage = useQuery({
    queryKey: dateienSchluessel(patientId, prescriptionId),
    queryFn: () => fetchPatientFiles(patientId, prescriptionId ?? null),
    enabled: darfLesen,
    retry: false,
  });

  return {
    dateien: abfrage.data ?? [],
    isPending: abfrage.isPending,
    isError: abfrage.isError,
    verborgen: !darfLesen,
  };
}

/**
 * Der Upload als Mutation.
 *
 * Nach Erfolg werden **beide** Sichten der Akte ungültig — die Aktenliste und
 * die der Verordnung. Ohne das stünde eine gerade hochgeladene Datei an der
 * einen Stelle und an der anderen nicht; genau dieser Fehler ist mit UX-012
 * schon einmal an der Terminserie aufgetreten.
 */
export function useDateiUpload(patientId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (auftrag: UploadAuftrag) => ladeDateiHoch(auftrag),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['patient-files', patientId] });
    },
  });
}
