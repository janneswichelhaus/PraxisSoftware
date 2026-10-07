import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Section } from '@/components/ui/Section';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { formatEuro } from '@/lib/geld';
import {
  aboKuendigen,
  aboSchluessel,
  KONTEXT_SCHLUESSEL,
  ladeAbo,
  type Kuendigungsbestaetigung,
  type Nachsorgeabo,
  type Plattformzugang,
} from './api';
import { PLATTFORM_PFAD } from './pfade';
import { datum, kalendertag, uhrzeit } from './zeit';

/**
 * „Ich → Nachsorge-Abo" (ANG-003, PROJECT_PRINCIPLES.md 4.6, DSN-001 4.2).
 *
 * Seit wann das Abo läuft, wann die nächste Monatsrechnung kommt und der Knopf
 * „Abo kündigen" – ohne Umweg und ohne Rückhaltedialog. Gebaut nach dem
 * Muster des § 312k BGB (ANN-272): Knopf, eine Seite zur Bestätigung mit dem
 * Datum, an dem das Abo endet, „Jetzt kündigen", sofort die Bestätigung mit
 * Datum und Uhrzeit, zum Ausdrucken oder Speichern. Kündigen dürfen die
 * Person selbst und ihre rechtliche Vertretung (ANN-273); ob der Knopf da
 * ist, sagt der Server.
 */
export function Abo({ zugang }: { zugang: Plattformzugang }) {
  const abo = useQuery({
    queryKey: aboSchluessel(zugang.access_id),
    queryFn: () => ladeAbo(zugang.access_id),
  });

  return (
    <>
      <Link
        to={`${PLATTFORM_PFAD}/ich`}
        className="text-ink-muted hover:text-ink mb-4 inline-flex min-h-11 items-center text-sm print:hidden"
      >
        ← Zu „Ich“
      </Link>
      <h1 className="text-accent text-h3 font-bold">Nachsorge-Abo</h1>
      {abo.isPending ? <LoadingState label="Ihr Abo wird geladen …" /> : null}
      {abo.isError ? (
        <div className="mt-4">
          <ErrorState
            title="Ihr Abo konnte nicht geladen werden."
            description="Bitte die Verbindung prüfen und erneut versuchen."
            onErneut={() => abo.refetch()}
          />
        </div>
      ) : null}
      {abo.data === null ? (
        <p className="text-ink mt-4 text-base leading-relaxed">Sie haben kein Nachsorge-Abo.</p>
      ) : null}
      {abo.data ? <Stand zugang={zugang} abo={abo.data} /> : null}
    </>
  );
}

function Stand({ zugang, abo }: { zugang: Plattformzugang; abo: Nachsorgeabo }) {
  const [bestaetigung, setBestaetigung] = useState<Kuendigungsbestaetigung | null>(null);
  const [schritt, setSchritt] = useState<'stand' | 'bestaetigen'>('stand');

  if (bestaetigung) return <Bestaetigung bestaetigung={bestaetigung} />;
  if (schritt === 'bestaetigen' && abo.state === 'running' && abo.can_cancel) {
    return (
      <Bestaetigen
        zugang={zugang}
        abo={abo}
        onFertig={setBestaetigung}
        onAbbrechen={() => setSchritt('stand')}
      />
    );
  }

  return (
    <>
      <Section titel="Ihr Abo" rahmen>
        <p className="text-ink text-base">
          {abo.state === 'running'
            ? abo.starts_on > kalendertag(new Date())
              ? `Beginnt am ${datum(abo.starts_on)}.`
              : `Läuft seit ${datum(abo.starts_on)}.`
            : abo.state === 'ending'
              ? `Gekündigt. Ihr Abo endet am ${datum(abo.ends_on ?? '')}.`
              : `Beendet am ${datum(abo.ends_on ?? '')}.`}
        </p>
        {abo.state === 'running' && abo.next_month_start ? (
          <p className="text-ink-muted mt-1 text-base">
            Nächste Monatsrechnung ab {datum(abo.next_month_start)}
            {abo.next_month_price_cents !== null
              ? `: ${formatEuro(abo.next_month_price_cents)}`
              : ''}
            .
          </p>
        ) : null}
        {abo.state === 'ending' && abo.cancelled_at ? (
          <p className="text-ink-muted mt-1 text-base">
            Kündigung eingegangen am {datum(abo.cancelled_at)} um {uhrzeit(abo.cancelled_at)} Uhr
            {abo.cancelled_via === 'practice' ? ', eingetragen von der Praxis' : ''}.
          </p>
        ) : null}
        {abo.state !== 'running' ? (
          <p className="text-ink-muted mt-1 text-base">
            Danach können Sie hier noch 30 Tage lesen.
          </p>
        ) : null}
      </Section>
      {abo.state === 'running' ? (
        <Section titel="Kündigen" rahmen>
          <p className="text-ink text-base leading-relaxed">
            Monatlich kündbar, zum Ende des laufenden Abo-Monats.
          </p>
          {abo.can_cancel ? (
            <div className="mt-4">
              <Button variant="secondary" onClick={() => setSchritt('bestaetigen')}>
                Abo kündigen
              </Button>
            </div>
          ) : (
            <p className="text-ink-muted mt-2 text-base">
              Kündigen können {zugang.represented_name ?? 'die Person'} selbst oder die rechtliche
              Vertretung.
            </p>
          )}
        </Section>
      ) : null}
    </>
  );
}

