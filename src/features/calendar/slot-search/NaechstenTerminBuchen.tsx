import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import {
  AufDerPlattformSichtbar,
  cancelAppointment,
  fetchAppointment,
  tageslageNeuLaden,
  undoAppointmentCreation,
} from '@/features/calendar/appointments';
import { formatDate } from '@/lib/datum';
import { kalenderZumTermin } from '@/lib/termin';
import {
  bucheNaechstenTermin,
  type Buchungsauftrag,
  type GebuchterTermin,
} from './auto-booking-api';

/** Was neben der Tageslage einen neuen oder zurückgenommenen Termin zeigt. */
const TERMINABFRAGEN = [
  ['patient-upcoming-appointments'],
  ['patient-appointments'],
  ['free-slots'],
] as const;

const WOCHENTAG = new Intl.DateTimeFormat('de-DE', { weekday: 'short', timeZone: 'UTC' });

function terminzeile(termin: GebuchterTermin): string {
  const tag = `${WOCHENTAG.format(new Date(`${termin.datum}T00:00:00Z`))} ${formatDate(termin.datum)}`;
  return `${tag}, ${termin.beginn}–${termin.ende} Uhr · ${termin.name ?? 'Therapeut:in'}`;
}

/** Sieht die Person den Termin auf der Plattform, lässt er sich nur absagen (ANN-534). */
interface Absagefrage {
  readonly id: string;
  readonly stand: string;
}

/**
 * „Nächsten passenden Termin buchen“ (ANN-865): ein Tipp, der Server wählt den frühesten Platz, an
 * dem die Wege aufgehen, und bucht ihn. Danach steht der Termin da, mit dem Weg in den Kalender und
 * „Rückgängig“; ein Nachrücker der Warteliste lässt sich nur im Kalender absagen.
 */
