import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { Button } from '@/components/ui/Button';
import { Kleingedrucktes } from '@/components/ui/Kleingedrucktes';
import { Farbpunkt, Personenbild } from '@/components/ui/Personenbild';
import {
  PERSONENFARBE_NAMEN,
  PERSONENFARBEN,
  type Personenfarbe,
} from '@/components/ui/personenfarben';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { Section } from '@/components/ui/Section';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Wahlreihe } from '@/components/ui/Wahlreihe';
import {
  AVATARE_KEY,
  PERSONEN_KEY,
  entferneProfilbild,
  fetchPersonen,
  setzeProfilbild,
  waehleFarbe,
} from './api';
import { FOTO_NICHT_LESBAR, rechneProfilbild } from './profilbild';
import { avatarVon, useAvatare, useProfilbild } from './teambilder';

const WAHLEN = PERSONENFARBEN.map((farbe) => ({
  wert: farbe,
  text: PERSONENFARBE_NAMEN[farbe],
  zeichen: <Farbpunkt farbe={farbe} />,
}));

interface Vorschau {
  bild: Blob;
  adresse: string;
}

/**
 * Wie man im Teamchat aussieht (TEAM-006, TEAM-007): das eigene Profilbild und
 * die eigene Farbe, gewählt nur von der Person selbst (ANN-666, ANN-667).
 *
 * Ein Foto wird auf dem Gerät zum Quadrat gerechnet und erst nach einem Blick
 * auf die Vorschau gespeichert; das Original verlässt das Gerät nie (ADR-017
 * Abschnitt O). Ein Tipp auf eine Farbe speichert sie; darunter steht, wer
 * sie noch trägt - doppelt ist erlaubt, aber selten gewollt.
 */
