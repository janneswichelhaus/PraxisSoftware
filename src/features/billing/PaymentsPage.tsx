import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/ui/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Section } from '@/components/ui/Section';
import { Textlink } from '@/components/ui/Textlink';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { Datenliste, type Datenspalte } from '@/components/ui/Datenliste';
import { formatDate } from '@/lib/datum';
import { formatEuro } from '@/lib/geld';
import { mitRueckweg } from '@/lib/rueckweg';
import { canManageInvoicing, type CurrentUser } from '@/features/core/session/types';
import { fetchZahlungen, richtungLabels, zahlungswegAnzeige, type ZahlungMitRechnung } from './api';
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
function zahlungsHinweis(gezeigt: number, gesamt: number | undefined): string {
  const alle = gesamt ?? gezeigt;
  if (gezeigt < alle) return `Die ${gezeigt} neuesten von ${alle} Zahlungen`;
  return alle === 1 ? 'Eine Zahlung' : `${alle} Zahlungen`;
}

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

      <Section
        titel="Erfasste Zahlungen"
        // Gekürzt sagt die Liste es (ABR-034, BEF-061 Option 1): Bis hierher
        // endete sie stumm bei 100 Zahlungen.
        hinweis={
          zahlungen.data && zahlungen.data.length > 0
            ? zahlungsHinweis(zahlungen.data.length, zahlungen.data[0]!.total_count)
            : undefined
        }
      >
        <Abfragezustand
          abfrage={zahlungen}
          laden="Zahlungen werden geladen …"
          fehler="Die Zahlungen konnten nicht geladen werden."
          inKarte
          leer={{
            wenn: (liste) => liste.length === 0,
            titel: 'Noch keine Zahlung',
            beschreibung: 'Zahlungen werden am offenen Posten oder an der Rechnung erfasst.',
          }}
        >
          {(liste) => (
            // Die Datenliste nach dem Vorbild der Rechnungsliste (ABR-034):
            // ab 1024 px Spalten, darunter Nummer und Betrag oben, der Rest
            // darunter.
            <Datenliste
              beschriftung="Erfasste Zahlungen"
              zeilen={liste}
              schluessel={(zahlung) => zahlung.id}
              spalten={zahlungsspalten(darfBuchen)}
            />
          )}
        </Abfragezustand>
      </Section>
    </>
  );
}

function zahlungsspalten(darfBuchen: boolean): Datenspalte<ZahlungMitRechnung>[] {
  return [
    {
      titel: 'Rechnung',
      breite: '10rem',
      telefon: 'kopf',
      // Die Nummer ist ein Link und sieht aus wie einer (ABR-25),
      // unterstrichen, 44 px hoch, und bricht nicht um - sie ist die Kennung,
      // nach der jemand sucht. Sie nimmt den Rückweg mit, damit „Zurück" auf
      // der Rechnung wieder hierher führt (ABR-29).
      inhalt: (zahlung) => (
        <Textlink
          to={mitRueckweg(`/abrechnung/rechnungen/${zahlung.invoice_id}`, '/abrechnung/zahlungen')}
          alleinstehend
          className="text-liste font-medium whitespace-nowrap"
        >
          {zahlung.invoice_number ?? 'Rechnung'}
        </Textlink>
      ),
    },
    {
      titel: 'Zahlung',
      inhalt: (zahlung) => <Zahlungsangaben zahlung={zahlung} darfBuchen={darfBuchen} />,
    },
    {
      titel: 'Betrag',
      breite: '8rem',
      rechts: true,
      telefon: 'ende',
      inhalt: (zahlung) => (
        <span className={zahlung.voided_at !== null ? 'text-ink-muted line-through' : undefined}>
          {zahlung.direction === 'refund' ? '−' : ''}
          {formatEuro(zahlung.amount_cents, zahlung.currency)}
        </span>
      ),
    },
  ];
}

/**
 * Tag, Empfänger, Richtung und Weg einer Zahlung, dazu Rückzahlung und
 * Storno als Zeichen und Wort - und der Weg, sie zu stornieren.
 */
function Zahlungsangaben({
  zahlung,
  darfBuchen,
}: {
  zahlung: ZahlungMitRechnung;
  darfBuchen: boolean;
}) {
  const storniert = zahlung.voided_at !== null;

  return (
    <>
      <p className="text-ink-muted text-sm">
        <span className="tabular-nums">{formatDate(zahlung.paid_on)}</span> ·{' '}
        {zahlung.recipient_name} · {richtungLabels[zahlung.direction]} ·{' '}
        {zahlungswegAnzeige[zahlung.method] ?? zahlung.method}
        {zahlung.note ? ` · ${zahlung.note}` : ''}
        {storniert && zahlung.void_reason ? ` · storniert: ${zahlung.void_reason}` : ''}
      </p>

      {zahlung.direction === 'refund' || storniert ? (
        <div className="mt-1 flex flex-wrap gap-2">
          {zahlung.direction === 'refund' ? <Badge ton="warnung">Rückzahlung</Badge> : null}
          {storniert ? <Badge ton="neutral">Storniert</Badge> : null}
        </div>
      ) : null}

      {darfBuchen && !storniert ? (
        <div className="mt-1">
          <Zahlungsstorno zahlungId={zahlung.id} invoiceId={zahlung.invoice_id} />
        </div>
      ) : null}
    </>
  );
}
