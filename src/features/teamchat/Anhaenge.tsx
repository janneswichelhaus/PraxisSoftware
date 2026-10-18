import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { Badge, STATUSZEICHEN } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Dialogfenster } from '@/components/ui/Dialogfenster';
import { ListRow, ListRows } from '@/components/ui/ListRow';
import { Listenabschnitt } from '@/components/ui/Listenabschnitt';
import { Medienbild } from '@/components/ui/Medienbild';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Symbolknopf } from '@/components/ui/Symbolknopf';
import { PdfRahmen } from '@/features/files/Dateiansicht';
import { NICHT_SERVERSEITIG_GEPRUEFT, formatBytes } from '@/features/files/dokumentarten';
import { DATEIEN_HOECHSTENS, dateienKey, fetchDateien, ladeAnhang, type Anhang } from './api';
import { anhangArt, anhangEntfernen, anhangErneut, type Entwurfsanhang } from './entwurfsanhaenge';
import { Bildzeichen, Dokument, Kreuz } from './Zeichen';
import { nachrichtenzeit } from './zeit';

/** So viele Dateien zeigen die Details zuerst; der Rest auf Wunsch. */
const DATEIEN_ZUERST = 10;

/**
 * Der Platz vorn in der Zeile: das eigene Foto im Entwurf, sonst eine Kachel
 * mit dem Zeichen der Art (`Medienbild`, DESIGN.md 9.10) - ganz, nicht
 * beschnitten. Das Wort zur Art steht daneben in der Zeile.
 */
function Artkachel({
  mime,
  vorschau,
  name,
}: {
  mime: string;
  vorschau?: string | null;
  name: string;
}) {
  return (
    <Medienbild
      vorschau
      src={vorschau ?? null}
      alt={vorschau ? name : ''}
      platzhalter={anhangArt(mime)}
      zeichen={mime === 'application/pdf' ? <Dokument /> : <Bildzeichen />}
    />
  );
}

/** Art und Größe - und ob am Server geprüft (ADR-017 Punkt 51), sichtbar an der Datei. */
function angaben(anhang: { mime_type: string; byte_size: number; verified: boolean }): string {
  return `${anhangArt(anhang.mime_type)} · ${formatBytes(anhang.byte_size)}${
    anhang.verified ? '' : ` · ${NICHT_SERVERSEITIG_GEPRUEFT}`
  }`;
}

type Offen = Pick<Anhang, 'id' | 'name' | 'mime_type' | 'byte_size' | 'verified'>;

/** Ein PDF, das dieses Gerät nicht in der Seite zeigen kann (Chrome unter Android). */
function pdfOhneBetrachter(anhang: Offen): boolean {
  return (
    anhang.mime_type === 'application/pdf' &&
    typeof navigator !== 'undefined' &&
    navigator.pdfViewerEnabled === false
  );
}

/**
 * Öffnet Anhänge: Ein Tipp holt die einmalige Freigabe (ADR-017 Punkt 15) und
 * zeigt die Datei in einem Fenster. Geladen wird beim Tipp, nicht beim
 * Aufbau - so gibt es je Öffnen genau einen Verweis.
 */
function useAnhangOeffnen() {
  const [offen, setOffen] = useState<Offen | null>(null);
  const laden = useMutation({ mutationFn: (anhang: Offen) => ladeAnhang(anhang.id) });
  return {
    offen,
    laden,
    oeffnen: (anhang: Offen) => {
      setOffen(anhang);
      // Ohne Betrachter keine Freigabe: Sie bliebe ungenutzt liegen.
      if (!pdfOhneBetrachter(anhang)) laden.mutate(anhang);
    },
    schliessen: () => {
      setOffen(null);
      laden.reset();
    },
  };
}

/** Ein Bild aus den geladenen Bytes; die Objekt-URL fällt mit dem Fenster. */
function Bild({ datei, name }: { datei: Blob; name: string }) {
  const [adresse, setAdresse] = useState<string | null>(null);
  useEffect(() => {
    const neu = URL.createObjectURL(datei);
    setAdresse(neu);
    return () => URL.revokeObjectURL(neu);
  }, [datei]);
  return adresse ? (
    <img
      src={adresse}
      alt={name}
      className="bg-ink rounded-image max-w-spalte block max-h-[70vh] w-full object-contain"
    />
  ) : null;
}