export function NaechstenTerminBuchen({ auftrag }: { auftrag: Buchungsauftrag }) {
  const queryClient = useQueryClient();
  const [zurueckgenommen, setZurueckgenommen] = useState<'nein' | 'geloescht' | 'abgesagt'>('nein');
  const [absagefrage, setAbsagefrage] = useState<Absagefrage | null>(null);

  async function neuLaden() {
    await Promise.all([
      tageslageNeuLaden(queryClient),
      ...TERMINABFRAGEN.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
    ]);
    // Die Warteliste gilt als veraltet, lädt hier aber nicht neu: Die Suche bliebe sonst nicht stehen.
    await queryClient.invalidateQueries({ queryKey: ['waitlist'], refetchType: 'none' });
  }

  const buchen = useMutation({
    mutationFn: () => bucheNaechstenTermin(auftrag),
    onMutate: () => {
      setZurueckgenommen('nein');
      setAbsagefrage(null);
    },
    onSuccess: async (ergebnis) => {
      if (ergebnis.art === 'gebucht' || ergebnis.art === 'unklar') await neuLaden();
    },
  });

  async function fort(art: 'geloescht' | 'abgesagt') {
    await neuLaden();
    buchen.reset();
    setAbsagefrage(null);
    setZurueckgenommen(art);
  }

  const zuruecknehmen = useMutation({
    mutationFn: async (id: string): Promise<Absagefrage | null> => {
      const jetzt = await fetchAppointment(id);
      if (!jetzt) throw new Error('Den Termin gibt es nicht mehr.');
      try {
        await undoAppointmentCreation(id, jetzt.updated_at);
        return null;
      } catch (fehler) {
        if (!(fehler instanceof AufDerPlattformSichtbar)) throw fehler;
        return { id, stand: jetzt.updated_at };
      }
    },
    onSuccess: async (frage) => {
      if (frage) setAbsagefrage(frage);
      else await fort('geloescht');
    },
  });

  // Als Praxis, ohne Gebühr; die Person sieht die Absage (ADR-018 Punkt 2).
  const absagen = useMutation({
    mutationFn: (frage: Absagefrage) =>
      cancelAppointment(frage.id, frage.stand, 'practice_request'),
    onSuccess: () => fort('abgesagt'),
  });

  const ergebnis = buchen.data;
  const gebucht = ergebnis?.art === 'gebucht' ? ergebnis.termin : null;

  return (
    <div className="mt-6">
      {gebucht ? (
        <>
          <Statusmeldung ton="erfolg" className="text-liste font-semibold">
            Gebucht: {terminzeile(gebucht)}
          </Statusmeldung>
          {gebucht.gebiet === 'outside' ? (
            <p className="mt-2">
              <Badge ton="warnung">Außerhalb des Gebietstags</Badge>
            </p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <ButtonLink to={kalenderZumTermin(gebucht.id)} variant="secondary" groesse="kompakt">
              Im Kalender ansehen
            </ButtonLink>
            {auftrag.waitlistId || absagefrage ? null : (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  groesse="kompakt"
                  disabled={buchen.isPending || zuruecknehmen.isPending}
                  onClick={() => buchen.mutate()}
                >
                  {buchen.isPending ? 'Wird gebucht …' : 'Weiteren Termin buchen'}
                </Button>
                <Button
                  type="button"
                  variant="quiet"
                  groesse="kompakt"
                  disabled={buchen.isPending || zuruecknehmen.isPending}
                  onClick={() => zuruecknehmen.mutate(gebucht.id)}
                >
                  {zuruecknehmen.isPending ? 'Wird zurückgenommen …' : 'Rückgängig'}
                </Button>
              </>
            )}
          </div>
          {zuruecknehmen.isError ? (
            <Statusmeldung ton="fehler" className="mt-2">
              {zuruecknehmen.error.message}
            </Statusmeldung>
          ) : null}
          {absagefrage ? (
            <div
              role="group"
              aria-label="Termin absagen"
              className="border-line-strong bg-surface-sunken mt-3 border-l-4 py-3 pr-4 pl-4"
            >
              <p className="text-ink text-sm">Die Person sieht Termin und Absage</p>
              {absagen.isError ? (
                <Statusmeldung ton="fehler" className="mt-2">
                  {absagen.error.message}
                </Statusmeldung>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-3">
                <Button
                  type="button"
                  disabled={absagen.isPending}
                  onClick={() => absagen.mutate(absagefrage)}
                >
                  {absagen.isPending ? 'Wird abgesagt …' : 'Termin absagen'}
                </Button>
                <Button
                  type="button"
                  variant="quiet"
                  disabled={absagen.isPending}
                  onClick={() => {
                    setAbsagefrage(null);
                    absagen.reset();
                  }}
                >
                  Behalten
                </Button>
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <>
          <Button
            type="button"
            className="w-full sm:w-auto"
            disabled={buchen.isPending}
            onClick={() => buchen.mutate()}
          >
            {buchen.isPending ? 'Wird gebucht …' : 'Nächsten passenden Termin buchen'}
          </Button>
          {zurueckgenommen === 'nein' ? null : (
            <Statusmeldung ton="erfolg" className="mt-2">
              {zurueckgenommen === 'abgesagt' ? 'Termin abgesagt.' : 'Termin zurückgenommen.'}
            </Statusmeldung>
          )}
          {ergebnis?.art === 'kein_platz' ? (
            <Statusmeldung ton="warnung" className="mt-2">
              {ergebnis.ungeprueft > 0
                ? 'Kein passender Platz · Wege teils nicht prüfbar'
                : 'Kein passender Platz'}
            </Statusmeldung>
          ) : null}
          {ergebnis?.art === 'nichts_gebucht' ? (
            <Statusmeldung ton="fehler" className="mt-2">
              {ergebnis.satz}
            </Statusmeldung>
          ) : null}
          {ergebnis?.art === 'unklar' ? (
            <Statusmeldung ton="warnung" className="mt-2">
              {ergebnis.satz}
            </Statusmeldung>
          ) : null}
        </>
      )}
    </div>
  );
}
