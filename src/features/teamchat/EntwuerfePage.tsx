import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { Button } from '@/components/ui/Button';
import { Dialogfenster } from '@/components/ui/Dialogfenster';
import { Formularfuss } from '@/components/ui/Formularfuss';
import { ListRow, ListRows } from '@/components/ui/ListRow';
import { Listenabschnitt } from '@/components/ui/Listenabschnitt';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import {
  GEPLANT_KEY,
  KANAELE_KEY,
  NACHSEHEN_MS,
  TEAMCHAT_KEY,
  fetchGeplant,
  fetchKanaele,
  kanalTitel,
  loescheNachricht,
  planeNeu,
  type Geplant,
} from './api';
import { entwurfSetzen, useEntwuerfe } from './entwuerfe';
import { ohneFormatierung } from './formatierung';
import { TEAMCHAT, gespraechPfad, threadPfad } from './pfade';
import { useTeamchat } from './rahmen';
import { Rand } from './Rand';
import { Zeitwahl } from './Zeitwahl';
import { geplantFuer, planvorschlaege } from './zeit';

/**
 * Teamchat → Entwürfe und Geplantes (TEAM-002, wie „Entwürfe und gesendet“
 * bei Slack): oben, was noch in einem Feld steht - nur in dieser Sitzung und
 * nur für dieses Konto (ANN-641) -, darunter die geplanten Nachrichten mit
 * „Jetzt senden“, „Andere Zeit“ und „Löschen“ (ANN-643). Ein Tipp auf einen
 * Entwurf öffnet sein Gespräch, das Feld steht wieder da.
 */
export function EntwuerfePage() {
  const { user, spalten } = useTeamchat();
  const zeitzone = user.organizationTimeZone ?? 'Europe/Berlin';
  const kontoId = user.profile.id;
  const entwuerfe = useEntwuerfe(kontoId);
  const geplant = useQuery({
    queryKey: GEPLANT_KEY,
    queryFn: fetchGeplant,
    refetchInterval: NACHSEHEN_MS,
  });
  const kanaele = useQuery({ queryKey: KANAELE_KEY, queryFn: fetchKanaele });
  const kanal = (kanalId: string) => kanaele.data?.find((k) => k.id === kanalId);
  const [offen, setOffen] = useState<Geplant | null>(null);

  return (
    <Rand>
      {spalten === 1 ? (
        <Rueckweg standard={TEAMCHAT} beschriftung="Zurück zu den Gesprächen" />
      ) : null}
      <PageHeader title="Entwürfe und Geplantes" />
      <Listenabschnitt
        titel="Entwürfe"
        anzahl={entwuerfe.length}
        leer={{
          titel: 'Kein Entwurf',
          beschreibung: 'Was du anfängst und nicht sendest, steht hier, solange die App läuft.',
        }}
      >
        {entwuerfe.map((e) => {
          const k = kanal(e.kanalId);
          const ort = k ? kanalTitel(k) : 'Gespräch';
          return (
            <ListRow
              key={`${e.kanalId}|${e.threadId ?? ''}`}
              to={k ? (e.threadId ? threadPfad(k, e.threadId) : gespraechPfad(k)) : TEAMCHAT}
              titel={<span className="line-clamp-2">{ohneFormatierung(e.text)}</span>}
              meta={e.threadId ? `Antwort im Thread · ${ort}` : ort}
              darunter={
                // Ungesendeter Text ist ohne Rückfrage fort (DESIGN.md 9.16) - unter
                // der Zeile, in ihr bräche der Kasten bei 375 px (wie im Zeitkonto).
                <div className="flex flex-wrap items-center justify-end gap-x-3 pb-2">
                  <Rueckfrage
                    ausloeser="Verwerfen"
                    ausloeserVariante="quiet"
                    ausloeserGroesse="kompakt"
                    ausloeserZusatz={`Entwurf ${e.threadId ? 'im Thread in' : 'in'} ${ort}`}
                    bestaetigen="Ja, verwerfen"
                    onBestaetigen={() => entwurfSetzen(kontoId, e.kanalId, e.threadId, '')}
                  >
                    Der Text ist danach fort.
                  </Rueckfrage>
                </div>
              }
            />
          );
        })}
      </Listenabschnitt>

      <Abfragezustand
        abfrage={geplant}
        laden="Geplantes wird geladen …"
        fehler="Geplante Nachrichten konnten nicht geladen werden."
      >
        {(daten) => (
          <Listenabschnitt
            titel="Geplant"
            anzahl={daten.length}
            leer={{
              titel: 'Nichts geplant',
              beschreibung: 'An der Eingabe über die Uhr: später senden.',
            }}
          >
            {daten.map((g) => {
              const k = kanal(g.channel_id);
              return (
                <ListRow
                  key={g.id}
                  onClick={() => setOffen(g)}
                  titel={<span className="line-clamp-2">{ohneFormatierung(g.body)}</span>}
                  meta={`${k ? kanalTitel(k) : 'Gespräch'} · ${geplantFuer(g.created_at, zeitzone)}`}
                />
              );
            })}
          </Listenabschnitt>
        )}
      </Abfragezustand>
      {offen ? (
        <GeplantFenster
          geplant={offen}
          zeitzone={zeitzone}
          ort={kanal(offen.channel_id)}
          onSchliessen={() => setOffen(null)}
        />
      ) : null}
    </Rand>
  );
}

