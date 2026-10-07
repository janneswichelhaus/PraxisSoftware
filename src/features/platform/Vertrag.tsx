import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Section } from '@/components/ui/Section';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { formatEuro } from '@/lib/geld';
import {
  ladeVertrag,
  vertragSchluessel,
  vertragWiderrufen,
  type Plattformzugang,
  type Trainingsvertrag,
  type Widerrufseingang,
} from './api';
import { steuerHinweis } from './paketbedingungen';
import { PLATTFORM_PFAD } from './pfade';
import { WIDERRUF_BESTAETIGEN, WIDERRUFEN } from './vertragstexte';
import { datum, uhrzeit } from './zeit';

/**
 * „Ich → Trainingsvertrag" (KND-003, ANN-288).
 *
 * Die Bestätigung des im Konto geschlossenen Vertrags, jederzeit abrufbar und
 * zum Ausdrucken oder Speichern – bis zum Mailversand (B13) der dauerhafte
 * Datenträger nach § 312f Abs. 2 BGB. Den Stand sieht, wer Rechnungen sieht;
 * das sagt der Server.
 *
 * Seit KND-004 mit der Widerrufsfunktion nach § 356a BGB: „Vertrag
 * widerrufen", eine Seite zur Bestätigung mit „Widerruf bestätigen" und sofort
 * der Eingang mit Datum und Uhrzeit. Was danach geschieht – Rückzahlung,
 * Paket –, wickelt die Praxis ab (ANN-290).
 */
export function Vertrag({ zugang }: { zugang: Plattformzugang }) {
  const vertrag = useQuery({
    queryKey: vertragSchluessel(zugang.access_id),
    queryFn: () => ladeVertrag(zugang.access_id),
  });

  return (
    <>
      <Link
        to={`${PLATTFORM_PFAD}/ich`}
        className="text-ink-muted hover:text-ink mb-4 inline-flex min-h-11 items-center text-sm print:hidden"
      >
        ← Zu „Ich“
      </Link>
      <h1 className="text-accent text-h3 font-bold">Trainingsvertrag</h1>
      {vertrag.isPending ? <LoadingState label="Ihr Vertrag wird geladen …" /> : null}
      {vertrag.isError ? (
        <div className="mt-4">
          <ErrorState
            title="Ihr Vertrag konnte nicht geladen werden."
            description="Bitte die Verbindung prüfen und erneut versuchen."
            onErneut={() => vertrag.refetch()}
          />
        </div>
      ) : null}
      {vertrag.data === null ? (
        <p className="text-ink mt-4 text-base leading-relaxed">
          Hier steht kein Vertrag, den Sie in Ihrem Konto geschlossen haben. Einen Vertrag aus der
          Praxis bekommen Sie dort.
        </p>
      ) : null}
      {vertrag.data ? (
        <>
          <Inhalt vertrag={vertrag.data} />
          <Widerruf zugang={zugang} vertrag={vertrag.data} />
        </>
      ) : null}
    </>
  );
}

function Inhalt({ vertrag: v }: { vertrag: Trainingsvertrag }) {
  return (
    <Section titel="Ihre Buchung" rahmen>
      <p className="text-ink text-liste font-medium">{v.label}</p>
      <p className="text-ink mt-1 text-base">
        {datum(v.starts_on)} bis {datum(v.ends_on)}
      </p>
      <p className="text-ink mt-1 text-base">
        {formatEuro(v.price_cents, v.currency)}{' '}
        <span className="text-ink-muted text-sm">
          {steuerHinweis(v.vat_included, v.tax_rate_permille)}, einmal zu Beginn
        </span>
      </p>
      <p className="text-ink-muted mt-2 text-base leading-relaxed">
        Gebucht am {datum(v.concluded_at)} um {uhrzeit(v.concluded_at)} Uhr auf das Angebot vom{' '}
        {datum(v.offered_on)}. Widerrufsbelehrung und Bedingungen in der Fassung {v.wording_version}
        .
        {v.early_start_requested
          ? ' Sie haben verlangt, dass das Training vor dem Ende der Widerrufsfrist beginnt.'
          : ''}
      </p>
      <p className="text-ink-muted mt-2 text-base leading-relaxed">
        {v.released_titles.length > 0 || v.contact_released
          ? `Aus Ihrer Behandlung übernommen: ${[...v.released_titles, ...(v.contact_released ? ['Kontaktdaten'] : [])].join(', ')}.`
          : 'Aus Ihrer Behandlung wurde nichts übernommen.'}
      </p>
      <div className="mt-4 print:hidden">
        <Button variant="secondary" onClick={() => window.print()}>
          Bestätigung drucken
        </Button>
      </div>
    </Section>
  );
}