/**
 * Ein Anhang im Fenster (TEAM-003, ADR-017 Punkt 77): am Telefon über den
 * ganzen Bildschirm, damit Bild oder PDF ganz zu sehen sind und „Schließen“
 * im Daumenbereich steht; am Rechner groß in der Mitte. Ein PDF im Rahmen
 * ohne die Leiste des Betrachters - Herunterladen gibt es nicht. Kann das
 * Gerät kein PDF in der Seite zeigen, sagt das Fenster es, statt leer zu
 * bleiben.
 */
function AnhangFenster({
  anhang,
  laden,
  onSchliessen,
}: {
  anhang: Offen;
  laden: ReturnType<typeof useAnhangOeffnen>['laden'];
  onSchliessen: () => void;
}) {
  const pdf = anhang.mime_type === 'application/pdf';
  const ohneBetrachter = pdfOhneBetrachter(anhang);
  return (
    <Dialogfenster
      titel={anhang.name}
      beschreibung={angaben(anhang)}
      vollbild
      onSchliessen={onSchliessen}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4 sm:px-6">
        {ohneBetrachter ? (
          <Statusmeldung>Dieses Gerät zeigt PDF nicht in der App an.</Statusmeldung>
        ) : laden.isPending ? (
          <Statusmeldung>Wird geöffnet …</Statusmeldung>
        ) : laden.isError ? (
          <Statusmeldung ton="fehler">{laden.error.message}</Statusmeldung>
        ) : laden.data ? (
          pdf ? (
            <PdfRahmen daten={laden.data} titel={anhang.name} ohneLeiste />
          ) : (
            <Bild datei={laden.data} name={anhang.name} />
          )
        ) : null}
        <div>
          <Button type="button" variant="secondary" data-autofocus onClick={onSchliessen}>
            Schließen
          </Button>
        </div>
      </div>
    </Dialogfenster>
  );
}

/**
 * Die Anhänge einer Nachricht (TEAM-003, ADR-017 Punkt 77): je Anhang eine
 * Zeile mit Art, Name und Größe - **ohne Vorschaubild**, denn eine Vorschau
 * je Anhang wäre ein Verweis auf Vorrat (Punkt 15). Der Name bricht um, statt
 * gekürzt zu werden (wie die Akte); ein Tipp öffnet das Fenster.
 *
 * Im Ausgang (`aktiv={false}`) ist die Nachricht noch nicht beim Server:
 * Dann stehen die Anhänge nur da.
 */
export function AnhangZeilen({
  anhaenge,
  aktiv = true,
}: {
  anhaenge: readonly Anhang[];
  aktiv?: boolean;
}) {
  const ansicht = useAnhangOeffnen();
  if (anhaenge.length === 0) return null;
  return (
    <div className="max-w-spalte mt-2">
      <ListRows beschriftung="Anhänge">
        {anhaenge.map((anhang) => (
          <ListRow
            key={anhang.id}
            bild={<Artkachel mime={anhang.mime_type} name={anhang.name} />}
            titel={<span className="break-words">{anhang.name}</span>}
            meta={angaben(anhang)}
            {...(aktiv ? { onClick: () => ansicht.oeffnen(anhang) } : {})}
          />
        ))}
      </ListRows>
      {ansicht.offen ? (
        <AnhangFenster
          anhang={ansicht.offen}
          laden={ansicht.laden}
          onSchliessen={ansicht.schliessen}
        />
      ) : null}
    </div>
  );
}

/**
 * Die Anhänge im Entwurf, über dem Feld (ADR-017 Punkt 74): die eigenen
 * Bytes als Vorschau - sie liegen ohnehin im Speicher der Seite -, Art und
 * Größe, „Lädt“ als Zeichen und Wort, ein Fehler mit seinem Grund in voller
 * Länge unter der Zeile, „Noch einmal“, wo ein neuer Versuch gelingen kann,
 * und Entfernen. Solange etwas lädt, sagt eine Zeile, warum „Senden“ wartet.
 */
