import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Kleingedrucktes } from '@/components/ui/Kleingedrucktes';
import { ListRows } from '@/components/ui/ListRow';
import { Rueckfrage as Nachfrage } from '@/components/ui/Rueckfrage';
import { Section } from '@/components/ui/Section';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Arbeitszeile } from '@/features/open-points/Arbeitszeile';
import {
  RUECKFRAGEN_KEY,
  deleteRueckfrageAnhang,
  kurzesDatum,
  ladeRueckfrageAnhang,
  type Rueckfrage,
  type Rueckfrageanhang,
} from './api';
import { zeitmarke } from './zeitmarke';

/**
 * Fotos und Videos an einer Rückfrage in der Praxis (KOM-008, ADR-017
 * Punkte 54, 65 bis 68).
 *
 * Sehen darf, wer den Vorgang liest; löschen, wer antworten darf - etwa
 * wenn eine Aufnahme Dritte zeigt (Punkt 67). Angezeigt wird in der
 * Anwendung, ohne Download und ohne Vorschaubilder in der Liste (Punkt 40).
 * Ein Anhang geht nie in die Akte (Punkt 66): Was er zeigt, gehört in Worten
 * in den Eintrag. Keine Zeichnung, kein Einzelbild, keine Gegenüberstellung
 * (Punkt 68).
 *
 * Je Anhang eine Zeile; darunter „Ansehen" und - leise, mit Rückfrage -
 * „Löschen", geöffnet die Aufnahme selbst.
 */

export interface Ansicht {
  anhangId: string;
  ab: number;
}

function beschreibung(a: Rueckfrageanhang): string {
  return a.media_kind === 'photo' ? 'Foto' : `Video, ${zeitmarke(a.duration_seconds ?? 0)}`;
}

export function RueckfrageAnhaenge({
  vorgang,
  name,
  zeitzone,
  ansicht,
  setAnsicht,
}: {
  vorgang: Rueckfrage;
  name: string;
  zeitzone: string;
  ansicht: Ansicht | null;
  setAnsicht: (a: Ansicht | null) => void;
}) {
  const queryClient = useQueryClient();
  const loeschen = useMutation({
    mutationFn: (id: string) => deleteRueckfrageAnhang(id),
    onSuccess: async (_, id) => {
      if (ansicht?.anhangId === id) setAnsicht(null);
      await queryClient.invalidateQueries({ queryKey: RUECKFRAGEN_KEY });
    },
  });
  const anhaenge = vorgang.attachments ?? [];
  if (anhaenge.length === 0) return null;

  return (
    <Section titel="Fotos und Videos">
      <ListRows>
        {anhaenge.map((a) => {
          const offen = ansicht?.anhangId === a.id;
          return (
            <Arbeitszeile
              key={a.id}
              titel={beschreibung(a)}
              meta={
                <>
                  {a.author_kind === 'self'
                    ? name
                    : `${a.author_label ?? 'Vertretung'} (rechtliche Vertretung)`}{' '}
                  · {kurzesDatum(a.created_at, zeitzone)} · wird am{' '}
                  {kurzesDatum(`${a.delete_on}T12:00:00Z`, zeitzone)} gelöscht
                  {a.server_verified ? '' : ' · nicht serverseitig geprüft'}
                </>
              }
              unten={
                <>
                  {a.object_missing ? (
                    <Statusmeldung ton="fehler">Die Aufnahme fehlt in der Ablage.</Statusmeldung>
                  ) : null}
                  {offen ? <Aufnahme anhang={a} ab={ansicht.ab} /> : null}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      groesse="kompakt"
                      disabled={a.object_missing}
                      onClick={() => setAnsicht(offen ? null : { anhangId: a.id, ab: 0 })}
                    >
                      {offen ? 'Schließen' : 'Ansehen'}
                    </Button>
                    {vorgang.can_answer ? (
                      <Nachfrage
                        ausloeser="Löschen"
                        ausloeserVariante="quiet"
                        ausloeserGroesse="kompakt"
                        bezeichnung={`${beschreibung(a)} löschen`}
                        bestaetigen="Ja, löschen"
                        bestaetigenLaeuft="Wird gelöscht …"
                        fehler={loeschen.isError ? loeschen.error.message : undefined}
                        onBestaetigen={() => loeschen.mutateAsync(a.id)}
                      >
                        <p>Die Aufnahme wird gelöscht. Das lässt sich nicht rückgängig machen.</p>
                      </Nachfrage>
                    ) : null}
                  </div>
                </>
              }
            />
          );
        })}
      </ListRows>
      {anhaenge.some((a) => !a.malware_scanned) ? (
        <Kleingedrucktes className="mt-3">
          Aufnahmen von außen werden nicht auf Schadsoftware geprüft (ADR-017 Fassung 6).
        </Kleingedrucktes>
      ) : null}
      <Kleingedrucktes className="mt-1">
        Aufnahmen gehen nicht in die Akte. Was sie zeigen, gehört in Worten in die Dokumentation.
      </Kleingedrucktes>
    </Section>
  );
}

/** Die geöffnete Aufnahme; geschlossen wird mit „Schließen" darunter. */
function Aufnahme({ anhang, ab }: { anhang: Rueckfrageanhang; ab: number }) {
  const geladen = useQuery({
    queryKey: [...RUECKFRAGEN_KEY, 'attachment', anhang.id],
    queryFn: () => ladeRueckfrageAnhang(anhang.id),
    gcTime: 0,
    staleTime: 0,
    retry: false,
  });
  const [adresse, setAdresse] = useState<string | null>(null);
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!geladen.data) return;
    const neu = URL.createObjectURL(geladen.data);
    setAdresse(neu);
    return () => URL.revokeObjectURL(neu);
  }, [geladen.data]);

  useEffect(() => {
    const element = video.current;
    if (!element || !adresse) return;
    const springen = () => {
      element.currentTime = ab;
    };
    if (element.readyState >= 1) springen();
    else element.addEventListener('loadedmetadata', springen, { once: true });
    return () => element.removeEventListener('loadedmetadata', springen);
  }, [adresse, ab]);

  return (
    <div className="w-full">
      {geladen.isPending ? (
        <Statusmeldung>Die Aufnahme wird geladen …</Statusmeldung>
      ) : geladen.isError ? (
        <Statusmeldung ton="fehler">{geladen.error.message}</Statusmeldung>
      ) : adresse && anhang.media_kind === 'photo' ? (
        <img
          src={adresse}
          alt="Foto der Person"
          className="bg-ink rounded-image block max-h-[70vh] w-full object-contain"
        />
      ) : adresse ? (
        <video
          ref={video}
          src={adresse}
          controls
          muted
          playsInline
          controlsList="nodownload noremoteplayback"
          disablePictureInPicture
          aria-label="Video der Person"
          className="bg-ink rounded-image block max-h-[70vh] w-full object-contain"
        />
      ) : null}
    </div>
  );
}