function Widerruf({ zugang, vertrag: v }: { zugang: Plattformzugang; vertrag: Trainingsvertrag }) {
  const queryClient = useQueryClient();
  const [schritt, setSchritt] = useState<'stand' | 'bestaetigen'>('stand');
  const [eingang, setEingang] = useState<Widerrufseingang | null>(null);
  const widerrufen = useMutation({
    mutationFn: () => vertragWiderrufen(zugang.access_id, v.id),
    onSuccess: async (bestaetigung) => {
      setEingang(bestaetigung);
      await queryClient.invalidateQueries({ queryKey: vertragSchluessel(zugang.access_id) });
    },
  });

  if (eingang) {
    return (
      <div role="status">
        <Section titel="Widerruf eingegangen" rahmen>
          <p className="text-ink text-base leading-relaxed">
            Ihr Widerruf ist am {datum(eingang.withdrawn_at)} um {uhrzeit(eingang.withdrawn_at)} Uhr
            bei der Praxis eingegangen. Er gilt für Ihren Vertrag über „{eingang.label}“ vom{' '}
            {datum(eingang.concluded_at)}.
          </p>
          <p className="text-ink-muted mt-2 text-base leading-relaxed">
            Die Praxis meldet sich wegen der Rückzahlung bei Ihnen. Diese Bestätigung steht auch
            hier unter „Ich“; Sie können sie ausdrucken oder als PDF speichern.
          </p>
          <div className="mt-4 print:hidden">
            <Button variant="secondary" onClick={() => window.print()}>
              Bestätigung drucken
            </Button>
          </div>
        </Section>
      </div>
    );
  }

  if (v.withdrawn_at) {
    return (
      <Section titel="Widerruf" rahmen>
        <p className="text-ink text-base leading-relaxed">
          Sie haben diesen Vertrag am {datum(v.withdrawn_at)} um {uhrzeit(v.withdrawn_at)} Uhr
          widerrufen. Die Praxis meldet sich wegen der Rückzahlung bei Ihnen.
        </p>
      </Section>
    );
  }

  if (!v.can_withdraw) return null;

  if (schritt === 'bestaetigen') {
    return (
      <Section titel="Widerruf bestätigen" rahmen>
        <p className="text-ink text-base leading-relaxed">
          Sie widerrufen Ihren Vertrag über „{v.label}“ vom {datum(v.concluded_at)}. Die Praxis
          zahlt Ihnen Ihre Zahlungen zurück
          {v.early_start_requested
            ? ' – abzüglich eines anteiligen Betrags für Training, das schon stattgefunden hat'
            : ''}
          .
        </p>
        {widerrufen.isError ? (
          <Statusmeldung className="mt-4" ton="fehler">
            {widerrufen.error.message}
          </Statusmeldung>
        ) : null}
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <Button disabled={widerrufen.isPending} onClick={() => widerrufen.mutate()}>
            {widerrufen.isPending ? 'Wird übermittelt …' : WIDERRUF_BESTAETIGEN}
          </Button>
          <Button
            variant="quiet"
            disabled={widerrufen.isPending}
            onClick={() => {
              setSchritt('stand');
              widerrufen.reset();
            }}
          >
            Abbrechen
          </Button>
        </div>
      </Section>
    );
  }

  return (
    <Section titel="Widerruf" rahmen>
      <p className="text-ink text-base leading-relaxed">
        Sie können diesen Vertrag bis zum <strong>{datum(v.withdrawal_ends_on)}</strong> ohne Angabe
        von Gründen widerrufen.
      </p>
      <div className="mt-4">
        <Button variant="secondary" onClick={() => setSchritt('bestaetigen')}>
          {WIDERRUFEN}
        </Button>
      </div>
    </Section>
  );
}
