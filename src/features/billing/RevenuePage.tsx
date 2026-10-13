import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/ui/PageHeader';
import { Section } from '@/components/ui/Section';
import { Select } from '@/components/ui/Select';
import { EmptyState, ErrorState } from '@/components/ui/Feedback';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { Kleingedrucktes } from '@/components/ui/Kleingedrucktes';
import { Tile, TileGrid } from '@/components/ui/Tile';
import { VERBINDUNG_PRUEFEN } from '@/components/ui/abfrageTexte';
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
import { Eintraege, Eintrag } from './Eintraege';

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

  return (
    <>
      <PageHeader
        // Der Titel heißt wie der Menüpunkt; was ausgewertet wird, sagt die
        // Zeile darunter (ABR-26).
        title="Auswertung"
        description="Einnahmen je Leistungsart: je Bereich nach Steuerkennzeichen und Satz."
      />

      {/* Die beiden Angaben, ohne die keine Zahl zu lesen ist - nebeneinander
          ab 640 px (DESIGN.md Regel 10). */}
      <Section titel="Grundlage und Zeitraum">
        <div className="grid gap-4 sm:grid-cols-[minmax(0,18rem)_minmax(0,12rem)]">
          <Select
            label="Grundlage"
            value={grundlage}
            onChange={(e) => setGrundlage(e.target.value as Einnahmengrundlage | '')}
          >
            <option value="">Bitte wählen …</option>
            <option value="cash">{grundlageLabels.cash}</option>
            <option value="accrual">{grundlageLabels.accrual}</option>
          </Select>
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

        {grundlage !== '' ? (
          <p className="text-ink-muted mt-3 max-w-prose text-sm">
            {grundlageErklaerung[grundlage]}
          </p>
        ) : null}

        {jahre.isError ? (
          <div className="mt-4">
            <ErrorState
              title="Die Auswertung konnte nicht geladen werden."
              description={VERBINDUNG_PRUEFEN}
              onErneut={() => jahre.refetch()}
            />
          </div>
        ) : null}
      </Section>

      {grundlage === '' ? (
        <Section titel="Ergebnis">
          <EmptyState
            inKarte
            title="Noch keine Grundlage gewählt"
            description="Wählen Sie oben Zufluss oder Rechnungsstellung."
          />
        </Section>
      ) : (
        <Section titel={`Ergebnis · ${grundlageLabels[grundlage]} · ${gewaehltesJahr ?? ''}`}>
          <Abfragezustand
            abfrage={einnahmen}
            laden="Die Auswertung wird geladen …"
            fehler="Die Auswertung konnte nicht geladen werden."
            inKarte
            kacheln={2}
            leer={{
              wenn: (zeilen) => nachBereichen(zeilen).length === 0,
              titel: 'Keine Zahlen in diesem Jahr',
              beschreibung:
                'Für den gewählten Zeitraum liegt auf dieser Grundlage kein Dokument und keine Zahlung vor.',
            }}
          >
            {(zeilen) => <Ergebnis bereiche={nachBereichen(zeilen)} grundlage={grundlage} />}
          </Abfragezustand>
        </Section>
      )}

      {/* Zwei Sätze mit Rechtsfunktion (B9, ADR-009 Punkt 19): Die Wahl der
          Grundlage trifft die Steuerberatung, und die Seite ist kein
          Abschluss. Am Seitenende als Kleingedrucktes (DESIGN.md Regel 6), seit R2-O7
          auf drei Zeilen gekürzt. */}
      <Kleingedrucktes className="mt-8">
        Welche Grundlage Ihre Gewinnermittlung verlangt, sagt Ihre Steuerberatung – diese Auswertung
        wählt sie nicht. Kein steuerlicher Abschluss: eine Summe, keine Bewertung; sie ersetzt keine
        Gewinnermittlung.
      </Kleingedrucktes>
    </>
  );
}

/**
 * Das Ergebnis: oben je Bereich eine Kachel mit seiner Summe, darunter je
 * Bereich die Aufschlüsselung nach Steuerkennzeichen und Satz.
 *
 * Jede Summe steht für genau einen Bereich und nie darüber: Eine Zahl über
 * beide Bereiche wäre genau die gemischte Größe, die ADR-009 Punkt 19
 * verhindert — und auf der die getrennte Gewinnermittlung scheitern würde.
 * Gerechnet wird ausschließlich aus ausgestellten Rechnungen,
 * Stornodokumenten und gebuchten Zahlungen.
 */
function Ergebnis({
  bereiche,
  grundlage,
}: {
  bereiche: Bereichssumme[];
  grundlage: Einnahmengrundlage;
}) {
  return (
    <>
      <TileGrid>
        {bereiche.map((bereich) => (
          <Tile
            key={bereich.bereich}
            label={`Summe ${bereichLabels[bereich.bereich]} · ${grundlageLabels[grundlage]}`}
            zusatz={`darin enthaltene Umsatzsteuer ${formatEuro(bereich.steuerCent, bereich.currency)} · netto ${formatEuro(bereich.nettoCent, bereich.currency)}`}
          >
            <span className="tabular-nums">{formatEuro(bereich.bruttoCent, bereich.currency)}</span>
          </Tile>
        ))}
      </TileGrid>

      {bereiche.map((bereich) => (
        <Section key={bereich.bereich} titel={bereichLabels[bereich.bereich]} ebene={3}>
          <Eintraege beschriftung={`Einnahmen ${bereichLabels[bereich.bereich]}`}>
            {bereich.zeilen.map((zeile) => (
              <Einnahmenposten
                key={`${zeile.tax_treatment}-${zeile.tax_rate_permille}-${zeile.currency}`}
                zeile={zeile}
              />
            ))}
          </Eintraege>
        </Section>
      ))}
    </>
  );
}

function Einnahmenposten({ zeile }: { zeile: Einnahmenzeile }) {
  const satz = zeile.tax_rate_permille > 0 ? ` · ${zeile.tax_rate_permille / 10} %` : '';

  return (
    <Eintrag
      titel={`${steuerLabels[zeile.tax_treatment]}${satz}`}
      meta={`enthaltene Umsatzsteuer ${formatEuro(zeile.tax_cents, zeile.currency)} · netto ${formatEuro(
        zeile.net_cents,
        zeile.currency,
      )} · ${zeile.document_count} ${zeile.document_count === 1 ? 'Dokument' : 'Dokumente'}`}
      betrag={formatEuro(zeile.gross_cents, zeile.currency)}
    />
  );
}
