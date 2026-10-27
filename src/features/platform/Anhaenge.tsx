import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Dialogfenster } from '@/components/ui/Dialogfenster';
import { ListRows } from '@/components/ui/ListRow';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Zwischentitel } from '@/components/ui/Zwischentitel';
import { Kameradialog } from '@/components/ui/Kameradialog';
import {
  nachrichtenSchluessel,
  anhangLoeschen,
  anhangSenden,
  einwilligungSchreiben,
  ladeAnhang,
  type Anhang,
  type Nachricht,
  type Nachrichten,
  type Plattformzugang,
} from './api';
import { EINWILLIGUNGSFASSUNG, EINWILLIGUNGSTEXTE, FREIWILLIG } from './einwilligungstexte';
import { AUFNAHMEHINWEIS, zeitmarke, type Ansicht } from './anhangtexte';
import { Videodialog } from './Videodialog';
import { datum } from './zeit';

/**
 * Foto und Video an einer Rückfrage (KOM-007, ADR-017 Abschnitt L).
 *
 *   * **Anhängen** nur im Nachsorge-Abo und im Training, nur die Person und
 *     ihre rechtliche Vertretung (Punkt 59) - ob, sagt der Server
 *     (`can_attach`). Beim ersten Mal steht die Einwilligung davor
 *     (Punkt 61, ANN-333); ohne sie bleibt die Frage in Worten möglich.
 *   * **Aufnehmen** nur in der Anwendung: Foto im Kameradialog, Video im
 *     Videodialog, kein Dateiwähler (Punkt 62).
 *   * **Ansehen** heißt Anzeigen (Punkt 54): Bild oder Video aus einer
 *     Objekt-URL, ohne Download, ohne Vorschaubilder in der Liste
 *     (Punkt 40). Jeder Anhang zeigt sein Löschdatum (Punkt 65).
 *   * **Zeitmarke** (Punkt 68, ANN-338): Eine Antwort der Praxis kann auf
 *     eine Stelle im Video zeigen; der Knopf öffnet es dort.
 */

function wer(anhang: Anhang, zugang: Plattformzugang): string {
  if (anhang.author === 'you') return 'von Ihnen';
  if (anhang.author === 'person') return `von ${zugang.represented_name ?? 'der Person selbst'}`;
  return anhang.author_label ? `von ${anhang.author_label}` : 'von der Vertretung';
}

function beschreibung(anhang: Anhang): string {
  return anhang.media_kind === 'photo'
    ? 'Foto'
    : `Video, ${zeitmarke(anhang.duration_seconds ?? 0)}`;
}

