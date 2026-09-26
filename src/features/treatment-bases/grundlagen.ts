import { useQuery } from '@tanstack/react-query';
import {
  canReadTreatmentBasisClinical,
  canReadTreatmentBases,
  type CurrentUser,
} from '@/features/session/types';
import {
  fetchPatientTreatmentBases,
  fetchPatientTreatmentBasesClinical,
  fetchPatientTreatmentBasisSlots,
  kontingentJeGrundlage,
  type ClinicalTreatmentBasis,
  type TreatmentBasis,
  type TreatmentBasisKontingent,
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

export type Verordnung = TreatmentBasis | ClinicalTreatmentBasis;

export interface VerordnungMitZahlen {
  verordnung: Verordnung;
  /** `null`, solange die Zahlen noch nicht geladen sind. */
  kontingent: TreatmentBasisKontingent | null;
  zustand: Verordnungszustand;
}

/**
 * Der Zustand einer Verordnung - und damit, welche Aktion überhaupt passt.
 *
 * **ANN-042 ist hier verankert**: Ausgeschöpft ist eine Verordnung, wenn ihre
 * möglichen Termine genutzt sind - nicht nach Ablauf einer Frist. Das
 * Datenmodell kennt kein Ablaufdatum, und die Fristen des Heilmittelkatalogs
 * sind Regeln des GKV-Systems; die Praxis rechnet privat ab. Wer die Regel
 * ändern will, ändert sie hier.
 *
 * Die Unterscheidung läuft über zwei verschiedene Zahlen, und genau das ist
 * der Punkt (ANN-038, seit VER-EPIC-002 beide in Terminen — ANN-064):
 *
 *   * `ausgeschoepft` - die möglichen **Termine** sind genutzt. Die Verordnung
 *     ist Geschichte; sie steht in der Akte, damit nachvollziehbar bleibt, was
 *     behandelt wurde.
 *   * `verplant` - es sind noch Termine offen, aber für jeden steht schon ein
 *     **Eintrag im Kalender**. Hier ist nichts mehr zu planen, wohl aber zu
 *     behandeln.
 *   * `offen` - es lässt sich noch etwas planen.
 *
 * Ohne geladene Zahlen gilt `offen`: Die Akte soll keine Aktion verstecken,
 * weil eine Nebenabfrage langsam ist.
 */
type Verordnungszustand = 'offen' | 'verplant' | 'ausgeschoepft';

function verordnungszustand(kontingent: TreatmentBasisKontingent | null): Verordnungszustand {
  if (!kontingent) return 'offen';
  if (kontingent.used >= kontingent.prescribed) return 'ausgeschoepft';
  return kontingent.remaining > 0 ? 'offen' : 'verplant';
}

/**
 * Welche Grundlage ohne Rückfrage feststeht (BEF-042).
 *
 * Hat die Person genau eine offene Grundlage, ist sie die gemeinte. Hat sie
 * überhaupt nur eine, auch — über das Kontingent hinaus zu planen ist
 * zulässig (CAL-022), die Serienseite sagt dann, was ungedeckt bleibt. In
 * jedem anderen Fall fragt die Seite. Was „offen" heißt, entscheidet
 * `verordnungszustand` (ANN-042) oben, nicht die aufrufende Seite.
 */
export function eindeutigeGrundlage(eintraege: readonly VerordnungMitZahlen[]): string | null {
  const offen = eintraege.filter((eintrag) => eintrag.zustand === 'offen');
  if (offen.length === 1) return offen[0]!.verordnung.id;
  if (eintraege.length === 1) return eintraege[0]!.verordnung.id;
  return null;
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
  /**
   * Die Zahlen sind da. Wer aus dem Zustand eine Entscheidung ableitet statt
   * ihn nur zu zeigen, wartet darauf - ohne Zahlen gilt jede Grundlage als
   * `offen` (BEF-042).
   */
  zahlenGeladen: boolean;
  isError: boolean;
  /** Die Rolle darf Verordnungen überhaupt nicht lesen. */
  verborgen: boolean;
}

export function useVerordnungenDerAkte(patientId: string, user: CurrentUser): VerordnungenDerAkte {
  const klinisch = canReadTreatmentBasisClinical(user.roles);
  const darfLesen = canReadTreatmentBases(user.roles);

  // Welche Felder ankommen, entscheidet die Datenbank über zwei verschiedene
  // Serverfunktionen (ANN-011). Die Oberfläche wählt nur, welche sie fragt -
  // sie blendet nichts aus.
  const verordnungen = useQuery({
    queryKey: klinisch
      ? ['patient-treatment-bases-clinical', patientId]
      : ['patient-treatment-bases', patientId],
    queryFn: () =>
      klinisch
        ? fetchPatientTreatmentBasesClinical(patientId)
        : fetchPatientTreatmentBases(patientId),
    enabled: darfLesen,
    retry: false,
  });

  const kontingente = useQuery({
    queryKey: ['patient-treatment-basis-slots', patientId],
    queryFn: () => fetchPatientTreatmentBasisSlots(patientId),
    enabled: darfLesen,
    retry: false,
  });

  const zahlen = kontingentJeGrundlage(kontingente.data ?? []);
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
    zahlenGeladen: kontingente.isSuccess,
    isError: verordnungen.isError || kontingente.isError,
    verborgen: !darfLesen,
  };
}

/**
 * Was die Deckung einer Grundlage in einem Satz sagt (CAL-022).
 *
 * Eine Zahl allein („4") beantwortet die Frage nicht, die im Alltag gestellt
 * wird: Reicht diese Grundlage für die Termine, die stehen? Deshalb nennt der
 * Satz beide Seiten — was gedeckt ist und was darüber hinausgeht.
 */
export function deckungstext(kontingent: TreatmentBasisKontingent): string {
  if (kontingent.planned === 0) return 'Noch kein Termin zugeordnet';
  if (kontingent.uncovered === 0) {
    return `Alle ${kontingent.planned} zugeordneten Termine sind gedeckt`;
  }
  return (
    `${kontingent.covered} von ${kontingent.planned} zugeordneten Terminen gedeckt · ` +
    `${kontingent.uncovered} ohne Deckung`
  );
}