export function ProfilAbschnitt({ staffMemberId, name }: { staffMemberId: string; name: string }) {
  const queryClient = useQueryClient();
  const avatare = useAvatare();
  const eigen = avatarVon(avatare.data, staffMemberId);
  const aktuell = useProfilbild(eigen?.picture_id);
  const personen = useQuery({ queryKey: PERSONEN_KEY, queryFn: fetchPersonen, staleTime: 300_000 });
  const dateiwahl = useRef<HTMLInputElement>(null);
  const [vorschau, setVorschau] = useState<Vorschau | null>(null);
  const [rechnet, setRechnet] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [gespeichert, setGespeichert] = useState<'gesetzt' | 'entfernt' | null>(null);

  // Die Vorschau lebt nur im Arbeitsspeicher der Seite und geht mit ihr.
  useEffect(() => {
    if (!vorschau) return;
    return () => URL.revokeObjectURL(vorschau.adresse);
  }, [vorschau]);

  const neuLaden = () => queryClient.invalidateQueries({ queryKey: AVATARE_KEY });
  const farbe = useMutation({ mutationFn: waehleFarbe, onSuccess: neuLaden });
  const speichern = useMutation({
    mutationFn: (bild: Blob) => setzeProfilbild(bild),
    onSuccess: async () => {
      await neuLaden();
      setVorschau(null);
      setGespeichert('gesetzt');
    },
  });
  const entfernen = useMutation({
    mutationFn: entferneProfilbild,
    onSuccess: async () => {
      await neuLaden();
      setGespeichert('entfernt');
    },
  });

  async function fotoGewaehlt(datei: File | undefined) {
    if (!datei) return;
    setProblem(null);
    setGespeichert(null);
    speichern.reset();
    setRechnet(true);
    try {
      const bild = await rechneProfilbild(datei);
      setVorschau({ bild, adresse: URL.createObjectURL(bild) });
    } catch (fehler) {
      setProblem(fehler instanceof Error ? fehler.message : FOTO_NICHT_LESBAR);
    } finally {
      setRechnet(false);
    }
  }

  return (
    <Section titel="Bild und Farbe im Teamchat">
      <Abfragezustand
        abfrage={avatare}
        laden="Bild und Farbe werden geladen …"
        fehler="Bild und Farbe konnten nicht geladen werden."
      >
        {(daten) => {
          const meins = avatarVon(daten, staffMemberId);
          const gewaehlt: Personenfarbe | null = farbe.isPending
            ? farbe.variables
            : (meins?.color ?? null);
          const auchBei = (personen.data ?? [])
            .filter((p) => avatarVon(daten, p.staff_member_id)?.color === gewaehlt)
            .map((p) => p.name);
          const mitBild = Boolean(meins?.picture_id);
          return (
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center gap-4">
                <Personenbild
                  name={name}
                  farbe={gewaehlt}
                  bild={vorschau ? vorschau.adresse : mitBild ? aktuell.data : null}
                  groesse="gross"
                />
                <div className="flex flex-col items-start gap-2">
                  {vorschau ? (
                    <>
                      <Button
                        type="button"
                        disabled={speichern.isPending}
                        onClick={() => speichern.mutate(vorschau.bild)}
                      >
                        {speichern.isPending ? 'Wird gespeichert …' : 'Foto speichern'}
                      </Button>
                      <Button
                        type="button"
                        variant="quiet"
                        disabled={speichern.isPending}
                        onClick={() => {
                          setVorschau(null);
                          speichern.reset();
                        }}
                      >
                        Abbrechen
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={rechnet}
                        onClick={() => dateiwahl.current?.click()}
                      >
                        {rechnet
                          ? 'Foto wird vorbereitet …'
                          : mitBild
                            ? 'Anderes Foto'
                            : 'Foto wählen'}
                      </Button>
                      {mitBild ? (
                        <Rueckfrage
                          ausloeser="Foto entfernen"
                          ausloeserVariante="quiet"
                          bestaetigen="Entfernen"
                          bestaetigenLaeuft="Wird entfernt …"
                          laeuft={entfernen.isPending}
                          fehler={entfernen.isError ? entfernen.error.message : undefined}
                          onBestaetigen={() => entfernen.mutateAsync()}
                          onAbbrechen={() => entfernen.reset()}
                        >
                          Im Teamchat stehen danach wieder die Initialen.
                        </Rueckfrage>
                      ) : null}
                    </>
                  )}
                </div>
                {/* Nur im Arbeitsspeicher, kein Hochladen des Originals. */}
                <input
                  ref={dateiwahl}
                  type="file"
                  accept="image/*"
                  aria-label="Foto für das Profilbild"
                  className="sr-only"
                  tabIndex={-1}
                  onChange={(e) => {
                    void fotoGewaehlt(e.target.files?.[0]);
                    e.target.value = '';
                  }}
                />
              </div>
              {vorschau ? <Statusmeldung>Vorschau – noch nicht gespeichert.</Statusmeldung> : null}
              {problem ? <Statusmeldung ton="fehler">{problem}</Statusmeldung> : null}
              {speichern.isError ? (
                <Statusmeldung ton="fehler">{speichern.error.message}</Statusmeldung>
              ) : null}
              {gespeichert && !vorschau ? (
                <Statusmeldung ton="erfolg">
                  {gespeichert === 'gesetzt' ? 'Foto gespeichert.' : 'Foto entfernt.'}
                </Statusmeldung>
              ) : null}
              <Wahlreihe
                legende="Farbe"
                wahlen={WAHLEN}
                gewaehlt={gewaehlt}
                onWaehlen={(neu) => {
                  if (neu !== gewaehlt) farbe.mutate(neu);
                }}
                zusatz={
                  auchBei.length > 0 ? (
                    <p className="text-ink-muted text-sm">Auch bei {auchBei.join(', ')}</p>
                  ) : undefined
                }
              />
              {farbe.isError ? (
                <Statusmeldung ton="fehler">{farbe.error.message}</Statusmeldung>
              ) : null}
              <Kleingedrucktes>
                Freiwillig. Bild und Farbe sieht nur das Team im Teamchat. Das Foto wird auf diesem
                Gerät verkleinert; mit dem Ausscheiden aus der Praxis wird es gelöscht.
              </Kleingedrucktes>
            </div>
          );
        }}
      </Abfragezustand>
    </Section>
  );
}
