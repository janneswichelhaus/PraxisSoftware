import type { IntakeChecklist, IntakeItem } from '@/features/patients/intake/api';

/**
 * Wo eine geführte Erstaufnahme steht (Bereichsüberholung „Erstaufnahme
 * geführt“, K10, ANN-542).
 *
 * Nichts davon wird gespeichert: Jeder Schritt liest, was in der Akte schon
 * steht. Verordnungsfoto und Anmeldebogen sind die beiden Punkte der
 * Checkliste (`app.intake_checklist`, ANN-224, ANN-227) und bleiben die
 * einzigen, die als offener Punkt in Übersicht und Büroliste erscheinen.
 * Anamnesebogen und Liege führt nur diese Seite - damit am ersten Besuch
 * nichts vergessen wird, ohne dass sie danach als Mahnung stehen bleiben.
 * Einwilligungen sind freiwillig und haben keinen Zustand „offen“.
 */
export type Schrittstand = 'erledigt' | 'entfaellt' | 'offen';

export interface Erstaufnahmestand {
  verordnung: Schrittstand;
  anmeldebogen: Schrittstand;
  /** `null`: Die Rolle liest keine Fragebögen - der Schritt fehlt. */
  anamnese: Schrittstand | null;
  liege: Schrittstand;
  /** Wie viele der vier Schritte noch offen sind. */
  offen: number;
}

/** Der Anamnesebogen der Bibliothek; jede Fassung zählt (`anamnese_v8` …). */
export function istAnamnese(instrumentId: string): boolean {
  return instrumentId.startsWith('anamnese');
}

function ausCheckliste(checkliste: IntakeChecklist, item: IntakeItem): Schrittstand {
  const state = checkliste.find((punkt) => punkt.item === item)?.state;
  if (state === 'done') return 'erledigt';
  if (state === 'not_needed') return 'entfaellt';
  return 'offen';
}

export function erstaufnahmestand({
  checkliste,
  erhebungen,
  liege,
}: {
  checkliste: IntakeChecklist;
  /** `null`, wenn die Rolle keine Fragebögen lesen darf. */
  erhebungen: readonly { instrument_id: string; status: 'entwurf' | 'abgeschlossen' }[] | null;
  /** `treatment_table_required`: `null` heißt „noch nicht entschieden“. */
  liege: boolean | null;
}): Erstaufnahmestand {
  const stand = {
    verordnung: ausCheckliste(checkliste, 'prescription_photo'),
    anmeldebogen: ausCheckliste(checkliste, 'registration_form'),
    // Auch ein Bogen, den die Person vorab über die Plattform ausgefüllt hat.
    anamnese:
      erhebungen === null
        ? null
        : erhebungen.some((e) => istAnamnese(e.instrument_id) && e.status === 'abgeschlossen')
          ? ('erledigt' as const)
          : ('offen' as const),
    liege: liege === null ? ('offen' as const) : ('erledigt' as const),
  };
  const offen = Object.values(stand).filter((s) => s === 'offen').length;
  return { ...stand, offen };
}

/**
 * Lohnt der Weg in die geführte Erstaufnahme? Ja, solange ein Punkt der
 * Checkliste fehlt oder die Liege nicht entschieden ist. Der Anamnesebogen
 * allein hält den Einstieg nicht offen: Nicht jede Person füllt ihn aus, und
 * ein Hinweis, der nie verschwindet, wird übersehen.
 */
export function erstaufnahmeLohnt(
  offenePunkte: readonly IntakeItem[],
  liege: boolean | null | undefined,
): boolean {
  return offenePunkte.length > 0 || liege === null;
}

export function erstaufnahmePfad(patientId: string, terminId?: string | null): string {
  const basis = `/patienten/${patientId}/erstaufnahme`;
  return terminId ? `${basis}?termin=${encodeURIComponent(terminId)}` : basis;
}
