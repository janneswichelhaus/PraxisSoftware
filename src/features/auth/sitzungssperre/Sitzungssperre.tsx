import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Vollseite } from '@/app/Vollseite';
import { useSession } from '../sessionContext';
import {
  BEDIENUNG_MELDEN_ALLE_MS,
  SICHERUNG_HOECHSTENS_MS,
  ersteFrist,
  ladeSperrstand,
  sperrzeitpunkt,
  type Sperrgrund,
  type Sperrstand,
} from './sperrstand';
import { SperrsicherungKontext, type Sicherung, type Sperrsicherung } from './sperrsicherung';
import { Sperrseite } from './Sperrseite';

/**
 * Die Sitzungssperre der Oberfläche (SEC-EPIC-001, ADR-025).
 *
 * Steht zwischen der Sitzung und allem, was angemeldet zu sehen ist - Praxis
 * wie Plattform (Punkt 8). Sie
 *
 *   * **prüft zuerst** (Punkt 5): Beim Öffnen, Neuladen und bei jeder
 *     Rückkehr mit abgelaufener Frist steht nichts als „Sitzung wird geprüft“
 *     da, bis der Server geantwortet hat;
 *   * **sperrt** zur früheren der beiden Fristen, die der Server meldet - 30
 *     Minuten nach der letzten Bedienung, 60 nach der Anmeldung (Punkte 1, 2) -,
 *     mit `VORLAUF_MS` Vorsprung, damit offene Texte noch als Entwurf auf den
 *     Server kommen (Punkt 4);
 *   * **meldet Bedienung**: ein Tipp, Klick oder Tastendruck, höchstens einmal
 *     je Minute (W2 (a), ANN-256). Hintergrundabrufe zählen nicht;
 *   * **räumt** beim Sperren den Abfragespeicher ab und gibt die Seiten frei
 *     (Punkt 3). Bleibt ein Text ungesichert, bleibt die Seite verborgen
 *     stehen und kommt nach der Freigabe wieder (ANN-257).
 *
 * Gesperrt ist nicht abgemeldet: Die Sitzung beim Anmeldedienst bleibt, und
 * nach der Freigabe steht dieselbe Adresse da. Wer stattdessen „Mit anderem
 * Konto anmelden“ wählt, meldet ab; dann räumt der `SessionProvider`.
 */

type Phase =
  /** Erste Prüfung läuft; noch nichts gezeigt. */
  | 'start'
  /** Sitzung offen, Inhalt sichtbar. */
  | 'offen'
  /** Frist abgelaufen oder Rückkehr: Inhalt verborgen, Prüfung oder Sicherung läuft. */
  | 'pruefen'
  /** Gesperrt, Seiten freigegeben, Speicher geräumt. */
  | 'gesperrt'
  /** Gesperrt, aber eine Seite mit ungesichertem Text steht verborgen (Punkt 4). */
  | 'halten'
  /** Die erste Prüfung scheiterte - nichts zeigen, erneut anbieten. */
  | 'fehler';

/** Wartet höchstens `ms` auf eine Sicherung; zu spät oder gescheitert heißt „nicht gesichert“. */
function mitFrist(sicherung: Sicherung, ms: number): Promise<boolean> {
  return new Promise((fertig) => {
    const uhr = setTimeout(() => fertig(false), ms);
    sicherung().then(
      (ok) => {
        clearTimeout(uhr);
        fertig(ok);
      },
      () => {
        clearTimeout(uhr);
        fertig(false);
      },
    );
  });
}

