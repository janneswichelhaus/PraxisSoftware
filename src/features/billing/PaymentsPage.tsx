import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/ui/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Section } from '@/components/ui/Section';
import { Textlink } from '@/components/ui/Textlink';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/Feedback';
import { formatDate } from '@/lib/datum';
import { formatEuro } from '@/lib/geld';
import { mitRueckweg } from '@/lib/rueckweg';
import { canManageInvoicing, type CurrentUser } from '@/features/session/types';
import { fetchZahlungen, richtungLabels, zahlungswegLabels, type ZahlungMitRechnung } from './api';
import { Zahlungsstorno } from './Zahlungsstorno';

/**
 * Zahlungen (ABR-004).
 *
 * Bis ABR-EPIC-003 war diese Seite die letzte Vorschau des
 * Abrechnungsbereichs. Jetzt führt sie die erfassten Zahlungen: Eingänge,
 * Rückzahlungen und Stornos, jüngste zuerst.
 *
 * **Stornierte Buchungen bleiben stehen.** Eine Liste, aus der eine Buchung
 * verschwindet, erklärt nichts mehr — und genau das Erklären ist der Zweck
 * einer Zahlungsübersicht. Sie steht durchgestrichen da, mit ihrem Grund.
 *
 * Gebucht wird hier nicht: Eine Zahlung gehört zu einer Rechnung, und die
 * Vorgänge stehen dort, wo ihr Gegenstand steht — am offenen Posten auf der
 * Einstiegsseite und an der Rechnung selbst.
 */
export function PaymentsPage({ user }: { user: CurrentUser }) {
  const darfBuchen = canManageInvoicing(user.roles);

  const zahlungen = useQuery({
    queryKey: ['zahlungen'],
    queryFn: fetchZahlungen,
    retry: false,
  });

  return (
    <>
      <PageHeader
        title="Zahlungen"
        description="Eingänge, Teilzahlungen und Rückzahlungen zu ausgestellten Rechnungen."
      />

      <Section titel="Erfasste Zahlungen" rahmen>
        {zahlungen.isPending ? <LoadingState label="Zahlungen werden geladen …" /> : null}
        {zahlungen.isError ? (
          <ErrorState
            title="Die Zahlungen konnten nicht geladen werden."
            description="Bitte die Verbindung prüfen und erneut versuchen."
            onErneut={() => zahlungen.refetch()}
          />
        ) : null}
        {zahlungen.data && zahlungen.data.length === 0 ? (
          <EmptyState
            title="Noch keine Zahlung"
            description="Zahlungen werden am offenen Posten oder an der Rechnung erfasst."
          />
        ) : null}

        <ul className="divide-line divide-y">
          {(zahlungen.data ?? []).map((zahlung) => (
            <li key={zahlung.id} className="py-3">
              <Zahlungszeile zahlung={zahlung} darfBuchen={darfBuchen} />
            </li>
          ))}
        </ul>
      </Section>
    </>
  );
}

function Zahlungszeile({
  zahlung,
  darfBuchen,
}: {
  zahlung: ZahlungMitRechnung;
  darfBuchen: boolean;
}) {
  const storniert = zahlung.voided_at !== null;

  return (
    <>
      {/*
        Datum, Nummer und Betrag in einer Zeile, alles Weitere darunter: Bei
        375 px stand der Empfängername vorher neben der Nummer und hat sie
        mitten im Wort umgebrochen („RG-2026-" / „0001"). Eine Rechnungsnummer
        bricht nicht — sie ist die Kennung, nach der jemand sucht.

        Die Nummer ist ein Link und sieht aus wie einer (ABR-25): unterstrichen,
        in der Hauptfarbe, 44 px hoch. Er nimmt den Rückweg mit, damit „Zurück"
        auf der Rechnung wieder hierher führt (ABR-29).
      */}
      <div className="flex items-center gap-x-3">
        <span className="text-ink-muted w-24 shrink-0 text-sm tabular-nums">
          {formatDate(zahlung.paid_on)}
        </span>
        <Textlink
          to={mitRueckweg(`/abrechnung/rechnungen/${zahlung.invoice_id}`, '/abrechnung/zahlungen')}
          alleinstehend
          className="text-liste font-medium whitespace-nowrap"
        >
          {zahlung.invoice_number ?? 'Rechnung'}
        </Textlink>
        <span
          className={`text-liste ml-auto shrink-0 font-medium tabular-nums ${
            storniert ? 'text-ink-muted line-through' : 'text-ink'
          }`}
        >
          {zahlung.direction === 'refund' ? '−' : ''}
          {formatEuro(zahlung.amount_cents, zahlung.currency)}
        </span>
      </div>

      {zahlung.direction === 'refund' || storniert ? (
        <div className="mt-1 flex flex-wrap gap-2">
          {zahlung.direction === 'refund' ? <Badge ton="warnung">Rückzahlung</Badge> : null}
          {storniert ? <Badge ton="neutral">Storniert</Badge> : null}
        </div>
      ) : null}

      <p className="text-ink-muted mt-1 text-sm">
        {zahlung.recipient_name} · {richtungLabels[zahlung.direction]} ·{' '}
        {zahlungswegLabels[zahlung.method] ?? zahlung.method}
        {zahlung.note ? ` · ${zahlung.note}` : ''}
        {storniert && zahlung.void_reason ? ` · storniert: ${zahlung.void_reason}` : ''}
      </p>

      {darfBuchen && !storniert ? (
        <div className="mt-2">
          <Zahlungsstorno zahlungId={zahlung.id} invoiceId={zahlung.invoice_id} />
        </div>
      ) : null}
    </>
  );
}
