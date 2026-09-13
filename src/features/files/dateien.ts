import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { canReadPatientFiles, type CurrentUser } from '@/features/session/types';
import {
  fetchFehlendeDateien,
  fetchLoeschauftraege,
  fetchPatientFiles,
  fetchVerwaisteAnzahl,
  fuehreLoeschauftragAus,
  korrigiereDokumentart,
  ladeDateiHoch,
  loescheDatei,
  merkeVerwaisteZurLoeschungVor,
  type Loeschauftrag,
  type PatientFile,
  type UploadAuftrag,
} from './api';

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

/**
 * Löschen und Dokumentart korrigieren (DAT-002).
 *
 * Beide machen dieselben Abfragen ungültig wie der Upload: Eine korrigierte
 * Art ändert, wer die Datei sieht — die Liste an der Verordnung und die der
 * Akte müssen beide neu geladen werden.
 */
export function useDateiLoeschen(patientId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (fileId: string) => loescheDatei(fileId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['patient-files', patientId] });
      // Ein gelöschtes Objekt erzeugt einen Auftrag; die Übersicht der
      // Praxisinhaber:in zeigt ihn ohne Neuladen der Seite.
      void queryClient.invalidateQueries({ queryKey: ['storage-deletion-orders'] });
    },
  });
}

export function useDokumentartKorrigieren(patientId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ fileId, documentType }: { fileId: string; documentType: string }) =>
      korrigiereDokumentart(fileId, documentType),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['patient-files', patientId] });
    },
  });
}

/**
 * Die offenen Löschaufträge (ADR-017 Punkt 25).
 *
 * Sie stehen in „Aufbewahrung und Löschung" neben dem Löschjournal, weil sie
 * dieselbe Frage von der anderen Seite beantworten: Das Journal sagt, welche
 * Zeile weg ist, der Auftrag, welches Objekt noch nicht.
 */
export function useLoeschauftraege(user: CurrentUser) {
  const darfSehen = user.roles.includes('owner');

  const abfrage = useQuery({
    queryKey: ['storage-deletion-orders'],
    queryFn: () => fetchLoeschauftraege(),
    enabled: darfSehen,
    retry: false,
  });

  return {
    auftraege: abfrage.data ?? [],
    isPending: abfrage.isPending,
    isError: abfrage.isError,
    verborgen: !darfSehen,
  };
}

/**
 * Führt alle offenen Aufträge nacheinander aus.
 *
 * Nacheinander und nicht parallel: Jeder Auftrag spricht mit dem
 * Objektspeicher, und ein halb durchgelaufener Stapel soll nachvollziehbar
 * bleiben. Was scheitert, bleibt offen und steht beim nächsten Aufruf wieder
 * da — es gibt keinen Zustand „in Arbeit", der hängen bleiben könnte.
 */
export function useLoeschauftraegeAusfuehren() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (auftraege: Loeschauftrag[]) => {
      let erledigt = 0;
      const fehler: string[] = [];
      for (const auftrag of auftraege) {
        try {
          await fuehreLoeschauftragAus(auftrag.id);
          erledigt += 1;
        } catch (ursache) {
          fehler.push((ursache as Error).message);
        }
      }
      return { erledigt, fehler };
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['storage-deletion-orders'] });
      void queryClient.invalidateQueries({ queryKey: ['patient-files'] });
    },
  });
}

/**
 * Der Abgleich zwischen Datenbank und Ablage (DAT-003, ADR-017 Punkt 27).
 *
 * Er läuft nicht von allein und meldet sich nicht — er wird gerechnet, wenn
 * jemand „Aufbewahrung und Löschung" öffnet. Einen Benachrichtigungsweg gibt
 * es in dieser Anwendung nicht; deshalb gehört der Abgleich in den monatlichen
 * Bericht (ADR-010 Punkt 6) und nicht in eine stille Warteschlange.
 */
export function useDateiabgleich(user: CurrentUser) {
  const darfSehen = user.roles.includes('owner');

  const fehlende = useQuery({
    queryKey: ['patient-file-reconciliation', 'missing'],
    queryFn: () => fetchFehlendeDateien(),
    enabled: darfSehen,
    retry: false,
  });

  const verwaiste = useQuery({
    queryKey: ['patient-file-reconciliation', 'orphaned'],
    queryFn: () => fetchVerwaisteAnzahl(),
    enabled: darfSehen,
    retry: false,
  });

  return {
    fehlende: fehlende.data ?? [],
    verwaiste: verwaiste.data ?? 0,
    isPending: fehlende.isPending || verwaiste.isPending,
    isError: fehlende.isError || verwaiste.isError,
    verborgen: !darfSehen,
  };
}

export function useVerwaisteVormerken() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => merkeVerwaisteZurLoeschungVor(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['patient-file-reconciliation'] });
      void queryClient.invalidateQueries({ queryKey: ['storage-deletion-orders'] });
    },
  });
}
