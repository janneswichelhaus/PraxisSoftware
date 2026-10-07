import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Section } from '@/components/ui/Section';
import { formatEuro } from '@/lib/geld';
import {
  angeboteSchluessel,
  ladeAngebote,
  ladeMeinePakete,
  paketeSchluessel,
  type MeinPaket,
  type Paketangebote,
  type Plattformzugang,
} from './api';
import { PAKETBEDINGUNGEN, steuerHinweis } from './paketbedingungen';
import { PLATTFORM_PFAD } from './pfade';
import { datum } from './zeit';

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
      <Link
        to={`${PLATTFORM_PFAD}/ich`}
        className="text-ink-muted hover:text-ink mb-4 inline-flex min-h-11 items-center text-sm"
      >
        ← Zu „Ich“
      </Link>
      <h1 className="text-accent text-h3 font-bold">Trainingspaket</h1>
      {pakete.isPending || angebote.isPending ? (
        <LoadingState label="Ihr Paket und die Preise werden geladen …" />
      ) : null}
      {pakete.isError || angebote.isError ? (
        <div className="mt-4">
          <ErrorState
            title="Ihr Paket und die Preise konnten nicht geladen werden."
            description="Bitte die Verbindung prüfen und erneut versuchen."
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
        <p className="text-ink mt-4 text-base leading-relaxed">
          Für diesen Bereich gibt es keine Pakete.
        </p>
      ) : null}
    </>
  );
}

const STAND: Record<MeinPaket['state'], (paket: MeinPaket) => string> = {
  planned: (k) => `Beginnt am ${datum(k.starts_on)}, läuft bis ${datum(k.ends_on)}.`,
  running: (k) => `Läuft seit ${datum(k.starts_on)} bis ${datum(k.ends_on)}.`,
  ended: (k) => `Vom ${datum(k.starts_on)} bis ${datum(k.ends_on)}.`,
};

function MeinePakete({ pakete }: { pakete: MeinPaket[] }) {
  const aktuell = pakete.filter((k) => k.state !== 'ended');
  const frueher = pakete.filter((k) => k.state === 'ended');
  return (
    <Section titel="Ihr Paket" rahmen>
      {aktuell.length === 0 ? (
        <p className="text-ink text-base">Sie haben zurzeit kein Paket.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {aktuell.map((k) => (
            <li key={k.starts_on}>
              <p className="text-ink text-base font-medium">{k.label}</p>
              <p className="text-ink text-base">{STAND[k.state](k)}</p>
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
                {k.label}: {STAND.ended(k)}
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
      <Section titel="Pakete und Preise" rahmen>
        {angebote.offers.length === 0 ? (
          <p className="text-ink text-base">Die Praxis bietet zurzeit keine Pakete an.</p>
        ) : (
          <ul className="divide-line flex flex-col divide-y">
            {angebote.offers.map((a) => (
              <li key={a.code} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
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
          </ul>
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