export function Sitzungssperre({ children }: { children: ReactNode }) {
  const { session, signOut } = useSession();
  const queryClient = useQueryClient();
  const [phase, setPhase] = useState<Phase>('start');
  const [grund, setGrund] = useState<Sperrgrund>('inaktiv');
  const phaseRef = useRef<Phase>(phase);
  phaseRef.current = phase;

  /** Gerätezeit, zu der die Oberfläche sperrt; `null` bis zur ersten Antwort. */
  const sperrAm = useRef<number | null>(null);
  /** Welche Frist dann endet - für den Satz auf der Sperrseite. */
  const sperrGrund = useRef<Sperrgrund>('inaktiv');
  const [takt, setTakt] = useState(0);
  const zuletztGemeldet = useRef(0);
  const meldetGerade = useRef(false);
  const sicherungen = useRef(new Set<Sicherung>());
  /** Der Tabtitel vor der Sperre - die Sperrseite setzt „Anmelden“. */
  const titelVorher = useRef<string | null>(null);

  const sperren = useCallback(
    async (anlass: Sperrgrund) => {
      const jetzt = phaseRef.current;
      if (jetzt === 'gesperrt' || jetzt === 'halten') return;
      phaseRef.current = 'pruefen';
      setPhase('pruefen');
      titelVorher.current ??= document.title;
      const ergebnisse = await Promise.all(
        [...sicherungen.current].map((s) => mitFrist(s, SICHERUNG_HOECHSTENS_MS)),
      );
      setGrund(anlass);
      if (ergebnisse.every(Boolean)) {
        // Punkt 3: keine zwischengespeicherte Antwort bleibt stehen.
        queryClient.clear();
        phaseRef.current = 'gesperrt';
        setPhase('gesperrt');
      } else {
        phaseRef.current = 'halten';
        setPhase('halten');
      }
    },
    [queryClient],
  );

  const uebernehmen = useCallback(
    (stand: Sperrstand, antwortAm: number) => {
      if (stand.gesperrt) {
        void sperren(stand.grund);
        return;
      }
      sperrAm.current = sperrzeitpunkt(stand, antwortAm);
      sperrGrund.current = ersteFrist(stand);
      setTakt((n) => n + 1);
      const vorher = phaseRef.current;
      if (vorher === 'offen') return;
      if (vorher === 'halten') {
        // Die verborgene Seite kommt zurück; was sie zeigt, wird frisch geholt.
        void queryClient.invalidateQueries();
      }
      if (vorher === 'halten' || vorher === 'gesperrt') {
        if (titelVorher.current) document.title = titelVorher.current;
        titelVorher.current = null;
      }
      phaseRef.current = 'offen';
      setPhase('offen');
    },
    [sperren, queryClient],
  );

  const pruefen = useCallback(async () => {
    try {
      const stand = await ladeSperrstand(false);
      uebernehmen(stand, Date.now());
    } catch {
      const jetzt = phaseRef.current;
      if (jetzt === 'start') {
        setPhase('fehler');
        return;
      }
      // Ohne Antwort zählt die eigene Uhr: Ist die Frist um, wird gesperrt.
      if (sperrAm.current !== null && Date.now() >= sperrAm.current) {
        void sperren(sperrGrund.current);
      } else if (jetzt === 'pruefen') {
        phaseRef.current = 'offen';
        setPhase('offen');
      }
    }
  }, [uebernehmen, sperren]);

  // Punkt 5: Vor dem ersten Bild fragt die Anwendung den Server.
  useEffect(() => {
    void pruefen();
  }, [pruefen]);

  // Die Uhr bis zur nächsten Frist. Läuft sie ab, fragt die Oberfläche den
  // Server: Hat ein zweiter Tab derselben Sitzung inzwischen eine Bedienung
  // gemeldet, geht es ohne Sperre weiter.
  useEffect(() => {
    if (phase !== 'offen' || sperrAm.current === null) return;
    const uhr = setTimeout(() => void pruefen(), Math.max(0, sperrAm.current - Date.now()));
    return () => clearTimeout(uhr);
  }, [phase, takt, pruefen]);

  // Bedienung melden - Tipp, Klick, Tastendruck; höchstens einmal je Minute.
  useEffect(() => {
    if (phase !== 'offen') return;
    function bedient() {
      if (meldetGerade.current) return;
      if (Date.now() - zuletztGemeldet.current < BEDIENUNG_MELDEN_ALLE_MS) return;
      meldetGerade.current = true;
      zuletztGemeldet.current = Date.now();
      ladeSperrstand(true)
        .then((stand) => uebernehmen(stand, Date.now()))
        .catch(() => {
          // Ohne Netz bleibt die bisherige Frist; die Uhr sperrt danach.
        })
        .finally(() => {
          meldetGerade.current = false;
        });
    }
    document.addEventListener('pointerdown', bedient, true);
    document.addEventListener('keydown', bedient, true);
    return () => {
      document.removeEventListener('pointerdown', bedient, true);
      document.removeEventListener('keydown', bedient, true);
    };
  }, [phase, uebernehmen]);

  // Punkt 5: Rückkehr - Bildschirm an, App im Vordergrund, Fenster im Fokus.
  // Ist die Frist um, verschwindet der Inhalt sofort, noch vor der Antwort.
  useEffect(() => {
    function zurueck() {
      if (document.visibilityState === 'hidden') return;
      const jetzt = phaseRef.current;
      if (jetzt === 'gesperrt' || jetzt === 'halten') {
        // In einem anderen Tab freigegeben? Dann gilt die neue Anmeldung.
        void pruefen();
        return;
      }
      if (jetzt !== 'offen' || sperrAm.current === null) return;
      if (Date.now() < sperrAm.current) return;
      phaseRef.current = 'pruefen';
      setPhase('pruefen');
      void pruefen();
    }
    document.addEventListener('visibilitychange', zurueck);
    window.addEventListener('focus', zurueck);
    window.addEventListener('pageshow', zurueck);
    return () => {
      document.removeEventListener('visibilitychange', zurueck);
      window.removeEventListener('focus', zurueck);
      window.removeEventListener('pageshow', zurueck);
    };
  }, [pruefen]);

  const sicherung = useMemo<Sperrsicherung>(
    () => ({
      meldeAn: (s) => {
        sicherungen.current.add(s);
        return () => sicherungen.current.delete(s);
      },
    }),
    [],
  );

  const sichtbar = phase === 'offen';
  const steht = phase === 'offen' || phase === 'pruefen' || phase === 'halten';

  return (
    <SperrsicherungKontext.Provider value={sicherung}>
      {phase === 'start' || phase === 'pruefen' ? (
        <Vollseite>
          <LoadingState label="Sitzung wird geprüft …" />
        </Vollseite>
      ) : null}
      {phase === 'fehler' ? (
        <Vollseite titel="Sitzung nicht geprüft">
          <ErrorState
            title="Die Sitzung konnte nicht geprüft werden."
            description="Bitte die Verbindung prüfen und erneut versuchen."
            onErneut={() => {
              phaseRef.current = 'start';
              setPhase('start');
              void pruefen();
            }}
          />
          <Button variant="secondary" className="mt-4 w-full" onClick={() => void signOut()}>
            Abmelden
          </Button>
        </Vollseite>
      ) : null}
      {phase === 'gesperrt' || phase === 'halten' ? (
        <Sperrseite
          grund={grund}
          haelt={phase === 'halten'}
          email={session?.user.email}
          onEntsperrt={() => void pruefen()}
          onAbmelden={() => void signOut()}
        />
      ) : null}
      {steht ? (
        // Immer dasselbe Element an derselben Stelle: Verbergen hängt die
        // Seite nicht aus, Zeigen hängt sie nicht neu ein (Punkt 4).
        <div
          data-testid="sitzung-inhalt"
          className={sichtbar ? 'contents' : undefined}
          hidden={!sichtbar}
          inert={!sichtbar}
          aria-hidden={sichtbar ? undefined : true}
        >
          {children}
        </div>
      ) : null}
    </SperrsicherungKontext.Provider>
  );
}