/** Die Seite zur Bestätigung (§ 312k Abs. 2 BGB als Muster). */
function Bestaetigen({
  zugang,
  abo,
  onFertig,
  onAbbrechen,
}: {
  zugang: Plattformzugang;
  abo: Nachsorgeabo;
  onFertig: (bestaetigung: Kuendigungsbestaetigung) => void;
  onAbbrechen: () => void;
}) {
  const queryClient = useQueryClient();
  const kuendigen = useMutation({
    mutationFn: () => aboKuendigen(zugang.access_id, abo.id),
    onSuccess: async (bestaetigung) => {
      onFertig(bestaetigung);
      await queryClient.invalidateQueries({ queryKey: aboSchluessel(zugang.access_id) });
      await queryClient.invalidateQueries({ queryKey: KONTEXT_SCHLUESSEL });
    },
  });
  const fuer = zugang.access_kind === 'self' ? null : zugang.represented_name;

  return (
    <Section titel="Kündigung bestätigen" rahmen>
      <p className="text-ink text-base leading-relaxed">
        {fuer ? `Sie kündigen das Nachsorge-Abo von ${fuer}` : 'Sie kündigen Ihr Nachsorge-Abo'} zum
        nächstmöglichen Zeitpunkt. Es endet am{' '}
        <strong>{datum(abo.cancel_effective_on ?? '')}</strong>. Danach kommt keine Monatsrechnung
        mehr, und Sie können hier noch 30 Tage lesen.
      </p>
      {kuendigen.isError ? (
        <Statusmeldung className="mt-4" ton="fehler">
          {kuendigen.error.message}
        </Statusmeldung>
      ) : null}
      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <Button disabled={kuendigen.isPending} onClick={() => kuendigen.mutate()}>
          {kuendigen.isPending ? 'Wird gekündigt …' : 'Jetzt kündigen'}
        </Button>
        <Button variant="quiet" disabled={kuendigen.isPending} onClick={onAbbrechen}>
          Abbrechen
        </Button>
      </div>
    </Section>
  );
}

/** Die Bestätigung, sofort und zum Ausdrucken oder Speichern (ANN-272). */
function Bestaetigung({ bestaetigung }: { bestaetigung: Kuendigungsbestaetigung }) {
  return (
    <div role="status">
      <Section titel="Kündigung eingegangen" rahmen>
        <p className="text-ink text-base leading-relaxed">
          Ihre Kündigung ist am {datum(bestaetigung.cancelled_at)} um{' '}
          {uhrzeit(bestaetigung.cancelled_at)} Uhr bei der Praxis eingegangen. Ihr Nachsorge-Abo
          endet am <strong>{datum(bestaetigung.ends_on)}</strong>.
        </p>
        <p className="text-ink-muted mt-2 text-base leading-relaxed">
          Diese Bestätigung steht auch hier unter „Ich“. Sie können sie ausdrucken oder als PDF
          speichern.
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
