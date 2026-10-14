import { useQuery } from '@tanstack/react-query';
import { ListRow, ListRows } from '@/components/ui/ListRow';
import { Section } from '@/components/ui/Section';
import { StatusMark } from '@/components/ui/StatusMark';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { formatDate } from '@/lib/datum';
import { formatEuro } from '@/lib/geld';
import { mitRueckweg } from '@/lib/rueckweg';
import { canManageInvoicing, type CurrentUser } from '@/features/session/types';
import { fetchRechnungenDerAkte, zahlungsstandLabels, type RechnungDerAkte } from './api';

/** Zeichen und Wort je Rechnung: storniert, zu mahnen, überfällig, Zahlungsstand. */
function stand(rechnung: RechnungDerAkte): {
  ton: 'neutral' | 'positiv' | 'warnung';
  text: string;
} {
  if (rechnung.status === 'draft') return { ton: 'neutral', text: 'Entwurf' };
  if (rechnung.cancelled) return { ton: 'neutral', text: 'Storniert' };
  if (rechnung.reminder_due) return { ton: 'warnung', text: 'Zu mahnen' };
  if (rechnung.overdue) return { ton: 'warnung', text: 'Überfällig' };
  if (rechnung.payment_state === 'paid') return { ton: 'positiv', text: 'Bezahlt' };
  return { ton: 'neutral', text: zahlungsstandLabels[rechnung.payment_state] };
}

/**
 * Die Rechnungen der Person in der Akte (B1, BEF-151): was abgerechnet ist,
 * was gezahlt wurde und wo zu mahnen ist - für owner und office (ANN-139).
 * Keine zweite Abrechnung: Jede Zeile führt in die Rechnung, gemahnt und
 * gebucht wird dort.
 */
export function RechnungenDerAkte({
  patientId,
  user,
  hierher,
}: {
  patientId: string;
  user: CurrentUser;
  /** Rückweg aus der Rechnung in die Akte. */
  hierher: string;
}) {
  const darf = canManageInvoicing(user.roles);
  const abfrage = useQuery({
    queryKey: ['patient-invoices', patientId],
    queryFn: () => fetchRechnungenDerAkte(patientId),
    enabled: darf,
    retry: false,
  });
  if (!darf) return null;

  return (
    <Section titel="Rechnungen">
      <Abfragezustand
        abfrage={abfrage}
        laden="Rechnungen werden geladen …"
        fehler="Die Rechnungen konnten nicht geladen werden."
        inKarte
        leer={{ wenn: (liste) => liste.length === 0, titel: 'Noch keine Rechnung' }}
      >
        {(liste) => (
          <ListRows>
            {liste.map((rechnung) => {
              const zeichen = stand(rechnung);
              return (
                <ListRow
                  key={rechnung.id}
                  to={mitRueckweg(`/abrechnung/rechnungen/${rechnung.id}`, hierher)}
                  titel={rechnung.invoice_number ?? 'Entwurf'}
                  meta={[
                    rechnung.issued_on ? `vom ${formatDate(rechnung.issued_on)}` : null,
                    rechnung.total_cents !== null ? formatEuro(rechnung.total_cents) : null,
                    rechnung.last_reminder_on
                      ? `erinnert am ${formatDate(rechnung.last_reminder_on)}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  status={<StatusMark ton={zeichen.ton}>{zeichen.text}</StatusMark>}
                  betrag={
                    rechnung.outstanding_cents > 0 ? (
                      <span>
                        {formatEuro(rechnung.outstanding_cents)}
                        <span className="sr-only"> offen</span>
                      </span>
                    ) : undefined
                  }
                />
              );
            })}
          </ListRows>
        )}
      </Abfragezustand>
    </Section>
  );
}
