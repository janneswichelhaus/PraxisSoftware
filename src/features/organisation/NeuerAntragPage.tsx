import { ListRow, ListRows } from '@/components/ui/ListRow';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { isTherapyStaff, type CurrentUser } from '@/features/session/types';
import { REQUEST_PATH } from '@/features/reimbursements/paths';
import { mitRueckweg } from '@/lib/rueckweg';
import { EINGANG, NEUER_ANTRAG } from './pfade';

interface Wahl {
  titel: string;
  meta: string;
  to: string;
}

/**
 * „Neuer Antrag" (ORG-004, ANN-604): ein Einstieg für alles, was man der
 * Praxis meldet oder bei ihr beantragt. Die Wahl ist der erste Schritt; der
 * Tipp führt in den geführten Ablauf, den es schon gibt (G7, G8, G9, G10,
 * Panne und Check-Up) - mit dem Rückweg hierher.
 *
 * Was eine Rolle nicht kann, steht für sie nicht da - die Radflotte gibt es
 * für die Behandlungsseite. Verbindlich prüft der Server (ADR-004).
 */
export function NeuerAntragPage({ user }: { user: CurrentUser }) {
  const wahlen: Wahl[] = [
    { titel: 'Urlaub', meta: 'Tage wählen, beantragen', to: '/betrieb/urlaub/beantragen' },
    {
      titel: 'Arbeitszeit ändern',
      meta: 'Einmalig oder dauerhaft',
      to: '/betrieb/arbeitszeit/beantragen',
    },
    {
      titel: 'Zeitkonto',
      meta: 'Überstunden oder Freizeitausgleich eintragen',
      to: '/betrieb/zeitkonto/eintragen',
    },
    { titel: 'Erstattung', meta: 'Ladestrom oder Einkauf mit Beleg', to: REQUEST_PATH },
    ...(isTherapyStaff(user.roles)
      ? [
          { titel: 'Panne melden', meta: 'Am Lastenrad', to: '/betrieb/flotte/panne' },
          { titel: 'Check-Up', meta: 'Lastenrad prüfen', to: '/betrieb/flotte/checkup' },
        ]
      : []),
  ];

  return (
    <>
      <Rueckweg standard={EINGANG} />
      <PageHeader title="Neuer Antrag" />
      <ListRows>
        {wahlen.map((wahl) => (
          <ListRow
            key={wahl.to}
            titel={wahl.titel}
            meta={wahl.meta}
            to={mitRueckweg(wahl.to, NEUER_ANTRAG)}
          />
        ))}
      </ListRows>
    </>
  );
}
