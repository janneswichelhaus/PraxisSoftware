import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ErrorState } from '@/components/ui/Feedback';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { Section } from '@/components/ui/Section';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { formatDate } from '@/lib/datum';
import { formatEuro } from '@/lib/geld';
import { mitRueckweg } from '@/lib/rueckweg';
import {
  FAELLIGE_MONATE_SCHLUESSEL,
  MONATSHINDERNIS,
  deleteMonat,
  fetchFaelligeMonate,
  recordMonat,
  type FaelligerMonat,
} from './nachsorge-api';

/**
 * Fällige Abo-Monate des Nachsorge-Abos (ANG-002, ADR-009 Punkt 21).
 *
 * Ein Abo-Monat ist zu seinem Beginn fällig (ANN-270). Erfasst wird er wie
 * jede Leistung von Hand im Büro; danach steht er unter „Erfasst“ und kommt
 * über den Monatsentwurf auf die Rechnung. Ein Monat, der nicht geht, steht
 * mit seinem Grund da – etwa wenn die Behandlung wieder läuft (ANN-271).
 * Ohne Abo bleibt der Abschnitt weg; welche Monate es gibt, entscheidet der
 * Server.
 */
export function FaelligeAbomonate() {
  const monate = useQuery({
    queryKey: FAELLIGE_MONATE_SCHLUESSEL,
    queryFn: fetchFaelligeMonate,
    retry: false,
  });

  if (monate.isPending) return null;
  if (monate.isError) {
    return (
      <Section titel="Nachsorge-Abo">
        <ErrorState
          title="Die Abo-Monate konnten nicht geladen werden."
          description="Bitte die Verbindung prüfen und erneut versuchen."
          onErneut={() => monate.refetch()}
        />
      </Section>
    );
  }
  if (monate.data.length === 0) return null;

  return (
    <Section titel="Nachsorge-Abo" hinweis="Jeder Abo-Monat wird zu seinem Beginn erfasst.">
      <ul className="flex flex-col gap-3">
        {monate.data.map((monat) => (
          <li key={`${monat.subscription_id}-${monat.month_start}`}>
            <MonatKarte monat={monat} />
          </li>
        ))}
      </ul>
    </Section>
  );
}

function MonatKarte({ monat }: { monat: FaelligerMonat }) {
  const queryClient = useQueryClient();
  const erfassen = useMutation({
    mutationFn: () => recordMonat(monat.subscription_id, monat.month_start),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: FAELLIGE_MONATE_SCHLUESSEL });
      await queryClient.invalidateQueries({ queryKey: ['abrechnung-leistungen'] });
    },
  });

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Link
          to={mitRueckweg(`/patienten/${monat.patient_id}/stammdaten`, '/abrechnung/leistungen')}
          className="text-ink text-liste hover:text-accent font-medium underline-offset-2 hover:underline"
        >
          {monat.patient_name}
        </Link>
        <span className="text-ink-muted text-sm tabular-nums">
          {formatDate(monat.month_start)} bis {formatDate(monat.month_end)}
        </span>
        {monat.unit_price_cents !== null ? (
          <span className="text-ink text-sm tabular-nums">
            {formatEuro(monat.unit_price_cents, monat.currency ?? 'EUR')}
          </span>
        ) : null}
        {monat.blocker === null ? (
          <span className="ml-auto">
            <Button
              type="button"
              variant="secondary"
              groesse="kompakt"
              disabled={erfassen.isPending}
              onClick={() => erfassen.mutate()}
            >
              {erfassen.isPending ? 'Wird erfasst …' : 'Abo-Monat erfassen'}
            </Button>
          </span>
        ) : null}
      </div>
      {monat.blocker !== null ? (
        <p className="text-ink-muted mt-1 text-sm">{MONATSHINDERNIS[monat.blocker]}</p>
      ) : null}
      {erfassen.isError ? (
        <Statusmeldung className="mt-2" ton="fehler">
          {erfassen.error.message}
        </Statusmeldung>
      ) : null}
    </Card>
  );
}

/** Die Erfassung eines Abo-Monats zurücknehmen (ANG-002). */
export function AbomonatZuruecknehmen({ leistungId }: { leistungId: string }) {
  const queryClient = useQueryClient();
  const entfernen = useMutation({
    mutationFn: () => deleteMonat(leistungId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['abrechnung-leistungen'] });
      await queryClient.invalidateQueries({ queryKey: FAELLIGE_MONATE_SCHLUESSEL });
    },
  });

  return (
    <Rueckfrage
      ausloeser="Erfassung zurücknehmen"
      bestaetigen="Zurücknehmen"
      bestaetigenLaeuft="Wird zurückgenommen …"
      laeuft={entfernen.isPending}
      fehler={entfernen.isError ? entfernen.error.message : undefined}
      onBestaetigen={() => entfernen.mutateAsync()}
      onAbbrechen={() => entfernen.reset()}
    >
      <p>Der Abo-Monat steht danach wieder unter „Nachsorge-Abo“.</p>
    </Rueckfrage>
  );
}
