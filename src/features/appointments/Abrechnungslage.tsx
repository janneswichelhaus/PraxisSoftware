import { useQuery } from '@tanstack/react-query';
import { DetailRow } from '@/components/ui/DetailList';
import { Textlink } from '@/components/ui/Textlink';
import { formatDate } from '@/lib/datum';
import { formatEuro } from '@/lib/geld';
import { empfaengerartLabels } from '@/features/billing/api';
import { grundlageBezeichnung } from '@/features/treatment-bases/api';
import { fetchAbrechnungslage, positionText, type Abrechnungslage } from './abrechnungslage-api';

function OffeneRechnungen({ lage }: { lage: Abrechnungslage }) {
  const anzahl = lage.open_invoice_count ?? 0;
  if (anzahl === 0) return <>keine</>;
  return (
    <span className="flex flex-wrap items-center gap-x-2">
      <span>
        {anzahl === 1 ? '1 Rechnung' : `${anzahl} Rechnungen`},{' '}
        {formatEuro(lage.open_outstanding_cents ?? 0)} offen
        {lage.open_overdue ? ' – davon überfällig' : ''}
      </span>
      <Textlink alleinstehend className="text-sm" to="/abrechnung">
        Zu den offenen Posten
      </Textlink>
    </span>
  );
}

/**
 * Zeilen für die Termindaten (PRX-008): Position in der Grundlage, für owner
 * und office dazu Empfänger und offene Rechnungen (ANN-139).
 *
 * Ohne eigenen Abschnitt: Die Angaben gehören zum Termin wie Art und Status.
 * Lädt der Stand nicht, fehlen die Zeilen - der Termin bleibt bedienbar, und
 * die Deckung steht weiter darunter.
 */
export function Abrechnungslage({ appointmentId }: { appointmentId: string }) {
  const { data } = useQuery({
    // Unter dem Schlüssel des Termins: Was den Termin neu lädt, lädt auch dies.
    queryKey: ['appointment', appointmentId, 'abrechnungslage'],
    queryFn: () => fetchAbrechnungslage(appointmentId),
    retry: false,
  });

  if (!data) return null;
  const position = positionText(data);
  const grundlage =
    data.treatment_basis_kind && data.treatment_basis_issued_on
      ? (() => {
          const { bauart, praeposition } = grundlageBezeichnung({
            treatment_basis_kind: data.treatment_basis_kind,
          });
          return `${bauart} ${praeposition} ${formatDate(data.treatment_basis_issued_on)}`;
        })()
      : null;

  return (
    <>
      <DetailRow label="Grundlage">
        {grundlage ? (
          <>
            {position ? <span className="font-semibold">{position}</span> : null}
            {position ? ' · ' : null}
            {grundlage}
          </>
        ) : (
          'Keine Behandlungsgrundlage zugeordnet'
        )}
      </DetailRow>
      {data.billing_visible ? (
        <>
          <DetailRow label="Rechnung an">
            {empfaengerartLabels[data.recipient_kind ?? 'self'] ?? data.recipient_kind}
          </DetailRow>
          <DetailRow label="Offene Rechnungen">
            <OffeneRechnungen lage={data} />
          </DetailRow>
        </>
      ) : null}
    </>
  );
}
