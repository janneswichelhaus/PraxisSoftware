import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/Feedback';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { Section } from '@/components/ui/Section';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Textlink } from '@/components/ui/Textlink';
import { VERBINDUNG_PRUEFEN } from '@/components/ui/abfrageTexte';
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
import { Eintraege, Eintrag } from './Eintraege';

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
          description={VERBINDUNG_PRUEFEN}
          onErneut={() => monate.refetch()}
        />
      </Section>
    );
  }
  if (monate.data.length === 0) return null;

  return (
    <Section titel={`Nachsorge-Abo (${monate.data.length})`}>
      <Eintraege beschriftung="Fällige Abo-Monate">
        {monate.data.map((monat) => (
          <MonatZeile key={`${monat.subscription_id}-${monat.month_start}`} monat={monat} />
        ))}
      </Eintraege>
    </Section>
  );
}

/**
 * Ein fälliger Abo-Monat als Zeile (Design-Rollout B6, vorher eine Karte je
 * Monat): Person, Zeitraum und Preis, „Abo-Monat erfassen“ an der Zeile;
 * ein Monat, der nicht geht, nennt seinen Grund darunter.
 */
function MonatZeile({ monat }: { monat: FaelligerMonat }) {
  const queryClient = useQueryClient();
  const erfassen = useMutation({
    mutationFn: () => recordMonat(monat.subscription_id, monat.month_start),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: FAELLIGE_MONATE_SCHLUESSEL });
      await queryClient.invalidateQueries({ queryKey: ['abrechnung-leistungen'] });
    },
  });

  return (
    <Eintrag
      // Der Name führt in die Akte, wo das Abo steht - und wieder hierher
      // zurück; ein Link, der aussieht wie einer (TOK-12).
      titel={
        <Textlink
          to={mitRueckweg(`/patienten/${monat.patient_id}/stammdaten`, '/abrechnung/leistungen')}
        >
          {monat.patient_name}
        </Textlink>
      }
      // Der Preis in der Nebenzeile: Neben der Aktion bliebe dem Namen am
      // Telefon sonst kaum Platz.
      meta={
        <>
          <span className="tabular-nums">
            {formatDate(monat.month_start)} bis {formatDate(monat.month_end)}
          </span>
          {monat.unit_price_cents !== null ? (
            <>
              {' · '}
              <span className="tabular-nums">
                {formatEuro(monat.unit_price_cents, monat.currency ?? 'EUR')}
              </span>
            </>
          ) : null}
        </>
      }
      aktion={
        monat.blocker === null ? (
          <Button
            type="button"
            variant="secondary"
            // Kurz sichtbar, ganz vorgelesen.
            aria-label={erfassen.isPending ? undefined : 'Abo-Monat erfassen'}
            disabled={erfassen.isPending}
            onClick={() => erfassen.mutate()}
          >
            {erfassen.isPending ? 'Wird erfasst …' : 'Erfassen'}
          </Button>
        ) : undefined
      }
    >
      {monat.blocker !== null || erfassen.isError ? (
        <>
          {monat.blocker !== null ? (
            <p className="text-ink-muted text-sm">{MONATSHINDERNIS[monat.blocker]}</p>
          ) : null}
          {erfassen.isError ? (
            <Statusmeldung ton="fehler">{erfassen.error.message}</Statusmeldung>
          ) : null}
        </>
      ) : null}
    </Eintrag>
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
      ausloeserVariante="quiet"
      ausloeserGroesse="kompakt"
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