export function EntwurfsAnhaenge({ anhaenge }: { anhaenge: readonly Entwurfsanhang[] }) {
  if (anhaenge.length === 0) return null;
  return (
    <div className="mb-2">
      <div className="max-h-40 overflow-y-auto">
        <ListRows beschriftung="Anhänge" rahmen={false}>
          {anhaenge.map((a) => (
            <ListRow
              key={a.lokalId}
              dicht
              bild={<Artkachel mime={a.mime} vorschau={a.vorschau} name={a.name} />}
              titel={a.name}
              meta={`${anhangArt(a.mime)} · ${formatBytes(a.groesse)}`}
              status={
                a.zustand === 'laedt' ? (
                  <Badge eigenesZeichen={STATUSZEICHEN.wartet}>Lädt</Badge>
                ) : null
              }
              darunter={
                a.zustand === 'fehler' ? (
                  <Statusmeldung ton="fehler" className="pb-2">
                    {a.fehler ?? 'Der Anhang konnte nicht hochgeladen werden.'}
                  </Statusmeldung>
                ) : null
              }
              aktion={
                <>
                  {a.zustand === 'fehler' && a.erneut ? (
                    <Button variant="quiet" onClick={() => anhangErneut(a.lokalId)}>
                      Noch einmal
                    </Button>
                  ) : null}
                  <Symbolknopf
                    beschriftung={`Anhang entfernen: ${a.name}`}
                    onClick={() => anhangEntfernen(a.lokalId)}
                  >
                    <Kreuz />
                  </Symbolknopf>
                </>
              }
            />
          ))}
        </ListRows>
      </div>
      {anhaenge.some((a) => a.zustand === 'laedt') ? (
        <Statusmeldung className="mt-1">Senden geht, sobald alles hochgeladen ist.</Statusmeldung>
      ) : null}
    </div>
  );
}

/**
 * Dateien je Gespräch (ADR-017 Punkt 80): die Anhänge des Gesprächs, die
 * neuesten zuerst - Name, Art, Größe, von wem, wann; ohne Vorschaubild. Zuerst
 * zehn, der Rest auf Wunsch; geholt werden höchstens 200. Öffnen wie in der
 * Nachricht (Punkt 77).
 */
export function DateienDesGespraechs({ kanalId, zeitzone }: { kanalId: string; zeitzone: string }) {
  const dateien = useQuery({ queryKey: dateienKey(kanalId), queryFn: () => fetchDateien(kanalId) });
  const ansicht = useAnhangOeffnen();
  const [alle, setAlle] = useState(false);
  return (
    <Abfragezustand
      abfrage={dateien}
      laden="Dateien werden geladen …"
      fehler="Die Dateien konnten nicht geladen werden."
    >
      {(daten) => {
        const gezeigt = alle ? daten : daten.slice(0, DATEIEN_ZUERST);
        const voll = daten.length >= DATEIEN_HOECHSTENS;
        return (
          <>
            <Listenabschnitt
              titel={voll ? `Dateien (die ${DATEIEN_HOECHSTENS} neuesten)` : 'Dateien'}
              {...(voll ? {} : { anzahl: daten.length })}
              rahmen={false}
              leer={{ titel: 'Noch keine Dateien' }}
              mehr={
                gezeigt.length < daten.length ? (
                  <Button variant="secondary" groesse="kompakt" onClick={() => setAlle(true)}>
                    Alle {daten.length} zeigen
                  </Button>
                ) : null
              }
            >
              {gezeigt.map((datei) => {
                const anhang: Offen = {
                  id: datei.id,
                  name: datei.display_name,
                  mime_type: datei.mime_type,
                  byte_size: datei.byte_size,
                  verified: datei.verified,
                };
                return (
                  <ListRow
                    key={datei.id}
                    bild={<Artkachel mime={datei.mime_type} name={datei.display_name} />}
                    titel={<span className="break-words">{datei.display_name}</span>}
                    meta={`${angaben(anhang)} · ${
                      datei.author_name ?? 'Ehemaliges Teammitglied'
                    } · ${nachrichtenzeit(datei.created_at, zeitzone)}`}
                    onClick={() => ansicht.oeffnen(anhang)}
                  />
                );
              })}
            </Listenabschnitt>
            {ansicht.offen ? (
              <AnhangFenster
                anhang={ansicht.offen}
                laden={ansicht.laden}
                onSchliessen={ansicht.schliessen}
              />
            ) : null}
          </>
        );
      }}
    </Abfragezustand>
  );
}
