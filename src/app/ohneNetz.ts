import type { OhneNetz } from '@/features/auth/sitzungssperre/Sitzungssperre';
import { plattformOhneNetz } from '@/features/platform/ohneNetz';
import { praxisOhneNetz } from '@/features/offline-documentation/ohneNetz';
import { ABLAGE_FUER_PRAXISKONTEN } from '@/features/offline-documentation/servicePhone';

/**
 * Was die Sitzungssperre ohne Netz für ein Konto öffnet (TRK-009, OFF-003).
 *
 * Ohne Verbindung weiß die Anwendung nicht, ob das Konto eines der Praxis
 * oder der Plattform ist - sie fragt die Ablage: Liegt dort etwas aus der
 * Praxis (Tagesplan, Entwürfe), öffnet sie das, sonst die Übungen. Ein Konto
 * hat nur eins von beidem; die Daten des anderen Teils liegen nie dort.
 */
export function ohneNetzFuer(besitzer: string): OhneNetz {
  const plattform = plattformOhneNetz(besitzer);
  if (!ABLAGE_FUER_PRAXISKONTEN) return plattform;
  const praxis = praxisOhneNetz(besitzer);
  let gewaehlt: OhneNetz = plattform;
  return {
    get einleitung() {
      return gewaehlt.einleitung;
    },
    hatAblage: async () => {
      if (await praxis.hatAblage()) {
        gewaehlt = praxis;
        return true;
      }
      gewaehlt = plattform;
      return plattform.hatAblage();
    },
    ansicht: (sperren) => gewaehlt.ansicht(sperren),
  };
}
