import type { Plan } from './api';

/**
 * Anzeigende Übungsanalyse (OUT-003, IDEA-OUT-006, ANN-366): je Übung eines
 * Plans, wie oft sie in den **beendeten** Einheiten ganz, teilweise oder gar
 * nicht abgehakt wurde, und die letzten Einheiten nacheinander.
 *
 * Zählen, nicht deuten (ADR-006 Punkte 10, 11, 13; `uebungsanalyse` in
 * `src/app/mdr.ts`): keine Quote als Urteil, keine Ursache („zu schwer“),
 * kein Austauschvorschlag, keine Farbe. Warum eine Übung ausgelassen wird,
 * weiß die Person – gefragt wird beim nächsten Termin.
 */

export type Ausfuehrung = 'ganz' | 'teilweise' | 'ausgelassen';

export interface Uebungszeile {
  itemId: string;
  ganz: number;
  teilweise: number;
  ausgelassen: number;
  /** Die letzten Einheiten, jüngste zuerst, höchstens `ZULETZT`. */
  zuletzt: { tag: string; ausfuehrung: Ausfuehrung }[];
}

export const ZULETZT = 5;

export function ausfuehrung(abgehakt: number, saetze: number): Ausfuehrung {
  if (abgehakt <= 0) return 'ausgelassen';
  return abgehakt >= saetze ? 'ganz' : 'teilweise';
}

export const AUSFUEHRUNG_TEXT: Record<Ausfuehrung, string> = {
  ganz: 'alle Sätze',
  teilweise: 'ein Teil',
  ausgelassen: 'ausgelassen',
};

// ANN-366: nur beendete Einheiten, Zahlen statt Quote.
export function uebungsanalyse(plan: Pick<Plan, 'items' | 'sessions'>): Uebungszeile[] {
  // Die Einheiten kommen jüngste zuerst; nur beendete zählen.
  const beendet = plan.sessions.filter((s) => s.finished_at !== null);
  return plan.items.map((item) => {
    const je = beendet.map((s) => ({
      tag: s.performed_on,
      ausfuehrung: ausfuehrung(s.sets_by_item[item.id] ?? 0, item.sets),
    }));
    return {
      itemId: item.id,
      ganz: je.filter((e) => e.ausfuehrung === 'ganz').length,
      teilweise: je.filter((e) => e.ausfuehrung === 'teilweise').length,
      ausgelassen: je.filter((e) => e.ausfuehrung === 'ausgelassen').length,
      zuletzt: je.slice(0, ZULETZT),
    };
  });
}