export function AnhaengeAbschnitt({
  zugang,
  nachricht,
  daten,
  offen,
  ansicht,
  setAnsicht,
}: {
  zugang: Plattformzugang;
  nachricht: Nachricht;
  daten: Nachrichten;
  /** Ist der Vorgang offen und darf geschrieben werden? */
  offen: boolean;
  ansicht: Ansicht | null;
  setAnsicht: (ansicht: Ansicht | null) => void;
}) {
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<'einwilligung' | 'foto' | 'video' | null>(null);
  const [nachEinwilligung, setNachEinwilligung] = useState<'foto' | 'video'>('foto');
  const [meldung, setMeldung] = useState<string | null>(null);
  const neuLaden = () =>
    queryClient.invalidateQueries({ queryKey: nachrichtenSchluessel(zugang.access_id) });

  const senden = useMutation({
    mutationFn: (eingabe: { aufnahme: Blob; art: 'photo' | 'video'; dauer: number | null }) =>
      anhangSenden({ zugangId: zugang.access_id, nachrichtId: nachricht.id, ...eingabe }),
    onMutate: () => setMeldung(null),
    onSuccess: async () => {
      setMeldung('Ihre Aufnahme ist bei der Praxis angekommen.');
      await neuLaden();
    },
  });
  const loeschen = useMutation({
    mutationFn: (anhangId: string) => anhangLoeschen(zugang.access_id, anhangId),
    onSuccess: async (_, anhangId) => {
      if (ansicht?.anhangId === anhangId) setAnsicht(null);
      setMeldung('Die Aufnahme ist gelöscht.');
      await neuLaden();
    },
  });
  const einwilligen = useMutation({
    mutationFn: () =>
      einwilligungSchreiben({
        zugangId: zugang.access_id,
        zweck: 'message_attachments',
        erteilen: true,
        fassung: EINWILLIGUNGSFASSUNG,
      }),
    onSuccess: async () => {
      await neuLaden();
      setDialog(nachEinwilligung);
    },
  });

  // §13 (ADR-017 Punkt 33): Solange eine Aufnahme unterwegs ist, warnt die
  // Seite vor dem Verlassen - die Aufnahme liegt nur im Speicher.
  useEffect(() => {
    if (!senden.isPending) return;
    const warnen = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warnen);
    return () => window.removeEventListener('beforeunload', warnen);
  }, [senden.isPending]);

  const anhaenge = nachricht.attachments ?? [];
  const anzahl = nachricht.attachment_count ?? anhaenge.length;
  const grenze = daten.attachment_limit ?? 3;
  const frei = anzahl < grenze;
  const einwilligung = daten.attachment_consent ?? null;
  const kannAnhaengen = offen && (daten.can_attach ?? false) && einwilligung !== null;

  // Die Begleitung sieht von Anhängen nichts (Punkt 67).
  if (einwilligung === null) return null;
  if (anhaenge.length === 0 && !kannAnhaengen) return null;

  function aufnehmen(art: 'foto' | 'video') {
    setMeldung(null);
    if (einwilligung !== 'granted') {
      setNachEinwilligung(art);
      setDialog('einwilligung');
      return;
    }
    setDialog(art);
  }

  const ungeprueft = anhaenge.some((a) => !a.malware_scanned);
  const fehler = senden.isError
    ? senden.error.message
    : loeschen.isError
      ? loeschen.error.message
      : null;
  const text = EINWILLIGUNGSTEXTE.message_attachments;

  return (
    <section aria-labelledby={`anhaenge-${nachricht.id}`} className="mt-8">
      <Zwischentitel id={`anhaenge-${nachricht.id}`}>Fotos und Videos</Zwischentitel>
      {anhaenge.length > 0 ? (
        <ListRows>
          {anhaenge.map((a) => (
            <li
              key={a.id}
              className="border-line flex flex-wrap items-center justify-between gap-2 border-t py-3 first:border-t-0"
            >
              <div className="min-w-0">
                <p className="text-ink text-base font-medium">{beschreibung(a)}</p>
                <p className="text-ink-muted text-sm">
                  {wer(a, zugang)} · {datum(a.created_at)} · wird am {datum(a.delete_on)} gelöscht
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() =>
                    setAnsicht(ansicht?.anhangId === a.id ? null : { anhangId: a.id, ab: 0 })
                  }
                >
                  {ansicht?.anhangId === a.id ? 'Schließen' : 'Ansehen'}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={loeschen.isPending}
                  onClick={() => loeschen.mutate(a.id)}
                >
                  Löschen
                </Button>
              </div>
              {ansicht?.anhangId === a.id ? (
                <Aufnahmeansicht
                  zugangId={zugang.access_id}
                  anhang={a}
                  ab={ansicht.ab}
                  onSchliessen={() => setAnsicht(null)}
                />
              ) : null}
            </li>
          ))}
        </ListRows>
      ) : null}
      {ungeprueft ? (
        <p className="text-ink-muted mt-2 text-sm">
          Aufnahmen werden nicht auf Schadsoftware geprüft.
        </p>
      ) : null}

      {kannAnhaengen ? (
        frei ? (
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <Button type="button" variant="secondary" onClick={() => aufnehmen('foto')}>
              Foto aufnehmen
            </Button>
            <Button type="button" variant="secondary" onClick={() => aufnehmen('video')}>
              Video aufnehmen
            </Button>
          </div>
        ) : (
          <p className="text-ink-muted mt-3 text-sm">
            An eine Frage passen höchstens {grenze} Fotos oder Videos.
          </p>
        )
      ) : null}
      {senden.isPending ? (
        <Statusmeldung className="mt-3">Ihre Aufnahme wird gesendet …</Statusmeldung>
      ) : null}
      {meldung ? (
        <Statusmeldung ton="erfolg" className="mt-3">
          {meldung}
        </Statusmeldung>
      ) : null}
      {fehler ? (
        <Statusmeldung ton="fehler" className="mt-3">
          {fehler}
        </Statusmeldung>
      ) : null}

      {dialog === 'einwilligung' ? (
        <Dialogfenster titel={text.titel} onSchliessen={() => setDialog(null)}>
          <p className="text-ink text-base leading-relaxed">{text.text}</p>
          {text.widerruf ? (
            <p className="text-ink mt-2 text-base leading-relaxed">
              Wenn Sie widerrufen: {text.widerruf}
            </p>
          ) : null}
          <p className="text-ink-muted mt-2 text-sm">{FREIWILLIG}</p>
          <p className="text-ink-muted mt-1 text-sm">
            Ohne Einwilligung können Sie Ihre Frage weiter in Worten stellen.
          </p>
          {einwilligen.isError ? (
            <Statusmeldung ton="fehler" className="mt-3">
              {einwilligen.error.message}
            </Statusmeldung>
          ) : null}
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              data-autofocus
              disabled={einwilligen.isPending}
              onClick={() => einwilligen.mutate()}
            >
              Einwilligen und aufnehmen
            </Button>
            <Button type="button" variant="secondary" onClick={() => setDialog(null)}>
              Nicht jetzt
            </Button>
          </div>
        </Dialogfenster>
      ) : null}

      {dialog === 'foto' ? (
        <Kameradialog
          titel="Foto aufnehmen"
          hinweis={AUFNAHMEHINWEIS}
          onSchliessen={() => setDialog(null)}
          onAufnahme={(foto) => {
            setDialog(null);
            senden.mutate({ aufnahme: foto, art: 'photo', dauer: null });
          }}
        />
      ) : null}
      {dialog === 'video' ? (
        <Videodialog
          hoechstens={daten.attachment_max_seconds ?? 30}
          hinweis={AUFNAHMEHINWEIS}
          onSchliessen={() => setDialog(null)}
          onAufnahme={(video, dauer) => {
            setDialog(null);
            senden.mutate({ aufnahme: video, art: 'video', dauer });
          }}
        />
      ) : null}
    </section>
  );
}

