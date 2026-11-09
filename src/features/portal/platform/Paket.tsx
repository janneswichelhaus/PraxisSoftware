import { useQuery } from '@tanstack/react-query';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Badge, STATUSZEICHEN } from '@/components/ui/Badge';
import { ListRow, ListRows } from '@/components/ui/ListRow';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { Section } from '@/components/ui/Section';
import { formatEuro } from '@/lib/geld';
import {
  angeboteSchluessel,
  paketeSchluessel,
  ladeAngebote,
  ladeMeinePakete,
  type MeinPaket,
  type Paketangebote,
  type Plattformzugang,
} from './api';
import { PAKETBEDINGUNGEN, paketStand, steuerHinweis } from './paketbedingungen';
import { PLATTFORM_PFAD } from './pfade';

/**
 * „Ich → Trainingspaket" (ANG-008, IDEA-ANG-004, PROJECT_PRINCIPLES.md 4.10).
 *
 * Das eigene Paket mit Zeitraum und Preis, darunter alle Pakete der geltenden
 * Preisliste mit Gesamtpreis und den Bedingungen – bevor jemand fragen muss.
 * Abgeschlossen wird in der Praxis (ANN-281); einen Kaufknopf gibt es nicht.
 * Ob ein Zugang das eigene Paket sieht (Recht billing) und ob er Preise sieht
 * (nur Training), sagt der Server.
 */
export function Paket({ zugang }: { zugang: Plattformzugang }) {
  const pakete = useQuery({
    queryKey: paketeSchluessel(zugang.access_id),
    queryFn: () => ladeMeinePakete(zugang.access_id),
  });
  const angebote = useQuery({
    queryKey: angeboteSchluessel(zugang.access_id),
    queryFn: () => ladeAngebote(zugang.access_id),
  });

  return (
    <>
      <Rueckweg standard={`${PLATTFORM_PFAD}/ich`} beschriftung="Ich" />
      <PageHeader title="Trainingspaket" />
      {pakete.isPending || angebote.isPending ? (
        <LoadingState label="Pakete werden geladen …" inKarte />
      ) : null}
      {pakete.isError || angebote.isError ? (
        <div>
          <ErrorState
            title="Pakete nicht geladen."
            onErneut={() => {
              void pakete.refetch();
              void angebote.refetch();
            }}
          />
        </div>
      ) : null}
      {pakete.data ? <MeinePakete pakete={pakete.data} /> : null}
      {angebote.data ? <Angebote angebote={angebote.data} /> : null}
      {angebote.data === null ? <EmptyState markenform title="Keine Trainingspakete" /> : null}
    </>
  );
}

function MeinePakete({ pakete }: { pakete: MeinPaket[] }) {
  const aktuell = pakete.filter((k) => k.state !== 'ended');
  const frueher = pakete.filter((k) => k.state === 'ended');
  // Ohne jedes Paket der Leerzustand des Systems in der Karte, wie „Pakete und Preise“ (DESIGN.md 9.17).
  if (aktuell.length === 0 && frueher.length === 0) {
    return (
      <Section titel="Ihr Paket">
        <EmptyState inKarte title="Zurzeit kein Paket." />
      </Section>
    );
  }
  return (
    <>
      {/* Das eigene Paket oben wie eine Mitgliedschaft: Zustand, Preis, Zeitraum. */}
      {aktuell.length === 0 ? (
        <Section titel="Ihr Paket">
          <p className="text-ink-muted text-base">Zurzeit kein Paket.</p>
        </Section>
      ) : (
        aktuell.map((k) => (
          <section
            key={k.starts_on}
            aria-label="Ihr Paket"
            className="mb-10 flex flex-col items-start gap-2 last:mb-0"
          >
            {k.state === 'planned' ? (
              <Badge ton="neutral" eigenesZeichen={STATUSZEICHEN.wartet}>
                beginnt bald
              </Badge>
            ) : null}
            <p className="text-ink text-liste font-semibold">{k.label}</p>
            <p className="text-ink text-gruss [[data-rechner]_&]:text-gruss-rechner tabular-nums">
              {formatEuro(k.price_cents, k.currency)}
            </p>
            <p className="text-ink-muted text-sm">einmal zu Beginn berechnet</p>
            <p className="text-ink text-base">{paketStand(k)}</p>
          </section>
        ))
      )}
      {frueher.length > 0 ? (
        <Section titel="Frühere Pakete">
          <ul className="flex flex-col gap-1">
            {frueher.map((k) => (
              <li key={k.starts_on} className="text-ink-muted text-base">
                {k.label}: {paketStand(k)}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
    </>
  );
}

function Angebote({ angebote }: { angebote: Paketangebote }) {
  return (
    <>
      <Section titel="Pakete und Preise">
        {angebote.offers.length === 0 ? (
          <EmptyState inKarte title="Zurzeit keine Pakete." />
        ) : (
          <ListRows rahmen beschriftung="Pakete und Preise">
            {angebote.offers.map((a) => (
              <ListRow
                key={a.code}
                titel={a.label}
                meta={`${a.package_months === 1 ? '1 Monat' : `${a.package_months} Monate`} · ${steuerHinweis(angebote.vat_included, a.tax_rate_permille)}`}
                betrag={formatEuro(a.price_cents, a.currency)}
              />
            ))}
          </ListRows>
        )}
      </Section>
      <Section titel="Bedingungen">
        <ul className="text-ink flex list-disc flex-col gap-2 pl-5 text-base leading-relaxed">
          {PAKETBEDINGUNGEN.map((satz) => (
            <li key={satz}>{satz}</li>
          ))}
        </ul>
      </Section>
    </>
  );
}
