import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/ui/PageHeader';
import { Section } from '@/components/ui/Section';
import { Select } from '@/components/ui/Select';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/Feedback';
import { formatEuro } from '@/lib/geld';
import {
  bereichLabels,
  fetchEinnahmen,
  fetchEinnahmenjahre,
  grundlageErklaerung,
  grundlageLabels,
  nachBereichen,
  steuerLabels,
  type Bereichssumme,
  type Einnahmengrundlage,
  type Einnahmenzeile,
} from './api';

/**
 * Einnahmen je Leistungsart (ABR-011, ADR-009 Punkt 19).
 *
 * Die Seite trennt die Erlöse je Leistungsbereich und schlüsselt sie innerhalb
 * des Bereichs je Steuerkennzeichen und Satz auf. Gerechnet wird
 * ausschließlich aus ausgestellten Rechnungen, Stornodokumenten und gebuchten
 * Zahlungen — der Server tut das, die Seite zeigt es.
 *
 * **Die Grundlage ist nicht vorbelegt**, und das ist die Entscheidung dieser
 * Seite. Zufluss oder Rechnungsstellung ergeben verschiedene Zahlen, und
 * welche die Gewinnermittlung verlangt, entscheidet die Steuerberatung (B9)
 * und nicht die Software. Eine Vorauswahl wäre genau diese Wahl — getroffen
 * von einem Programm, das sie nicht treffen darf. Der Server hält dieselbe
 * Grenze: Er verlangt die Grundlage als Pflichtargument.
 *
 * **Kein steuerlicher Abschluss.** Die Seite zeigt Summen aus Dokumenten. Sie
 * bewertet nichts, ordnet nichts einer Einkunftsart zu und ersetzt keine
 * Gewinnermittlung.
 */
