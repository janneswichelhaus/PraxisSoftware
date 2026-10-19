import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { Button } from '@/components/ui/Button';
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
  profilbildKey,
  setzeProfilbild,
  waehleFarbe,
  type Avatar,
} from './api';
import { FOTO_NICHT_LESBAR, rechneProfilbild } from './profilbild';
import { avatarVon, eigenerAvatar, useAvatare, useProfilbild } from './teambilder';

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
export function ProfilAbschnitt({ name }: { name: string }) {
  const queryClient = useQueryClient();
  const avatare = useAvatare();
  // Die eigene Zeile markiert der Server - auch für Rollen, deren
  // Mitarbeiterdatensatz die Anwendung sonst nicht liest.
  const eigen = eigenerAvatar(avatare.data);
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

  // Nur die Liste, nicht die Bilder: Ein Bild ändert sich unter seiner
  // Kennung nie (ADR-017 Punkt 91).
  const neuLaden = () => queryClient.invalidateQueries({ queryKey: AVATARE_KEY, exact: true });
  const farbe = useMutation({ mutationFn: waehleFarbe, onSuccess: neuLaden });
  const speichern = useMutation({
    mutationFn: (bild: Blob) => setzeProfilbild(bild),
    onSuccess: (neueId, bild) => {
      // Das gespeicherte Bild ist das gerechnete: sofort zeigen, ohne es
      // gleich wieder vom Server zu holen.
      queryClient.setQueryData(profilbildKey(neueId), URL.createObjectURL(bild));
      queryClient.setQueryData<Avatar[]>(AVATARE_KEY, (alt) =>
        alt?.map((a) => (a.own ? { ...a, picture_id: neueId } : a)),
      );
      setVorschau(null);
      setGespeichert('gesetzt');
      void neuLaden();
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

  // Ohne eigenen Mitarbeiterdatensatz gibt es kein Bild im Teamchat.
  if (avatare.isSuccess && !eigen) return null;

  return (
    <Section titel="Bild und Farbe im Teamchat">
      <Abfragezustand
        abfrage={avatare}
        laden="Bild und Farbe werden geladen …"
        fehler="Bild und Farbe konnten nicht geladen werden."
      >
        {(daten) => {
          const meins = eigenerAvatar(daten);
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
                      {/* Sekundär: Auf der Seite bleibt „PIN festlegen“ der eine
                          Hauptknopf (Regel 4, Design-Review TEAM-007). */}
                      <Button
                        type="button"
                        variant="secondary"
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
              {/* Zerstörendes leise am Ende, mit Rückfrage (DESIGN.md 9.16). */}
              {mitBild && !vorschau ? (
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
            </div>
          );
        }}
      </Abfragezustand>
    </Section>
  );
}