/**
 * Eine Aufnahme ansehen (Punkt 54): geladen in den Speicher der Seite,
 * gezeigt aus einer Objekt-URL, die beim Schließen frei wird. Kein
 * Downloadname, kein Bild-im-Bild, kein Fernabspielen.
 */
export function Aufnahmeansicht({
  zugangId,
  anhang,
  ab,
  onSchliessen,
}: {
  zugangId: string;
  anhang: Anhang;
  ab: number;
  onSchliessen: () => void;
}) {
  // Kein Zwischenspeicher über die Ansicht hinaus: je Öffnen neu geladen.
  const geladen = useQuery({
    queryKey: ['platform-attachment', zugangId, anhang.id],
    queryFn: () => ladeAnhang(zugangId, anhang.id),
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

  // Zur Zeitmarke springen (Punkt 68), sobald das Video Daten hat.
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
    <div className="mt-2 w-full">
      {geladen.isPending ? (
        <Statusmeldung>Die Aufnahme wird geladen …</Statusmeldung>
      ) : geladen.isError ? (
        <Statusmeldung ton="fehler">{geladen.error.message}</Statusmeldung>
      ) : adresse && anhang.media_kind === 'photo' ? (
        <img
          src={adresse}
          alt={`Foto vom ${datum(anhang.created_at)}`}
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
          aria-label={`Video vom ${datum(anhang.created_at)}`}
          className="bg-ink rounded-image block max-h-[70vh] w-full object-contain"
        />
      ) : null}
      <div className="mt-2">
        <Button type="button" variant="secondary" onClick={onSchliessen}>
          Schließen
        </Button>
      </div>
    </div>
  );
}
