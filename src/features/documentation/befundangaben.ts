import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { BausteinAuswahl, BausteinStand } from '@/features/assessments/bausteinauswahl';
import { befundangabenQueryKey, befundangabenSichern, fetchBefundangaben } from './api';

/**
 * Befundangaben getrennt vom Entwurf (ABN-015, BEF-103 Punkt 1, ANN-120
 * Fassung 2).
 *
 * Ein Vorschlag aus den Bausteinen kommt nur durch „Übernehmen" in den
 * Dokumentationsentwurf - nie still beim Sichern oder Verlassen, weil der
 * Entwurf später von selbst festgeschrieben werden kann (ADR-016 Punkt 7).
 * Die Häkchen, Werte und Seiten bleiben trotzdem erhalten: Sie liegen auf dem
 * Server neben dem Entwurf, bis die Person übernimmt oder verwirft, und fallen
 * beim Festschreiben weg.
 */

/** Leer heißt: nichts angegeben - dann gibt es nichts zu sichern. */
function schluessel(stand: BausteinStand): string {
  return Object.keys(stand.auswahl).length === 0 ? '' : JSON.stringify(stand);
}

/**
 * Lädt einen gesicherten Stand einmal in die Auswahl der Seite und sagt, ob
 * die Auswahl seitdem ungesichert ist. `sichern` legt den heutigen Stand ab -
 * oder verwirft den gesicherten, wenn nichts mehr angegeben ist (übernommen
 * oder verworfen).
 */
export function useGesicherteBefundangaben(
  appointmentId: string,
  bausteine: BausteinAuswahl,
  aktiv: boolean,
): { ungesichert: boolean; sichern: () => Promise<void> } {
  const [gesichert, setGesichert] = useState('');
  const geladen = useRef(false);
  const { wiederherstellen } = bausteine;
  const abfrage = useQuery({
    queryKey: befundangabenQueryKey(appointmentId),
    queryFn: () => fetchBefundangaben(appointmentId),
    enabled: aktiv,
    retry: false,
    staleTime: Infinity,
  });

  // Wer schon angefangen hat, bevor der gesicherte Stand ankam, behält die
  // eigene Auswahl; sie überschreibt beim nächsten Sichern den alten Stand.
  const angefangen = useRef(false);
  angefangen.current = Object.keys(bausteine.auswahl).length > 0;

  useEffect(() => {
    if (geladen.current || abfrage.data === undefined) return;
    geladen.current = true;
    if (abfrage.data === null) return;
    if (angefangen.current) {
      setGesichert(schluessel(abfrage.data));
      return;
    }
    wiederherstellen(abfrage.data);
    setGesichert(schluessel(abfrage.data));
  }, [abfrage.data, wiederherstellen]);

  const jetzt = schluessel({ auswahl: bausteine.auswahl, seitenwahl: bausteine.seitenwahl });
  const jetztRef = useRef({
    jetzt,
    stand: { auswahl: bausteine.auswahl, seitenwahl: bausteine.seitenwahl },
  });
  jetztRef.current = {
    jetzt,
    stand: { auswahl: bausteine.auswahl, seitenwahl: bausteine.seitenwahl },
  };

  const sichern = useCallback(async () => {
    const { jetzt: stand, stand: daten } = jetztRef.current;
    await befundangabenSichern(appointmentId, stand === '' ? null : daten);
    setGesichert(stand);
  }, [appointmentId]);

  return { ungesichert: aktiv && jetzt !== gesichert, sichern };
}

/**
 * Was nach „Entwurf" beim Termin steht: Ein nicht übernommener Vorschlag wird
 * genannt, damit niemand ihn im Eintrag vermutet.
 */
export function entwurfMeldung(textGesichert: boolean, vorschlagOffen: boolean): string {
  if (!textGesichert) return 'Befundangaben gesichert – noch nicht im Eintrag.';
  return vorschlagOffen
    ? 'Entwurf gespeichert – noch nicht finalisiert. Der Vorschlag aus den Bausteinen ist nicht übernommen; seine Angaben bleiben gesichert.'
    : 'Entwurf gespeichert – noch nicht finalisiert.';
}
