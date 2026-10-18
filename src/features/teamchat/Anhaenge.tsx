import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { Badge, STATUSZEICHEN } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ListRow, ListRows } from '@/components/ui/ListRow';
import { Listenabschnitt } from '@/components/ui/Listenabschnitt';
import { Medienbild } from '@/components/ui/Medienbild';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Symbolknopf } from '@/components/ui/Symbolknopf';
import { Dateiansicht } from '@/features/files/Dateiansicht';
import { formatBytes } from '@/features/files/dokumentarten';
import { dateienKey, fetchDateien, ladeAnhang, type Anhang, type Datei } from './api';
import { anhangArt, anhangEntfernen, anhangErneut, type Entwurfsanhang } from './anhaenge';
import { Bildzeichen, Dokument, Kreuz } from './Zeichen';
import { nachrichtenzeit } from './zeit';

function Artzeichen({ mime, className }: { mime: string; className?: string }) {
  return mime === 'application/pdf' ? (
    <Dokument {...(className ? { className } : {})} />
  ) : (
    <Bildzeichen {...(className ? { className } : {})} />
  );
}

/**
 * Die Anhänge einer Nachricht (TEAM-003, ADR-017 Punkt 77): je Anhang ein
 * Knopf mit Art, Name und Größe - **kein Vorschaubild**, denn eine Vorschau
 * je Anhang wäre ein Verweis auf Vorrat (Punkt 15). Erst „Öffnen“ holt die
 * einmalige Freigabe und zeigt im eigenen Rahmen darunter, ein Bild als Bild,
 * ein PDF im Rahmen. Herunterladen gibt es nicht.
 *
 * Im Ausgang (`aktiv={false}`) ist die Nachricht noch nicht beim Server:
 * Dann stehen die Anhänge nur da.
 */
export function AnhangKnoepfe({
  anhaenge,
  aktiv = true,
}: {
  anhaenge: readonly Anhang[];
  aktiv?: boolean;
}) {
  const [offen, setOffen] = useState<{ id: string; bild: Blob; name: string } | null>(null);
  const laden = useMutation({
    mutationFn: async (anhang: Anhang) => ({
      id: anhang.id,
      bild: await ladeAnhang(anhang.id),
      name: anhang.name,
    }),
    onSuccess: setOffen,
  });
  if (anhaenge.length === 0) return null;
  return (
    <div className="mt-2">
      <div role="group" aria-label="Anhänge" className="flex flex-wrap gap-1.5">
        {anhaenge.map((anhang) => (
          <Button
            key={anhang.id}
            variant="secondary"
            groesse="kompakt"
            className="max-w-full"
            disabled={!aktiv || laden.isPending}
            aria-expanded={aktiv ? offen?.id === anhang.id : undefined}
            onClick={() => {
              if (offen?.id === anhang.id) setOffen(null);
              else laden.mutate(anhang);
            }}
          >
            <Artzeichen mime={anhang.mime_type} />
            <span className="min-w-0 truncate">{anhang.name}</span>
            <span className="text-ink-muted shrink-0 font-normal">
              {anhangArt(anhang.mime_type)}, {formatBytes(anhang.byte_size)}
            </span>
          </Button>
        ))}
      </div>
      {laden.isPending ? <Statusmeldung className="mt-2">Wird geöffnet …</Statusmeldung> : null}
      {laden.isError ? (
        <Statusmeldung ton="fehler" className="mt-2">
          {laden.error.message}
        </Statusmeldung>
      ) : null}
      {offen ? (
        <Dateiansicht
          bild={offen.bild}
          name={offen.name}
          ohneLeiste
          onSchliessen={() => setOffen(null)}
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
 * und Entfernen.
 */
export function EntwurfsAnhaenge({ anhaenge }: { anhaenge: readonly Entwurfsanhang[] }) {
  if (anhaenge.length === 0) return null;
  return (
    <div className="mb-2 max-h-40 overflow-y-auto">
      <ListRows beschriftung="Anhänge" rahmen={false}>
        {anhaenge.map((a) => (
          <ListRow
            key={a.lokalId}
            dicht
            bild={
              a.vorschau ? (
                <Medienbild vorschau src={a.vorschau} alt={a.name} einpassen="fuellen" />
              ) : (
                <span className="bg-surface-sunken text-ink-muted rounded-button flex size-14 items-center justify-center">
                  <Artzeichen mime={a.mime} className="size-6 shrink-0" />
                </span>
              )
            }
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
  );
}

/**
 * Dateien je Gespräch (ADR-017 Punkt 80): die Anhänge des Gesprächs, die
 * neuesten zuerst - Name, Art, Größe, von wem, wann; ohne Vorschaubild.
 * Öffnen zeigt unter der Zeile wie in der Nachricht (Punkt 77).
 */
export function DateienDesGespraechs({ kanalId, zeitzone }: { kanalId: string; zeitzone: string }) {
  const dateien = useQuery({ queryKey: dateienKey(kanalId), queryFn: () => fetchDateien(kanalId) });
  const [offen, setOffen] = useState<{ id: string; bild: Blob; name: string } | null>(null);
  const laden = useMutation({
    mutationFn: async (datei: Datei) => ({
      id: datei.id,
      bild: await ladeAnhang(datei.id),
      name: datei.display_name,
    }),
    onSuccess: setOffen,
  });
  return (
    <Abfragezustand
      abfrage={dateien}
      laden="Dateien werden geladen …"
      fehler="Die Dateien konnten nicht geladen werden."
    >
      {(daten) => (
        <Listenabschnitt
          titel="Dateien"
          anzahl={daten.length}
          rahmen={false}
          leer={{ titel: 'Noch keine Dateien' }}
        >
          {daten.map((datei) => (
            <ListRow
              key={datei.id}
              dicht
              titel={datei.display_name}
              meta={`${anhangArt(datei.mime_type)} · ${formatBytes(datei.byte_size)} · ${
                datei.author_name ?? 'Ehemaliges Teammitglied'
              } · ${nachrichtenzeit(datei.created_at, zeitzone)}`}
              onClick={() => {
                if (offen?.id === datei.id) setOffen(null);
                else if (!laden.isPending) laden.mutate(datei);
              }}
              darunter={
                laden.isPending && laden.variables?.id === datei.id ? (
                  <Statusmeldung className="mb-2">Wird geöffnet …</Statusmeldung>
                ) : laden.isError && laden.variables?.id === datei.id ? (
                  <Statusmeldung ton="fehler" className="mb-2">
                    {laden.error.message}
                  </Statusmeldung>
                ) : offen?.id === datei.id ? (
                  <div className="mb-3">
                    <Dateiansicht
                      bild={offen.bild}
                      name={offen.name}
                      ohneLeiste
                      onSchliessen={() => setOffen(null)}
                    />
                  </div>
                ) : null
              }
            />
          ))}
        </Listenabschnitt>
      )}
    </Abfragezustand>
  );
}
