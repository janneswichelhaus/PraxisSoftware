import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/Feedback';
import { useVorschau } from '@/features/preview/vorschauContext';
import { OffeneEntscheidung, VorschauBanner } from '@/features/preview/ui';
import { formatDatum, formatEuro } from '@/features/preview/format';

/**
 * Zahlungen — die letzte Vorschau des Abrechnungsbereichs.
 *
 * Zahlungen sind eigene Transaktionen mit Teilzahlungen und Rückzahlungen
 * (ADR-009 Punkt 12); gebaut werden sie mit ABR-EPIC-003. Bis dahin zeigt
 * diese Seite, was der Vorgang später leisten muss, und berührt dafür
 * ausdrücklich keinen Server.
 *
 * **Alles andere im Bereich ist keine Vorschau mehr**: Katalog und Leistungen
 * seit ABR-EPIC-001, Rechnungen, Empfänger und Praxis-Stammdaten seit
 * ABR-EPIC-002a. Sie stehen in eigenen Dateien mit echter Datenbank, RLS und
 * Auditspur.
 */

export function PaymentsPage() {
  const { zustand } = useVorschau();

  return (
    <>
      <PageHeader title="Zahlungen" description="Eingänge, Teilzahlungen und Rückzahlungen." />
      <VorschauBanner bereich="Abrechnung" />

      {zustand.zahlungen.length === 0 ? <EmptyState title="Keine Zahlungen" /> : null}

      <ul className="divide-line border-line divide-y border-y">
        {zustand.zahlungen.map((zahlung) => {
          const rechnung = zustand.rechnungen.find((eintrag) => eintrag.id === zahlung.rechnungId);
          return (
            <li key={zahlung.id} className="flex flex-wrap items-center gap-3 py-3">
              <span className="text-ink w-28 shrink-0 text-sm tabular-nums">
                {formatDatum(zahlung.datum)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="text-ink block text-[0.9375rem] font-medium">
                  {rechnung?.nummer ?? 'Ohne Rechnungsbezug'}
                </span>
                <span className="text-ink-muted mt-0.5 block text-sm">
                  {rechnung?.empfaenger ?? '–'} · {zahlung.art}
                </span>
              </span>
              <span className="text-ink shrink-0 text-[0.9375rem] font-medium tabular-nums">
                {formatEuro(zahlung.betragCent)}
              </span>
            </li>
          );
        })}
      </ul>

      <OffeneEntscheidung titel="Zahlungen sind eigene Transaktionen">
        Teilzahlungen und spätere Rückzahlungen müssen möglich bleiben; der Zahlungsstand ergibt
        sich aus den Transaktionen und wird nicht als Feld auf der Rechnung gepflegt (ADR-009).
        Kassenbuch, TSE und Kartenzahlung sind gesondert zu entscheiden.
      </OffeneEntscheidung>
    </>
  );
}
