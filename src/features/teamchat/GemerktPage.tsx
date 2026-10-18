import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { Button } from '@/components/ui/Button';
import { ListRow } from '@/components/ui/ListRow';
import { Listenabschnitt } from '@/components/ui/Listenabschnitt';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { Segment } from '@/components/ui/Segment';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { mitRueckweg } from '@/lib/rueckweg';
import {
  GEMERKT_KEY,
  KANAELE_KEY,
  NACHSEHEN_MS,
  TEAMCHAT_KEY,
  aendereGemerkt,
  fetchGemerkt,
  fetchKanaele,
  kanalTitel,
} from './api';
import { ohneFormatierung } from './formatierung';
import { GEMERKT, TEAMCHAT, stellePfad } from './pfade';
import { useTeamchat } from './rahmen';
import { Rand } from './Rand';
import { geplantFuer, nachrichtenzeit } from './zeit';

const ANSICHTEN = [
  { wert: 'offen', text: 'Offen' },
  { wert: 'erledigt', text: 'Erledigt' },
] as const;

/**
 * Teamchat → Für später (ANN-646, wie „Später“ bei Slack): Gemerktes nur für
 * die Person selbst, fällige Erinnerungen zuerst. Ein Tipp springt an die
 * Stelle im Gespräch, „Erledigt“ an der Zeile hakt ab; Erledigtes bleibt
 * abrufbar. Gemerkt wird an der Nachricht („⋯“ → „Für später merken“).
 */
export function GemerktPage() {
  const { user, spalten } = useTeamchat();
  const zeitzone = user.organizationTimeZone ?? 'Europe/Berlin';
  const queryClient = useQueryClient();
  const [ansicht, setAnsicht] = useState<'offen' | 'erledigt'>('offen');
  const gemerkt = useQuery({
    queryKey: [...GEMERKT_KEY, ansicht],
    queryFn: () => fetchGemerkt(ansicht === 'erledigt'),
    refetchInterval: NACHSEHEN_MS,
  });
  const kanaele = useQuery({ queryKey: KANAELE_KEY, queryFn: fetchKanaele });
  const titel = (kanalId: string) => {
    const kanal = kanaele.data?.find((k) => k.id === kanalId);
    return kanal ? kanalTitel(kanal) : 'Gespräch';
  };
  const abhaken = useMutation({
    mutationFn: ({ id, erledigt }: { id: string; erledigt: boolean }) =>
      aendereGemerkt(id, { erledigt }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: TEAMCHAT_KEY }),
  });

  return (
    <Rand>
      {spalten === 1 ? (
        <Rueckweg standard={TEAMCHAT} beschriftung="Zurück zu den Gesprächen" />
      ) : null}
      <PageHeader title="Für später" />
      <div className="mb-4">
        <Segment
          beschriftung="Ansicht"
          wahlen={ANSICHTEN}
          gewaehlt={ansicht}
          onWaehlen={setAnsicht}
        />
      </div>
      {abhaken.isError ? <Statusmeldung ton="fehler">{abhaken.error.message}</Statusmeldung> : null}
      <Abfragezustand
        abfrage={gemerkt}
        laden="„Für später“ wird geladen …"
        fehler="„Für später“ konnte nicht geladen werden."
        leer={{
          wenn: (daten) => daten.length === 0,
          titel: ansicht === 'offen' ? 'Nichts für später' : 'Nichts erledigt',
          ...(ansicht === 'offen'
            ? {
                beschreibung:
                  'An einer Nachricht über „⋯“ → „Für später merken“, auf Wunsch mit Erinnerung.',
              }
            : {}),
        }}
      >
        {(daten) => {
          const zeile = (g: (typeof daten)[number]) => (
            <ListRow
              key={g.id}
              to={mitRueckweg(stellePfad({ id: g.channel_id, kind: g.channel_kind }, g), GEMERKT)}
              gedaempft={g.done}
              titel={<span className="line-clamp-2">{ohneFormatierung(g.body)}</span>}
              meta={[
                // Die Erinnerung steht in der Nebenzeile, nicht rechts neben
                // dem Text - so bleibt er bei 375 px lesbar.
                g.remind_at && !g.done && !g.due
                  ? `Erinnerung ${geplantFuer(g.remind_at, zeitzone)}`
                  : null,
                titel(g.channel_id),
                g.author_name ?? 'Ehemaliges Teammitglied',
                nachrichtenzeit(g.created_at, zeitzone),
              ]
                .filter((teil) => teil !== null)
                .join(' · ')}
              aktion={
                <Button
                  variant="quiet"
                  disabled={abhaken.isPending}
                  onClick={() => abhaken.mutate({ id: g.id, erledigt: !g.done })}
                >
                  {g.done ? 'Wieder offen' : 'Erledigt'}
                </Button>
              }
            />
          );
          // Fälliges steht als eigener Abschnitt oben: Die Überschrift sagt
          // es, die Zeile braucht kein Abzeichen und behält ihre Breite.
          const faellig = daten.filter((g) => g.due && !g.done);
          const uebrige = daten.filter((g) => !(g.due && !g.done));
          return (
            <>
              {faellig.length > 0 ? (
                <Listenabschnitt titel="Fällig" anzahl={faellig.length}>
                  {faellig.map(zeile)}
                </Listenabschnitt>
              ) : null}
              {uebrige.length > 0 ? (
                <Listenabschnitt
                  titel={ansicht === 'offen' ? 'Gemerkt' : 'Erledigt'}
                  anzahl={uebrige.length}
                >
                  {uebrige.map(zeile)}
                </Listenabschnitt>
              ) : null}
            </>
          );
        }}
      </Abfragezustand>
    </Rand>
  );
}
