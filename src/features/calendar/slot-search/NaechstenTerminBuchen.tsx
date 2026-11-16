import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Rueckfragekasten } from '@/components/ui/Rueckfrage';
import { Rueckmeldung } from '@/components/ui/Rueckmeldung';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import {
  AufDerPlattformSichtbar,
  cancelAppointment,
  fetchAppointment,
  tageslageNeuLaden,
  undoAppointmentCreation,
} from '@/features/calendar/appointments';
import { formatDate } from '@/lib/datum';
import { mitRueckweg } from '@/lib/rueckweg';
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

/** Solange diese Buchung läuft, startet die Seite keine neue Suche: Ihr Ergebnis ginge sonst verloren. */
export const BUCHUNG_LAEUFT = ['auto-booking'] as const;

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
 * dem die Wege aufgehen, und bucht ihn. Danach steht der Termin an der Stelle des Knopfs, mit dem Weg
 * in den Kalender und „Rückgängig“; ein Nachrücker der Warteliste lässt sich nur im Kalender absagen.
 */
export function NaechstenTerminBuchen({
  auftrag,
  hierher,
  onTipp,
  onUnklar,
}: {
  auftrag: Buchungsauftrag;
  /** Die Adresse dieser Suche, als Rückweg für einen Abstecher. */
  hierher: string;
  /** Ab dem Tipp hält die Seite das Formular fest, auch wenn der Wartelisteneintrag dabei schließt. */
  onTipp: () => void;
  /** Der Ausgang ist offen: Die Seite hält das fest, auch über eine neue Suche hinweg. */
  onUnklar: (satz: string) => void;
}) {
  const queryClient = useQueryClient();
  const [zurueckgenommen, setZurueckgenommen] = useState<'nein' | 'geloescht' | 'abgesagt'>('nein');
  const [absagefrage, setAbsagefrage] = useState<Absagefrage | null>(null);
  // Nach „Behalten“ geht der Fokus zurück auf „Rückgängig“, wie beim Abbrechen einer Rückfrage.
  const [fokusZurueck, setFokusZurueck] = useState(false);
  const rueckgaengig = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (fokusZurueck && !absagefrage) {
      rueckgaengig.current?.focus();
      setFokusZurueck(false);
    }
  }, [fokusZurueck, absagefrage]);

  async function neuLaden() {
    await Promise.all([
      tageslageNeuLaden(queryClient),
      ...TERMINABFRAGEN.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
    ]);
    // Die Warteliste gilt als veraltet, lädt hier aber nicht neu: Die Suche bliebe sonst nicht stehen.
    await queryClient.invalidateQueries({ queryKey: ['waitlist'], refetchType: 'none' });
  }

  const buchen = useMutation({
    mutationKey: BUCHUNG_LAEUFT,
    mutationFn: (a: Buchungsauftrag) => bucheNaechstenTermin(a),
    onMutate: () => {
      onTipp();
      setZurueckgenommen('nein');
      setAbsagefrage(null);
    },
    onSuccess: async (ergebnis) => {
      if (ergebnis.art === 'unklar') onUnklar(ergebnis.satz);
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
  // Ob nachgerückt wurde, sagt der Auftrag, mit dem gebucht wurde: Der Eintrag ist danach geschlossen.
  const nachruecker = Boolean(buchen.variables?.waitlistId);

  if (ergebnis?.art === 'gebucht') {
    const gebucht = ergebnis.termin;
    return (
      <div className="mb-6">
        <Rueckmeldung>Gebucht: {terminzeile(gebucht)}</Rueckmeldung>
        {gebucht.gebiet === 'outside' ? (
          <p className="mt-2">
            <Badge ton="warnung">Außerhalb des Gebietstags</Badge>
          </p>
        ) : null}
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <ButtonLink to={kalenderZumTermin(gebucht.id)} variant="secondary" groesse="kompakt">
            Im Kalender ansehen
          </ButtonLink>
          {nachruecker || absagefrage ? null : (
            <Button
              ref={rueckgaengig}
              type="button"
              variant="quiet"
              groesse="kompakt"
              disabled={zuruecknehmen.isPending}
              onClick={() => zuruecknehmen.mutate(gebucht.id)}
            >
              {zuruecknehmen.isPending ? 'Wird zurückgenommen …' : 'Rückgängig'}
            </Button>
          )}
        </div>
        {zuruecknehmen.isError ? (
          <Statusmeldung ton="fehler" className="mt-2">
            {zuruecknehmen.error.message}
          </Statusmeldung>
        ) : null}
        {absagefrage ? (
          <div className="mt-3">
            <Rueckfragekasten
              bezeichnung="Termin absagen"
              bestaetigen="Termin absagen"
              bestaetigenLaeuft="Wird abgesagt …"
              abbrechen="Behalten"
              fehler={absagen.error?.message}
              onBestaetigen={() => absagen.mutateAsync(absagefrage)}
              onAbbrechen={() => {
                setAbsagefrage(null);
                absagen.reset();
                setFokusZurueck(true);
              }}
            >
              Patient:in sieht Termin und Absage
            </Rueckfragekasten>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="mb-6">
      <Button
        type="button"
        className="w-full sm:w-auto"
        disabled={buchen.isPending}
        onClick={() => buchen.mutate(auftrag)}
      >
        {buchen.isPending ? 'Wird gebucht …' : 'Nächsten passenden Termin buchen'}
      </Button>
      {zurueckgenommen === 'nein' ? null : (
        <Rueckmeldung className="mt-3">
          {zurueckgenommen === 'abgesagt' ? 'Termin abgesagt.' : 'Termin zurückgenommen.'}
        </Rueckmeldung>
      )}
      {ergebnis?.art === 'kein_platz' ? (
        <Statusmeldung ton="warnung" className="mt-2">
          {ergebnis.ungeprueft > 0
            ? 'Kein Platz mit passendem Fahrweg, teils ungeprüft'
            : 'Kein Platz mit passendem Fahrweg'}
        </Statusmeldung>
      ) : null}
      {ergebnis?.art === 'nichts_gebucht' ? (
        <>
          <Statusmeldung ton="fehler" className="mt-2">
            {ergebnis.satz}
          </Statusmeldung>
          {ergebnis.adresse ? (
            <div className="mt-3">
              <ButtonLink
                to={mitRueckweg(`/patienten/${auftrag.patientId}/stammdaten`, hierher)}
                variant="secondary"
                groesse="kompakt"
              >
                Anschrift in den Stammdaten
              </ButtonLink>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

/**
 * Der Ausgang einer Buchung ist offen: Bis nachgesehen ist, gibt es hier keinen Knopf - ein zweiter
 * Tipp buchte sonst doppelt. Die Seite zeigt das statt des Knopfs, auch nach einer neuen Suche.
 */
export function BuchungUnklar({ patientId, satz }: { patientId: string; satz: string }) {
  return (
    <div className="mb-6">
      <Statusmeldung ton="warnung">{satz}</Statusmeldung>
      <div className="mt-3">
        <ButtonLink to={`/patienten/${patientId}/termine`} variant="secondary" groesse="kompakt">
          Termine der Akte ansehen
        </ButtonLink>
      </div>
    </div>
  );
}
