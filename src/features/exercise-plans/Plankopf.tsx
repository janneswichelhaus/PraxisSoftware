import type { ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Badge } from '@/components/ui/Badge';
import { Objektkopf } from '@/components/ui/Objektkopf';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { leseRueckweg, rueckwegBeschriftung } from '@/lib/rueckweg';
import { verhaeltnisPfad, type Plan } from './api';
import { haeufigkeit } from './dosierung';
import { laufzeitStand } from './laufzeit';

/**
 * Der Kopf eines Plans (Welle B, Seitentyp „Objekt“): Titel, Person, Art und
 * Häufigkeit; ein Abzeichen nur, wo der Plan vom Regelfall abweicht
 * (Entwurf, läuft aus, abgelaufen, beendet, abgelöst).
 */
function marke(plan: Plan): ReactNode {
  switch (plan.status) {
    case 'draft':
      return <Badge>Entwurf</Badge>;
    case 'ended':
      return <Badge>beendet</Badge>;
    case 'superseded':
      return <Badge>abgelöst</Badge>;
    case 'assigned': {
      if (!plan.runs_until) return null;
      const stand = laufzeitStand(plan.runs_until, plan.today, plan.review_due);
      if (stand === 'abgelaufen') return <Badge ton="warnung">abgelaufen</Badge>;
      if (stand === 'laeuft_aus') return <Badge ton="warnung">läuft aus</Badge>;
      return null;
    }
  }
}

export function Plankopf({
  plan,
  aktionen,
  hinweise,
  mitMarke = true,
}: {
  plan: Plan;
  aktionen?: ReactNode;
  hinweise?: ReactNode;
  /** Ohne Abzeichen, wenn eine `Warnzeile` dasselbe schon sagt. */
  mitMarke?: boolean;
}) {
  const [suche] = useSearchParams();
  const name = `${plan.given_name} ${plan.family_name}`;
  const standard = verhaeltnisPfad(plan);
  const ziel = leseRueckweg(suche, standard);
  const art = plan.service_area === 'therapy' ? 'Übungsplan' : 'Trainingsplan';
  return (
    <>
      <Rueckweg standard={standard} beschriftung={name} className="mb-3 max-sm:hidden" />
      <Objektkopf
        titel={plan.title}
        rueckweg={{
          to: ziel,
          beschriftung: ziel === standard ? `Zurück zu ${name}` : rueckwegBeschriftung(ziel),
        }}
        meta={[name, art, plan.sessions_per_week ? haeufigkeit(plan.sessions_per_week) : null]
          .filter(Boolean)
          .join(' · ')}
        status={mitMarke ? marke(plan) : null}
        aktionen={aktionen}
        hinweise={hinweise}
      />
    </>
  );
}