function GeplantFenster({
  geplant,
  zeitzone,
  ort,
  onSchliessen,
}: {
  geplant: Geplant;
  zeitzone: string;
  ort:
    { kind: Geplant['channel_kind']; name: string | null; partner_name: string | null } | undefined;
  onSchliessen: () => void;
}) {
  const queryClient = useQueryClient();
  const [ansicht, setAnsicht] = useState<'liste' | 'zeit' | 'loeschen'>('liste');
  const tun = useMutation({
    mutationFn: (vorgang: () => Promise<unknown>) => vorgang(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: TEAMCHAT_KEY });
      onSchliessen();
    },
  });

  if (ansicht === 'zeit') {
    return (
      <Zeitwahl
        titel="Andere Zeit"
        vorschlaege={planvorschlaege(zeitzone)}
        zeitzone={zeitzone}
        bestaetigen="Planen"
        laeuft={tun.isPending}
        fehler={tun.isError ? tun.error.message : undefined}
        onSchliessen={onSchliessen}
        onWaehlen={(um) => tun.mutate(() => planeNeu(geplant.id, um))}
      />
    );
  }

  return (
    <Dialogfenster titel="Geplante Nachricht" onSchliessen={onSchliessen}>
      <div className="flex flex-col gap-4">
        <p className="text-ink-muted text-sm">
          {ort ? kanalTitel(ort) : 'Gespräch'} · {geplantFuer(geplant.created_at, zeitzone)}
        </p>
        <p className="text-ink text-liste line-clamp-6 whitespace-pre-line">
          {ohneFormatierung(geplant.body)}
        </p>
        {tun.isError ? <Statusmeldung ton="fehler">{tun.error.message}</Statusmeldung> : null}
        {ansicht === 'loeschen' ? (
          <div className="flex flex-col gap-3">
            <p className="text-ink text-liste">Die Nachricht wird nicht gesendet.</p>
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={tun.isPending}
                onClick={() => tun.mutate(() => loescheNachricht(geplant.id))}
              >
                {tun.isPending ? 'Wird gelöscht …' : 'Ja, löschen'}
              </Button>
              <Button variant="quiet" onClick={() => setAnsicht('liste')}>
                Abbrechen
              </Button>
            </div>
          </div>
        ) : (
          <ListRows beschriftung="Handlungen" rahmen={false}>
            <ListRow
              dicht
              titel="Jetzt senden"
              onClick={() => tun.mutate(() => planeNeu(geplant.id, null))}
            />
            <ListRow dicht titel="Andere Zeit …" onClick={() => setAnsicht('zeit')} />
            <ListRow dicht titel="Löschen" onClick={() => setAnsicht('loeschen')} />
          </ListRows>
        )}
        {ansicht === 'liste' ? (
          <Formularfuss dicht>
            <Button variant="secondary" onClick={onSchliessen}>
              Schließen
            </Button>
          </Formularfuss>
        ) : null}
      </div>
    </Dialogfenster>
  );
}
