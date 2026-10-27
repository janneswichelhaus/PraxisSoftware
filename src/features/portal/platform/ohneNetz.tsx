import type { OhneNetz } from '@/features/core/auth/sitzungssperre/Sitzungssperre';
import { abgelegteZugaenge, wartendeEinheiten } from './ablage';
import { LokaleUebungen } from './LokaleUebungen';

/**
 * Was die Sitzungssperre ohne Netz öffnen kann - für ein Plattformkonto die
 * abgelegten Pläne und die Warteschlange.
 */
export function plattformOhneNetz(besitzer: string): OhneNetz {
  return {
    hatAblage: async () =>
      (await abgelegteZugaenge(besitzer)).length > 0 ||
      (await wartendeEinheiten(besitzer)).length > 0,
    ansicht: (sperren) => <LokaleUebungen besitzer={besitzer} onSperren={sperren} />,
  };
}
