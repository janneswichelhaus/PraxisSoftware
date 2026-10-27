import type { Bildmarkierung } from '@/components/ui/Punktbild';
import { ereignisartTexte } from '@/lib/verlaufsereignisse';
import type { CheckinDaten, Trainingsereignis } from './api';

/** Eine Markierung mit ihrem langen Text für die Liste. */
export interface Verlaufsmarkierung extends Bildmarkierung {
  lang: string;
  /** Ein vermerktes Ereignis; Planwechsel tragen keins. */
  ereignis?: Trainingsereignis;
}

const PLANWECHSEL = {
  plan_assigned: 'Plan zugewiesen',
  plan_version: 'Neue Fassung',
  plan_ended: 'Plan beendet',
} as const;

/** Ereignisse und Planwechsel nach Tag; die Nummer ist die Stelle + 1. */
export function verlaufsmarkierungen(daten: CheckinDaten): Verlaufsmarkierung[] {
  const ereignisse: Verlaufsmarkierung[] = daten.events.map((e) => ({
    datum: e.occurred_on,
    text: ereignisartTexte[e.kind],
    lang: e.note ? `${ereignisartTexte[e.kind]} · ${e.note}` : ereignisartTexte[e.kind],
    ereignis: e,
  }));
  const plaene: Verlaufsmarkierung[] = daten.plan_events.map((p) => ({
    datum: p.occurred_on,
    text: PLANWECHSEL[p.kind],
    lang: `${PLANWECHSEL[p.kind]} · ${p.title}`,
  }));
  // Stabil: am selben Tag erst die vermerkten Ereignisse, dann die Pläne.
  return [...ereignisse, ...plaene].sort((a, b) => a.datum.localeCompare(b.datum));
}
