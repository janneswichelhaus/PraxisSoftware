import { useQuery } from '@tanstack/react-query';
import {
  canReadPrescriptionClinical,
  canReadPrescriptions,
  type CurrentUser,
} from '@/features/session/types';
import {
  fetchPatientPrescriptions,
  fetchPatientPrescriptionsClinical,
  fetchPatientPrescriptionSlots,
  kontingentJeVerordnung,
  type ClinicalPrescription,
  type Prescription,
  type PrescriptionKontingent,
} from './api';

/**
 * Die Verordnungen einer Akte samt ihrer Zahlen - für alle Stellen, die sie
 * zeigen (AKTE-002).
 *
 * Zwei Lesepfade gehören zusammen: die Verordnung selbst (rollenabhängig
 * projiziert, ADR-004) und ihr Kontingent. Beide werden auf der Übersicht und
 * im Verordnungsbereich gebraucht; ohne eine gemeinsame Stelle stünden
 * dieselben zwei Abfragen zweimal im Code und liefen unter verschiedenen
 * Schlüsseln zweimal über die Leitung.
 */

export type Verordnung = Prescription | ClinicalPrescription;

export interface VerordnungMitZahlen {
  verordnung: Verordnung;
  /** `null`, solange die Zahlen noch nicht geladen sind. */
  kontingent: PrescriptionKontingent | null;
  zustand: Verordnungszustand;
}

/**
 * Der Zustand einer Verordnung - und damit, welche Aktion überhaupt passt.
 *
 * **ANN-042 ist hier verankert**: Ausgeschöpft ist eine Verordnung, wenn ihre
 * Leistungseinheiten genutzt sind - nicht nach Ablauf einer Frist. Das
 * Datenmodell kennt kein Ablaufdatum, und die Fristen des Heilmittelkatalogs
 * sind Regeln des GKV-Systems; die Praxis rechnet privat ab. Wer die Regel
 * ändern will, ändert sie hier.
 *
 * Die Unterscheidung läuft über zwei verschiedene Zahlen, und genau das ist
 * der Punkt (ANN-038):
 *
 *   * `ausgeschoepft` - die verordneten **Leistungseinheiten** sind genutzt.
 *     Die Verordnung ist Geschichte; sie steht in der Akte, damit nachvoll-
 *     ziehbar bleibt, was behandelt wurde.
 *   * `verplant` - es sind noch Einheiten offen, aber für jede steht schon ein
 *     **Termin**. Hier ist nichts mehr zu planen, wohl aber zu behandeln.
 *   * `offen` - es lässt sich noch etwas planen.
 *
 * Ohne geladene Zahlen gilt `offen`: Die Akte soll keine Aktion verstecken,
 * weil eine Nebenabfrage langsam ist.
 */
type Verordnungszustand = 'offen' | 'verplant' | 'ausgeschoepft';

function verordnungszustand(kontingent: PrescriptionKontingent | null): Verordnungszustand {
  if (!kontingent) return 'offen';
  if (kontingent.used >= kontingent.prescribed) return 'ausgeschoepft';
  return kontingent.remaining > 0 ? 'offen' : 'verplant';
}

export const zustandLabels: Record<Verordnungszustand, string> = {
  offen: 'Offen',
  verplant: 'Vollständig verplant',
  ausgeschoepft: 'Ausgeschöpft',
};

interface VerordnungenDerAkte {
  eintraege: VerordnungMitZahlen[];
  aktuell: VerordnungMitZahlen[];
  abgeschlossen: VerordnungMitZahlen[];
  isPending: boolean;
  isError: boolean;
  /** Die Rolle darf Verordnungen überhaupt nicht lesen. */
  verborgen: boolean;
}

export function useVerordnungenDerAkte(patientId: string, user: CurrentUser): VerordnungenDerAkte {
  const klinisch = canReadPrescriptionClinical(user.roles);
  const darfLesen = canReadPrescriptions(user.roles);

  // Welche Felder ankommen, entscheidet die Datenbank über zwei verschiedene
  // Serverfunktionen (ANN-011). Die Oberfläche wählt nur, welche sie fragt -
  // sie blendet nichts aus.
  const verordnungen = useQuery({
    queryKey: klinisch
      ? ['patient-prescriptions-clinical', patientId]
      : ['patient-prescriptions', patientId],
    queryFn: () =>
      klinisch
        ? fetchPatientPrescriptionsClinical(patientId)
        : fetchPatientPrescriptions(patientId),
    enabled: darfLesen,
    retry: false,
  });

  const kontingente = useQuery({
    queryKey: ['patient-prescription-slots', patientId],
    queryFn: () => fetchPatientPrescriptionSlots(patientId),
    enabled: darfLesen,
    retry: false,
  });

  const zahlen = kontingentJeVerordnung(kontingente.data ?? []);
  const eintraege: VerordnungMitZahlen[] = (verordnungen.data ?? []).map((verordnung) => {
    const kontingent = zahlen.get(verordnung.id) ?? null;
    return { verordnung, kontingent, zustand: verordnungszustand(kontingent) };
  });

  return {
    eintraege,
    aktuell: eintraege.filter((eintrag) => eintrag.zustand !== 'ausgeschoepft'),
    abgeschlossen: eintraege.filter((eintrag) => eintrag.zustand === 'ausgeschoepft'),
    // Die Zahlen dürfen nachlaufen: Die Verordnung ist auch ohne sie lesbar,
    // und ein Ladebalken über der ganzen Liste wäre der schlechtere Tausch.
    isPending: verordnungen.isPending,
    isError: verordnungen.isError || kontingente.isError,
    verborgen: !darfLesen,
  };
}
