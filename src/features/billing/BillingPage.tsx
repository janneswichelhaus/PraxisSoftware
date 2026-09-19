import { PageHeader } from '@/components/ui/PageHeader';
import { Badge, type Ton } from '@/components/ui/Badge';
import { Card, CardGrid, DataList, DataRow } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/Feedback';
import { useVorschau } from '@/features/preview/vorschauContext';
import { OffeneEntscheidung, VorschauBanner } from '@/features/preview/ui';
import { formatDatum, formatEuro } from '@/features/preview/format';
import { rechnungsstandLabels, type Rechnungsstand } from '@/features/preview/types';

/**
 * Abrechnung.
 *
 * Zwei Vorschauen auf denselben Vorgang, wie in ADR-009 und
 * PROJECT_PRINCIPLES.md 19 beschrieben:
 *
 *   Rechnungen  Zustände von Entwurf bis Storno; die Nummer wird erst beim
 *               Ausstellen vergeben
 *   Zahlungen   eigene Transaktionen, Teilzahlungen möglich
 *
 * Diese beiden sind Vorschau und bleiben es bis ABR-EPIC-002a und -003.
 *
 * **Leistungen und Katalog sind es seit ABR-EPIC-001 nicht mehr**: Sie stehen
 * in `ServicesPage.tsx` und `CatalogPage.tsx`, mit echter Datenbank, RLS und
 * Auditspur. Die Abhängigkeit, die die Vorschau sichtbar machen sollte, ist
 * dort umgesetzt statt beschrieben — ohne dokumentierten Termin oder
 * Gebührenanlass entsteht keine Leistung, und einen Override gibt es nicht
 * (PROJECT_PRINCIPLES.md 19).
 */

const rechnungTon: Record<Rechnungsstand, Ton> = {
  entwurf: 'neutral',
  ausgestellt: 'warnung',
  bezahlt: 'positiv',
  storniert: 'kritisch',
};

export function InvoicesPage() {
  const { zustand } = useVorschau();
  const offenCent = zustand.rechnungen
    .filter((rechnung) => rechnung.stand === 'ausgestellt')
    .reduce((summe, rechnung) => summe + rechnung.offenCent, 0);

  return (
    <>
      <PageHeader title="Rechnungen" description="Privatrechnungen und ihre Zustände." />
      <VorschauBanner bereich="Abrechnung" />

      <p className="text-ink-muted mb-4 text-sm">
        Offene Posten: <strong className="text-ink">{formatEuro(offenCent)}</strong>
      </p>

      <CardGrid>
        {zustand.rechnungen.map((rechnung) => (
          <Card key={rechnung.id}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-ink truncate text-[0.9375rem] font-semibold">
                  {rechnung.nummer ?? 'Ohne Nummer'}
                </p>
                <p className="text-ink-muted mt-0.5 text-sm">{formatDatum(rechnung.datum)}</p>
              </div>
              <Badge ton={rechnungTon[rechnung.stand]}>
                {rechnungsstandLabels[rechnung.stand]}
              </Badge>
            </div>
            <DataList>
              <DataRow label="Rechnungsempfänger">{rechnung.empfaenger}</DataRow>
              <DataRow label="Patient:in">{rechnung.patient}</DataRow>
              <DataRow label="Betrag">{formatEuro(rechnung.betragCent)}</DataRow>
              <DataRow label="Offen">{formatEuro(rechnung.offenCent)}</DataRow>
            </DataList>
            {rechnung.stand === 'entwurf' ? (
              <p className="text-ink-subtle mt-2 text-sm">
                Eine Rechnungsnummer wird erst beim Ausstellen vergeben. Ausgestellte Rechnungen
                sind unveränderbar; Korrekturen erfolgen über Storno und Neuausstellung.
              </p>
            ) : null}
          </Card>
        ))}
      </CardGrid>

      <OffeneEntscheidung titel="Patient und Rechnungsempfänger sind getrennt">
        Beide werden als eigene Entitäten geführt – eine Rechnung kann an Eltern, Betreuung oder
        eine Beihilfestelle gehen. Beim Ausstellen werden Stammdaten, Preise und Steuerinformationen
        als historischer Snapshot festgehalten (ADR-009). Nichts davon ist hier umgesetzt.
      </OffeneEntscheidung>
    </>
  );
}

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
