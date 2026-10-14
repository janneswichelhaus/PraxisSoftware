import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSperrsicherung } from '@/features/auth/sitzungssperre/sperrsicherung';
import {
  ZWECK_DIKTAT,
  diktatAufbereiten,
  diktatVerfuegbar,
  vorschlagAlsText,
  type Diktatvorschlag,
} from '@/lib/ki/gateway';
import {
  aufnahmeMoeglich,
  mikrofonErlaubt,
  useAufnahme,
  type Aufnahme,
  type Aufnahmefehler,
} from './aufnahme';

/**
 * Das Diktat auf der Schreibseite (BEF-153, KI-EPIC-001, PROJECT_PRINCIPLES.md
 * 6.3): Aufnahme, Aufbereitung im Gateway, Vorschlag, Übernahme.
 *
 * ANN-520: **Der Vorschlag lebt nur im Zustand dieser Seite.** Er steht in
 * keiner Tabelle, keinem Entwurf, keinem Speicher des Geräts; die Rohaufnahme
 * ebenso wenig - sie geht für die Anfrage an den Gateway und bleibt danach nur
 * im Arbeitsspeicher, bis sie aufbereitet oder verworfen ist. Erst „In die
 * Doku übernehmen" fügt den Text ins Feld; ab da ist er Text der Person und
 * geht den Weg jedes getippten Textes, auch das Speichern als Entwurf. Ein
 * nicht übernommener Vorschlag kann deshalb von der automatischen
 * Finalisierung nie erfasst werden (ADR-016 Punkt 10). Wer die Seite
 * verlässt, wird gefragt (Textverlustschutz); danach ist der Vorschlag fort.
 */

/** So heißt die Einfügung im Feld - „„Vorschlag aus der Aufnahme" am Ende eingefügt." */
export const DIKTAT_TITEL = 'Vorschlag aus der Aufnahme';

/** Die Sätze, wenn keine Aufnahme zustande kam - klar, und Tippen geht immer. */
export const AUFNAHMEFEHLER: Readonly<Record<Aufnahmefehler, string>> = {
  verweigert: 'Kein Zugriff auf das Mikrofon. Bitte im Browser erlauben – oder tippen.',
  kein_mikrofon: 'Kein Mikrofon gefunden oder es ist belegt. Bitte tippen.',
  leer: 'Nichts aufgenommen. Bitte noch einmal sprechen.',
  fehler: 'Die Aufnahme ist abgebrochen. Bitte noch einmal sprechen.',
};

/** Ein Vorschlag ohne Text - die Aufnahme enthielt nichts Verständliches. */
export const NICHTS_VERSTANDEN =
  'In der Aufnahme war nichts zu verstehen. Bitte noch einmal sprechen.';

/**
 * Die Sitzungssperre kam während der Aufnahme: angehalten, aber nicht
 * gesendet - nach der Freigabe geht sie mit „Erneut senden“ hinaus.
 */
export const BEI_SPERRE_ANGEHALTEN = 'Bei der Sperre angehalten und nicht gesendet.';

/** Was steht, wenn Festschreiben oder Entwurf wartet (wie beim Befund aus Bausteinen). */
export const DIKTAT_OFFEN =
  'Der Vorschlag aus der Aufnahme steht noch nicht im Text. Bitte übernehmen oder verwerfen, dann speichern oder festschreiben.';
export const AUFNAHME_OFFEN =
  'Die Aufnahme ist noch nicht aufbereitet. Bitte erneut senden oder verwerfen, dann speichern oder festschreiben.';

/** Der Stand nach der Aufnahme. */
export type Diktatstand =
  | { readonly art: 'bereit' }
  | { readonly art: 'aufbereitung' }
  /** Die Aufbereitung scheiterte vorübergehend; die Aufnahme ist noch da. */
  | { readonly art: 'gescheitert'; readonly meldung: string }
  | { readonly art: 'vorschlag'; readonly vorschlag: Diktatvorschlag; readonly text: string };

