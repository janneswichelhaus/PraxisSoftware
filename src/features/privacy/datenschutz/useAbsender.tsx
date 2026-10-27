import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import {
  absenderVollstaendig,
  fetchPraxisAbsender,
  PRAXIS_ABSENDER_KEY,
  type PraxisAbsender,
} from './absender';

/**
 * Lädt den Absender für ein Blatt und sagt am Bildschirm, wenn etwas fehlt.
 *
 * Fehlt die Anschrift oder jeder Kontaktweg, steht über dem Blatt ein Satz
 * (nicht auf dem Papier): Ein Blatt an Patient:innen ohne Kontaktdaten erfüllt
 * Art. 13 Abs. 1 lit. a DSGVO nicht. Gepflegt werden die Angaben unter
 * Abrechnung → Stammdaten, nur von owner.
 */
export function useAbsender(ersatzname: string | null) {
  const abfrage = useQuery({
    queryKey: PRAXIS_ABSENDER_KEY,
    queryFn: fetchPraxisAbsender,
    retry: false,
  });
  const absender: PraxisAbsender = abfrage.data ?? { name: ersatzname ?? 'die Praxis' };

  const hinweis = abfrage.isError ? (
    <div className="nicht-drucken mb-4 flex flex-wrap items-center gap-3">
      <Statusmeldung ton="warnung" className="max-w-prose">
        Anschrift und Telefon der Praxis ließen sich nicht laden. Bitte vor dem Drucken erneut
        versuchen.
      </Statusmeldung>
      <Button
        type="button"
        variant="secondary"
        groesse="kompakt"
        disabled={abfrage.isFetching}
        onClick={() => void abfrage.refetch()}
      >
        {abfrage.isFetching ? 'Wird geladen …' : 'Erneut versuchen'}
      </Button>
    </div>
  ) : abfrage.isSuccess && !absenderVollstaendig(abfrage.data) ? (
    <Statusmeldung ton="warnung" className="nicht-drucken mb-4 max-w-prose">
      Auf dem Blatt fehlen Anschrift oder Telefon der Praxis. Die Praxisleitung trägt sie unter
      Abrechnung → Stammdaten ein.
    </Statusmeldung>
  ) : null;

  return { absender, laedt: abfrage.isPending, hinweis };
}
