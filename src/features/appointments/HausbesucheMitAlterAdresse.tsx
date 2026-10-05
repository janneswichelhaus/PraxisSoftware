import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { canManageAppointments, type CurrentUser } from '@/features/session/types';
import {
  aktualisiereHausbesuchAdressen,
  fetchVeralteteHausbesuche,
  formatLocalDate,
  formatLocalTimeRange,
  type VeralteterHausbesuch,
} from './api';

/**
 * Hinweis auf künftige Hausbesuche, die noch die alte Anschrift tragen
 * (ABN-004, BEF-092, ANN-003 Fassung 2).
 *
 * Ein Hausbesuch kopiert die Adresse beim Anlegen. Ändern sich die
 * Stammdaten, sagt dieser Baustein, welche künftigen Besuche abweichen, und
 * bietet an, sie zu übernehmen - einzeln oder alle, nie von selbst. Die
 * Prüfung, was ein künftiger bestätigter Hausbesuch ist, liegt beim Server;
 * hier steht nur Darstellung. Steht in den Stammdaten und im Terminbereich
 * der Akte; ohne abweichenden Besuch zeichnet er nichts.
 */
export function HausbesucheMitAlterAdresse({
  patientId,
  user,
}: {
  patientId: string;
  user: CurrentUser;
}) {
  const queryClient = useQueryClient();
  const darfAendern = canManageAppointments(user.roles);

  const veraltet = useQuery({
    queryKey: ['home-visits-outdated-address', patientId],
    queryFn: () => fetchVeralteteHausbesuche(patientId),
    enabled: darfAendern,
    staleTime: 0,
    retry: false,
  });

  const uebernehmen = useMutation({
    mutationFn: (ids: readonly string[]) => aktualisiereHausbesuchAdressen(ids),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['home-visits-outdated-address', patientId],
      });
      await queryClient.invalidateQueries({ queryKey: ['patient-appointments', patientId] });
      await queryClient.invalidateQueries({ queryKey: ['patient-next-appointment', patientId] });
      // ANN-236: Mit der neuen Anschrift gibt es wieder eine Fahrzeit.
      await queryClient.invalidateQueries({ queryKey: ['day-route'] });
    },
  });

  if (!darfAendern || !veraltet.data || veraltet.data.length === 0) return null;

  const besuche = veraltet.data;
  const alle = besuche.map((b) => b.id);

  return (
    <Statusmeldung ton="warnung" className="mb-6">
      <p className="font-medium">
        {besuche.length === 1
          ? 'Ein künftiger Hausbesuch nennt noch die alte Adresse.'
          : `${besuche.length} künftige Hausbesuche nennen noch die alte Adresse.`}
      </p>
      <p className="text-ink-muted mt-1 text-sm">
        Vergangene Besuche behalten ihre damalige Anschrift. Was hier übernommen wird, steht im
        Protokoll wie eine Terminänderung; ein Mitteilungsvermerk verfällt dabei.
      </p>
      <ul className="mt-3">
        {besuche.map((besuch) => (
          <Besuchszeile
            key={besuch.id}
            besuch={besuch}
            laeuft={uebernehmen.isPending}
            onUebernehmen={() => uebernehmen.mutateAsync([besuch.id])}
          />
        ))}
      </ul>
      {besuche.length > 1 ? (
        <div className="mt-3">
          <Rueckfrage
            ausloeser={`Alle ${besuche.length} aktualisieren`}
            ausloeserVariante="primary"
            ausloeserGroesse="kompakt"
            bestaetigen="Ja, alle aktualisieren"
            bestaetigenLaeuft="Wird übernommen …"
            fehler={uebernehmen.isError ? uebernehmen.error.message : undefined}
            onBestaetigen={() => uebernehmen.mutateAsync(alle)}
          >
            <p>
              Alle {besuche.length} künftigen Hausbesuche bekommen die aktuelle Anschrift aus den
              Stammdaten.
            </p>
          </Rueckfrage>
        </div>
      ) : uebernehmen.isError ? (
        <p role="alert" className="text-danger mt-2 text-sm">
          {uebernehmen.error.message}
        </p>
      ) : null}
    </Statusmeldung>
  );
}

function Besuchszeile({
  besuch,
  laeuft,
  onUebernehmen,
}: {
  besuch: VeralteterHausbesuch;
  laeuft: boolean;
  onUebernehmen: () => Promise<unknown>;
}) {
  const zone = besuch.organization_time_zone;
  const anschrift = [
    [besuch.visit_street, besuch.visit_house_number].filter(Boolean).join(' '),
    [besuch.visit_postal_code, besuch.visit_city].filter(Boolean).join(' '),
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <li className="border-line flex flex-wrap items-center justify-between gap-2 border-t py-2 first:border-t-0">
      <div>
        <span className="text-ink font-medium">{formatLocalDate(besuch.starts_at, zone)}</span>
        <span className="text-ink-muted block text-sm">
          {formatLocalTimeRange(besuch.starts_at, besuch.ends_at, zone)}
          {anschrift ? ` · ${anschrift}` : ''}
        </span>
      </div>
      <Button
        type="button"
        variant="secondary"
        groesse="kompakt"
        disabled={laeuft}
        onClick={() => void onUebernehmen()}
      >
        Adresse übernehmen
      </Button>
    </li>
  );
}