export function useDiktat({ terminId, aktiv }: { terminId: string; aktiv: boolean }) {
  const [stand, setStand] = useState<Diktatstand>({ art: 'bereit' });
  const [meldung, setMeldung] = useState<string | undefined>(undefined);
  const [hinweis, setHinweis] = useState(false);
  // Die Aufnahme für einen zweiten Versuch - nur im Arbeitsspeicher, nur bis
  // zur Antwort oder zum Verwerfen (ANN-520).
  const zuSenden = useRef<Aufnahme | null>(null);
  const anfrage = useRef<AbortController | null>(null);
  // Der zuletzt übernommene Vorschlag: „Rückgängig" holt ihn zurück.
  const uebernommen = useRef<Extract<Diktatstand, { art: 'vorschlag' }> | null>(null);
  // Vor der Sitzungssperre angehalten: Die Aufnahme bleibt hier und wird
  // nicht gesendet - mit dem Token kurz vor oder nach der Frist des Servers
  // käme sie als Abweisung zurück und wäre verloren.
  const zurueckhalten = useRef(false);

  const aufbereiten = useCallback(
    async (aufnahme: Aufnahme) => {
      anfrage.current?.abort();
      const steuerung = new AbortController();
      anfrage.current = steuerung;
      zuSenden.current = aufnahme;
      setMeldung(undefined);
      setHinweis(false);
      setStand({ art: 'aufbereitung' });

      const ergebnis = await diktatAufbereiten({
        terminId,
        audio: aufnahme.audio,
        dauerS: aufnahme.dauerS,
        signal: steuerung.signal,
      });
      // Abgebrochen oder überholt: Die Antwort gehört zu niemandem mehr.
      if (steuerung.signal.aborted || anfrage.current !== steuerung) return;
      anfrage.current = null;

      if (ergebnis.ok) {
        zuSenden.current = null;
        const text = vorschlagAlsText(ergebnis.vorschlag);
        if (text === '') {
          setStand({ art: 'bereit' });
          setMeldung(NICHTS_VERSTANDEN);
          return;
        }
        setStand({ art: 'vorschlag', vorschlag: ergebnis.vorschlag, text });
        return;
      }
      if (ergebnis.erneutMoeglich) {
        setStand({ art: 'gescheitert', meldung: ergebnis.meldung });
        return;
      }
      zuSenden.current = null;
      setStand({ art: 'bereit' });
      setMeldung(ergebnis.meldung);
    },
    [terminId],
  );

  const aufnahme = useAufnahme({
    onFertig: (fertig) => {
      if (zurueckhalten.current) {
        zurueckhalten.current = false;
        zuSenden.current = fertig;
        setStand({ art: 'gescheitert', meldung: BEI_SPERRE_ANGEHALTEN });
        return;
      }
      void aufbereiten(fertig);
    },
    onFehler: (fehler) => {
      zurueckhalten.current = false;
      setMeldung(AUFNAHMEFEHLER[fehler]);
    },
  });

  // Wer die Seite verlässt, bricht eine laufende Aufbereitung ab.
  useEffect(
    () => () => {
      anfrage.current?.abort();
      zuSenden.current = null;
    },
    [],
  );

  // Vor der Sitzungssperre (ADR-025 Punkt 4) endet eine laufende Aufnahme:
  // Hinter der Sperre gäbe es keine Anzeige mehr. Gesendet wird sie nicht -
  // sie bleibt als „nicht aufbereitet“ stehen (die Seite hält der
  // Textverlustschutz verborgen fest, ANN-257), und nach der Freigabe geht
  // sie mit „Erneut senden“ und der neuen Sitzung hinaus. Wer gerade erst das
  // Mikrofon öffnet, hat noch nichts aufgenommen: Das bricht ab.
  const aufnahmeRef = useRef(aufnahme);
  aufnahmeRef.current = aufnahme;
  useSperrsicherung(() => {
    const laufend = aufnahmeRef.current;
    if (laufend.zustand === 'laeuft') {
      zurueckhalten.current = true;
      laufend.beenden();
    } else if (laufend.zustand === 'startet') {
      laufend.abbrechen();
    }
    return Promise.resolve(true);
  });

  // Angeboten wird „Sprechen“ nur, wo es gehen kann: Die Seite darf das
  // Mikrofon öffnen, und der Gateway meldet das Diktat als eingerichtet
  // (gefragt wird vorher, wie die Karte vor ihren Kacheln). Sonst steht der
  // Weg gar nicht da - kein Knopf, der ins Leere führt, und „Festschreiben“
  // bleibt Hauptknopf.
  const erlaubt = aktiv && mikrofonErlaubt();
  const gateway = useQuery({
    queryKey: ['ki', 'verfuegbar', ZWECK_DIKTAT],
    queryFn: ({ signal }) => diktatVerfuegbar(signal),
    enabled: erlaubt,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  const angeboten = erlaubt && gateway.data === true;

  const beschaeftigt = aufnahme.zustand !== 'bereit' || stand.art === 'aufbereitung';
  const ruhig = !beschaeftigt && stand.art === 'bereit';

  /**
   * Was offen ist und sich nicht speichern lässt - für die Rückfrage des
   * Textverlustschutzes. `undefined`, wenn nichts offen ist.
   */
  const offen: string | undefined =
    aufnahme.zustand !== 'bereit'
      ? 'Die Aufnahme läuft.'
      : stand.art === 'aufbereitung'
        ? 'Die Aufnahme wird aufbereitet.'
        : stand.art === 'gescheitert'
          ? 'Die Aufnahme ist noch nicht aufbereitet.'
          : stand.art === 'vorschlag'
            ? 'Der Vorschlag aus der Aufnahme ist nicht übernommen.'
            : undefined;

  return {
    stand,
    aufnahme,
    meldung,
    hinweis,
    /** Bietet die Seite den Weg an (Gateway eingerichtet, Mikrofon zugelassen)? */
    angeboten,
    /** Und kann dieses Gerät aufnehmen? */
    verfuegbar: angeboten && aufnahmeMoeglich(),
    beschaeftigt,
    ruhig,
    offen,
    /** Vorschlag oder ungesendete Aufnahme halten Festschreiben und Entwurf an. */
    wartet: stand.art === 'vorschlag' || stand.art === 'gescheitert',

    sprechen: () => {
      if (!ruhig) return;
      setMeldung(undefined);
      setHinweis(false);
      uebernommen.current = null;
      zurueckhalten.current = false;
      void aufnahme.starten();
    },
    fertig: aufnahme.beenden,
    abbrechen: () => {
      if (aufnahme.zustand !== 'bereit') {
        aufnahme.abbrechen();
        return;
      }
      if (stand.art === 'aufbereitung') {
        anfrage.current?.abort();
        anfrage.current = null;
        zuSenden.current = null;
        setStand({ art: 'bereit' });
      }
    },
    erneut: () => {
      if (zuSenden.current) void aufbereiten(zuSenden.current);
    },
    verwerfen: () => {
      zuSenden.current = null;
      uebernommen.current = null;
      setHinweis(false);
      setStand({ art: 'bereit' });
    },
    textAendern: (text: string) => {
      if (stand.art === 'vorschlag') setStand({ ...stand, text });
    },
    /** Gibt den geprüften Text zur Übernahme heraus und schließt den Vorschlag. */
    uebernehmen: (): string | null => {
      if (stand.art !== 'vorschlag' || stand.text.trim() === '') return null;
      uebernommen.current = stand;
      setHinweis(false);
      setStand({ art: 'bereit' });
      return stand.text.trim();
    },
    /** Nach „Rückgängig": derselbe Vorschlag wieder zum Prüfen. */
    zurueckholen: () => {
      if (!uebernommen.current) return;
      setStand(uebernommen.current);
      uebernommen.current = null;
    },
    /** Festschreiben oder Entwurf wurde getippt, während etwas offen ist. */
    hinweisen: () => {
      setHinweis(true);
    },
  };
}

export type Diktat = ReturnType<typeof useDiktat>;
