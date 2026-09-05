import { PageHeader } from '@/components/ui/PageHeader';
import { Badge, type Ton } from '@/components/ui/Badge';
import { Card, CardGrid, DataList, DataRow } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/Feedback';
import { mitarbeiterName, useVorschau } from '@/features/preview/vorschauContext';
import { OffeneEntscheidung, VorschauBanner } from '@/features/preview/ui';
import { formatDatum, formatEuro } from '@/features/preview/format';
import {
  rechnungsstandLabels,
  type Leistungsstand,
  type Rechnungsstand,
} from '@/features/preview/types';

/**
 * Abrechnung.
 *
 * Vier Ansichten auf denselben Vorgang, wie in ADR-009 und
 * PROJECT_PRINCIPLES.md 19 beschrieben:
 *
 *   Leistungen  entstehen aus durchgeführten Terminen und existieren
 *               unabhängig von einer Rechnung
 *   Katalog     versionierte Leistungsarten und Preise
 *   Rechnungen  Zustände von Entwurf bis Storno; die Nummer wird erst beim
 *               Ausstellen vergeben
 *   Zahlungen   eigene Transaktionen, Teilzahlungen möglich
 *
 * Alle vier sind Vorschau. Sichtbar ist vor allem die Abhängigkeit, die den
 * Bau bremst: Ohne finalisierte Dokumentation gibt es keine endgültige
 * Fakturierung, und wie finalisiert wird, ist noch nicht entschieden.
 */

const rechnungTon: Record<Rechnungsstand, Ton> = {
  entwurf: 'neutral',
  ausgestellt: 'warnung',
  bezahlt: 'positiv',
  storniert: 'kritisch',
};

const leistungLabels: Record<Leistungsstand, string> = {
  offen: 'Offen',
  abrechenbar: 'Abrechenbar',
  abgerechnet: 'Abgerechnet',
};

const leistungTon: Record<Leistungsstand, Ton> = {
  offen: 'warnung',
  abrechenbar: 'akzent',
  abgerechnet: 'positiv',
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

export function ServicesPage() {
  const { zustand } = useVorschau();
  const nichtFinalisiert = zustand.leistungen.filter(
    (leistung) => !leistung.dokumentationFinalisiert,
  ).length;

  return (
    <>
      <PageHeader
        title="Leistungen"
        description="Erbrachte Leistungen aus durchgeführten Terminen."
      />
      <VorschauBanner bereich="Abrechnung" />

      {nichtFinalisiert > 0 ? (
        <p className="rounded-card border-warnung/30 bg-warnung-soft text-warnung mb-5 border px-4 py-3 text-sm">
          {nichtFinalisiert} Leistung{nichtFinalisiert === 1 ? '' : 'en'} ohne finalisierte
          Dokumentation. Therapeutische Leistungen sollen erst dann endgültig fakturiert werden;
          berechtigte Ausnahmen müssen begründet und protokolliert werden (PROJECT_PRINCIPLES.md
          19).
        </p>
      ) : null}

      {zustand.leistungen.length === 0 ? <EmptyState title="Keine Leistungen" /> : null}

      <ul className="divide-line border-line divide-y border-y">
        {zustand.leistungen.map((leistung) => {
          const katalog = zustand.katalog.find((eintrag) => eintrag.id === leistung.leistungId);
          return (
            <li key={leistung.id} className="flex flex-wrap items-center gap-3 py-3">
              <span className="text-ink w-28 shrink-0 text-sm tabular-nums">
                {formatDatum(leistung.datum)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="text-ink block truncate text-[0.9375rem] font-medium">
                  {katalog?.bezeichnung ?? 'Unbekannte Leistung'}
                </span>
                <span className="text-ink-muted mt-0.5 block text-sm">
                  {leistung.patient} · {mitarbeiterName(zustand, leistung.mitarbeiterId)}
                  {katalog ? ` · ${formatEuro(katalog.preisCent)}` : ''}
                </span>
              </span>
              {!leistung.dokumentationFinalisiert ? (
                <Badge ton="warnung">Dokumentation offen</Badge>
              ) : null}
              <Badge ton={leistungTon[leistung.stand]}>{leistungLabels[leistung.stand]}</Badge>
            </li>
          );
        })}
      </ul>

      <OffeneEntscheidung titel="Dokumentation vor Fakturierung">
        Diese Abhängigkeit blockiert nicht den Aufbau der Ansichten, wohl aber ihre echte Funktion:
        Wie eine Dokumentation finalisiert wird und wer das darf, ist noch nicht entschieden
        (PROJECT_PRINCIPLES.md 5). Eine Leistung darf außerdem nicht unbeabsichtigt mehrfach
        abgerechnet werden – dafür braucht es die echte Anbindung.
      </OffeneEntscheidung>
    </>
  );
}

export function CatalogPage() {
  const { zustand } = useVorschau();

  return (
    <>
      <PageHeader
        title="Leistungskatalog"
        description="Private Leistungen mit versionierten Preisen."
      />
      <VorschauBanner bereich="Abrechnung" />

      <CardGrid>
        {zustand.katalog.map((leistung) => (
          <Card key={leistung.id}>
            <p className="text-ink text-[0.9375rem] font-semibold">{leistung.bezeichnung}</p>
            <DataList>
              <DataRow label="Preis">{formatEuro(leistung.preisCent)}</DataRow>
              <DataRow label="Dauer">
                {leistung.dauerMinuten > 0 ? `${leistung.dauerMinuten} min` : '–'}
              </DataRow>
              <DataRow label="Version">
                {leistung.version} · gültig ab {formatDatum(leistung.gueltigAb)}
              </DataRow>
            </DataList>
            <p className="text-ink-subtle mt-2 text-sm">{leistung.steuerhinweis}</p>
          </Card>
        ))}
      </CardGrid>

      <OffeneEntscheidung titel="Historische Leistungen ändern sich nicht mit">
        Katalog und Preisvereinbarungen werden versioniert. Eine spätere Preisänderung darf bereits
        erbrachte Leistungen und ausgestellte Rechnungen nicht verändern. Steuerliche Eigenschaften
        werden ausdrücklich je Leistungsversion gespeichert und niemals von einem Sprachmodell
        bestimmt (PROJECT_PRINCIPLES.md 6.2, 19).
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