export function RevenuePage() {
  const [grundlage, setGrundlage] = useState<Einnahmengrundlage | ''>('');
  const [jahr, setJahr] = useState<number | null>(null);

  const jahre = useQuery({
    queryKey: ['einnahmen-jahre'],
    queryFn: fetchEinnahmenjahre,
    retry: false,
  });

  // Das jüngste Jahr mit Dokumenten, solange niemand ein anderes gewählt hat.
  // Welchen Zeitraum jemand ansieht, ist keine steuerliche Festlegung — anders
  // als die Grundlage, die deshalb leer bleibt.
  const gewaehltesJahr = jahr ?? jahre.data?.[0] ?? null;

  const einnahmen = useQuery({
    queryKey: ['einnahmen', grundlage, gewaehltesJahr],
    queryFn: () => fetchEinnahmen(grundlage as Einnahmengrundlage, gewaehltesJahr),
    enabled: grundlage !== '',
    retry: false,
  });

  const bereiche = einnahmen.data ? nachBereichen(einnahmen.data) : [];

  return (
    <>
      <PageHeader
        title="Einnahmen je Leistungsart"
        description="Erlöse getrennt nach Leistungsbereich, innerhalb des Bereichs nach Steuerkennzeichen und Satz. Eine Summe, keine Bewertung."
      />

      <Section
        titel="Grundlage und Zeitraum"
        hinweis="Zufluss und Rechnungsstellung ergeben verschiedene Zahlen. Welche Ihre Gewinnermittlung verlangt, sagt Ihnen Ihre Steuerberatung — diese Auswertung wählt sie nicht für Sie."
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <div className="sm:w-72">
            <Select
              label="Grundlage"
              value={grundlage}
              onChange={(e) => setGrundlage(e.target.value as Einnahmengrundlage | '')}
            >
              <option value="">Bitte wählen …</option>
              <option value="cash">{grundlageLabels.cash}</option>
              <option value="accrual">{grundlageLabels.accrual}</option>
            </Select>
          </div>
          <div className="sm:w-48">
            <Select
              label="Jahr"
              value={gewaehltesJahr ?? ''}
              disabled={(jahre.data ?? []).length === 0}
              onChange={(e) => setJahr(Number(e.target.value))}
            >
              {(jahre.data ?? []).length === 0 ? <option value="">—</option> : null}
              {(jahre.data ?? []).map((wert) => (
                <option key={wert} value={wert}>
                  {wert}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {grundlage !== '' ? (
          <p className="text-ink-muted mt-3 max-w-prose text-sm">
            {grundlageErklaerung[grundlage]}
          </p>
        ) : null}
      </Section>

      {jahre.isError ? (
        <ErrorState
          title="Die Auswertung konnte nicht geladen werden."
          description="Bitte später erneut versuchen. Sind Sie noch angemeldet?"
        />
      ) : null}

      {grundlage === '' ? (
        <Section titel="Ergebnis">
          <EmptyState
            title="Noch keine Grundlage gewählt"
            description="Wählen Sie oben Zufluss oder Rechnungsstellung. Ohne Grundlage ist eine Zahl nicht zu lesen — deshalb steht hier keine."
          />
        </Section>
      ) : (
        <Section
          titel={`Ergebnis · ${grundlageLabels[grundlage]} · ${gewaehltesJahr ?? ''}`}
          hinweis="Ausschließlich aus ausgestellten Rechnungen, Stornodokumenten und gebuchten Zahlungen."
        >
          {einnahmen.isPending ? <LoadingState label="Die Auswertung wird geladen …" /> : null}
          {einnahmen.isError ? (
            <ErrorState
              title="Die Auswertung konnte nicht geladen werden."
              description="Bitte später erneut versuchen. Sind Sie noch angemeldet?"
            />
          ) : null}
          {einnahmen.data && bereiche.length === 0 ? (
            <EmptyState
              title="Keine Zahlen in diesem Jahr"
              description="Für den gewählten Zeitraum liegt auf dieser Grundlage kein Dokument und keine Zahlung vor."
            />
          ) : null}

          <div className="flex flex-col gap-6">
            {bereiche.map((bereich) => (
              <Bereichsblock key={bereich.bereich} bereich={bereich} grundlage={grundlage} />
            ))}
          </div>
        </Section>
      )}

      <p className="text-ink-subtle mt-8 max-w-prose text-sm">
        Kein steuerlicher Abschluss: Die Auswertung fasst zusammen, was in ausgestellten Dokumenten
        und gebuchten Zahlungen steht. Sie bewertet nichts und ersetzt keine Gewinnermittlung.
      </p>
    </>
  );
}

function Bereichsblock({
  bereich,
  grundlage,
}: {
  bereich: Bereichssumme;
  grundlage: Einnahmengrundlage;
}) {
  return (
    <Section titel={bereichLabels[bereich.bereich]} ebene={3} rahmen>
      <ul className="divide-line divide-y">
        {bereich.zeilen.map((zeile) => (
          <li key={`${zeile.tax_treatment}-${zeile.tax_rate_permille}-${zeile.currency}`}>
            <Einnahmenposten zeile={zeile} />
          </li>
        ))}
      </ul>

      {/*
        Die Summe steht innerhalb des Bereichs und nie darüber: Eine Zahl über
        beide Bereiche wäre genau die gemischte Größe, die ADR-009 Punkt 19
        verhindert — und auf der die getrennte Gewinnermittlung scheitern
        würde.
      */}
      <div className="border-line mt-3 flex items-baseline justify-between gap-x-3 border-t pt-3">
        <span className="text-ink text-[0.9375rem] font-semibold">
          Summe {bereichLabels[bereich.bereich]} · {grundlageLabels[grundlage]}
        </span>
        <span className="text-ink shrink-0 text-[0.9375rem] font-semibold tabular-nums">
          {formatEuro(bereich.bruttoCent, bereich.currency)}
        </span>
      </div>
      <p className="text-ink-muted mt-1 text-sm">
        darin enthaltene Umsatzsteuer {formatEuro(bereich.steuerCent, bereich.currency)} · netto{' '}
        {formatEuro(bereich.nettoCent, bereich.currency)}
      </p>
    </Section>
  );
}

function Einnahmenposten({ zeile }: { zeile: Einnahmenzeile }) {
  const satz = zeile.tax_rate_permille > 0 ? ` · ${zeile.tax_rate_permille / 10} %` : '';

  return (
    <div className="py-3">
      <div className="flex items-baseline gap-x-3">
        <span className="text-ink text-[0.9375rem] font-medium">
          {steuerLabels[zeile.tax_treatment]}
          {satz}
        </span>
        <span className="text-ink ml-auto shrink-0 text-[0.9375rem] font-medium tabular-nums">
          {formatEuro(zeile.gross_cents, zeile.currency)}
        </span>
      </div>
      <p className="text-ink-muted mt-1 text-sm">
        enthaltene Umsatzsteuer {formatEuro(zeile.tax_cents, zeile.currency)} · netto{' '}
        {formatEuro(zeile.net_cents, zeile.currency)} · {zeile.document_count}{' '}
        {zeile.document_count === 1 ? 'Dokument' : 'Dokumente'}
      </p>
    </div>
  );
}
