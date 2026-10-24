import { useQuery } from '@tanstack/react-query';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/Feedback';
import { ListRows } from '@/components/ui/ListRow';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { Section } from '@/components/ui/Section';
import { VERBINDUNG_PRUEFEN } from '@/components/ui/abfrageTexte';
import { formatEuro } from '@/lib/geld';
import {
  angeboteSchluessel,
  paketeSchluessel,
  type MeinPaket,
  type Paketangebote,
  type Plattformzugang,
} from './api';
import { usePlattformApi } from './einsicht';
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
  const api = usePlattformApi();
  const pakete = useQuery({
    queryKey: paketeSchluessel(zugang.access_id),
    queryFn: () => api.ladeMeinePakete(zugang.access_id),
  });
  const angebote = useQuery({
    queryKey: angeboteSchluessel(zugang.access_id),
    queryFn: () => api.ladeAngebote(zugang.access_id),
  });

  return (
    <>
      <Rueckweg standard={`${PLATTFORM_PFAD}/ich`} beschriftung="Ich" />
      <PageHeader title="Trainingspaket" />
      {pakete.isPending || angebote.isPending ? (
        <LoadingState label="Ihr Paket und die Preise werden geladen …" inKarte />
      ) : null}
      {pakete.isError || angebote.isError ? (
        <div>
          <ErrorState
            title="Ihr Paket und die Preise konnten nicht geladen werden."
            description={VERBINDUNG_PRUEFEN}
            onErneut={() => {
              void pakete.refetch();
              void angebote.refetch();
            }}
          />
        </div>
      ) : null}
      {pakete.data ? <MeinePakete pakete={pakete.data} /> : null}
      {angebote.data ? <Angebote angebote={angebote.data} /> : null}
      {angebote.data === null ? (
        <EmptyState inKarte title="Für diesen Bereich gibt es keine Pakete." />
      ) : null}
    </>
  );
}

function MeinePakete({ pakete }: { pakete: MeinPaket[] }) {
  const aktuell = pakete.filter((k) => k.state !== 'ended');
  const frueher = pakete.filter((k) => k.state === 'ended');
  // Ohne jedes Paket der Leerzustand des Systems, mittig in der Karte wie
  // „Pakete und Preise“ darunter (DESIGN.md 9.17).
  if (aktuell.length === 0 && frueher.length === 0) {
    return (
      <Section titel="Ihr Paket">
        <EmptyState inKarte title="Sie haben zurzeit kein Paket." />
      </Section>
    );
  }
  return (
    <Section titel="Ihr Paket" rahmen>
      {aktuell.length === 0 ? (
        <p className="text-ink text-base">Sie haben zurzeit kein Paket.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {aktuell.map((k) => (
            <li key={k.starts_on}>
              <p className="text-ink text-base font-medium">{k.label}</p>
              <p className="text-ink text-base">{paketStand(k)}</p>
              <p className="text-ink-muted text-base">
                {formatEuro(k.price_cents, k.currency)}, einmal zu Beginn berechnet.
              </p>
            </li>
          ))}
        </ul>
      )}
      {frueher.length > 0 ? (
        <>
          <p className="text-ink-muted mt-4 text-sm font-medium">Frühere Pakete</p>
          <ul className="mt-1 flex flex-col gap-1">
            {frueher.map((k) => (
              <li key={k.starts_on} className="text-ink-muted text-base">
                {k.label}: {paketStand(k)}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </Section>
  );
}

function Angebote({ angebote }: { angebote: Paketangebote }) {
  return (
    <>
      <Section titel="Pakete und Preise">
        {angebote.offers.length === 0 ? (
          <EmptyState inKarte title="Die Praxis bietet zurzeit keine Pakete an." />
        ) : (
          <ListRows>
            {angebote.offers.map((a) => (
              <li
                key={a.code}
                className="border-line flex flex-col gap-1 border-t py-3 first:border-t-0"
              >
                <p className="text-ink text-base font-medium">{a.label}</p>
                <p className="text-ink text-base">
                  <span className="font-medium tabular-nums">
                    {formatEuro(a.price_cents, a.currency)}
                  </span>{' '}
                  für {a.package_months === 1 ? '1 Monat' : `${a.package_months} Monate`}
                </p>
                <p className="text-ink-muted text-sm">
                  {steuerHinweis(angebote.vat_included, a.tax_rate_permille)}
                </p>
              </li>
            ))}
          </ListRows>
        )}
      </Section>
      <Section titel="Bedingungen" rahmen>
        <ul className="text-ink flex list-disc flex-col gap-2 pl-5 text-base leading-relaxed">
          {PAKETBEDINGUNGEN.map((satz) => (
            <li key={satz}>{satz}</li>
          ))}
        </ul>
      </Section>
    </>
  );
}
