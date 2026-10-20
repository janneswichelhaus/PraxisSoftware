import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Vollseite } from '@/app/Vollseite';
import { FENSTERZIEL, PortalZielKontext } from '@/components/ui/portalZiel';
import { useSession } from '../sessionContext';
import {
  BEDIENUNG_MELDEN_ALLE_MS,
  SPERRFRISTEN,
  SICHERUNG_HOECHSTENS_MS,
  VORLAUF_MS,
  ersteFrist,
  ladeSperrstand,
  sperrzeitpunkt,
  type Sperrgrund,
  type Sperrstand,
} from './sperrstand';
import { SperrsicherungKontext, type Sicherung, type Sperrsicherung } from './sperrsicherung';
import { Sperrseite } from './Sperrseite';
import { SperreOhneNetz } from './SperreOhneNetz';
import { freigabeOhneNetzMoeglich } from '../freigabeOhneNetz';

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
 * nach der Freigabe - per Passkey oder App-PIN (ADR-025 Fassung 2) - steht
 * dieselbe Adresse da. Nur eine verbrauchte Sitzung (fünf falsche PINs) kommt
 * nicht wieder; die Sperrseite führt dann zur Anmeldung. Wer stattdessen „Mit anderem
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
  | 'fehler'
  /**
   * TRK-009: gesperrt oder ungeprüft ohne Verbindung, und das Gerät hat etwas
   * abgelegt: Freigabe per Passkey für die Ablage anbieten (ADR-025 Punkt 16).
   */
  | 'ohneNetz'
  /** TRK-009: ohne Netz freigegeben - nur die Ablage auf dem Gerät ist zu sehen. */
  | 'lokal';

/**
 * Was die Anwendung ohne Netz öffnen kann (TRK-009). Die Sperre kennt nur die
 * Frage und die Ansicht; was abgelegt ist, weiß das Modul, das ablegt.
 */
export interface OhneNetz {
  /** OFF-003: Was die Sperrseite ohne Netz verspricht; ohne Angabe die Übungen. */
  einleitung?: string | undefined;
  /** Liegt für dieses Konto etwas auf dem Gerät, das ohne Netz zu öffnen lohnt? */
  hatAblage: () => Promise<boolean>;
  /** Die lokale Ansicht; `sperren` schließt sie wieder. */
  ansicht: (sperren: () => void) => ReactNode;
}

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

export function Sitzungssperre({
  children,
  ohneNetz,
}: {
  children: ReactNode;
  ohneNetz?: OhneNetz | undefined;
}) {
  const { signOut, session } = useSession();
  const besitzer = session?.user.id ?? '';
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
        // Die festgehaltene Seite braucht ihre eigenen Abfragen; alles andere
        // verlässt den Speicher (Punkt 3).
        queryClient.removeQueries({ type: 'inactive' });
        phaseRef.current = 'halten';
        setPhase('halten');
      }
    },
    [queryClient],
  );

  /**
   * TRK-009: Bietet dieses Gerät die Freigabe ohne Netz an? Nur mit einem
   * abgelegten Schlüssel (Punkt 16) und mit etwas in der Ablage.
   */
  const ohneNetzGeht = useCallback(async (): Promise<boolean> => {
    if (!ohneNetz || !besitzer) return false;
    try {
      return (await freigabeOhneNetzMoeglich(besitzer)) && (await ohneNetz.hatAblage());
    } catch {
      return false;
    }
  }, [ohneNetz, besitzer]);

  const uebernehmen = useCallback(
    (stand: Sperrstand, antwortAm: number) => {
      if (stand.gesperrt) {
        void sperren(stand.grund);
        return;
      }
      sperrAm.current = sperrzeitpunkt(stand, antwortAm);
      sperrGrund.current = ersteFrist(stand);
      const vorher = phaseRef.current;
      // Im Vorlauf: Der Server sieht die Sitzung noch offen, nimmt also noch
      // Entwürfe an - jetzt sperren, nicht erst, wenn er zu ist (Punkt 4).
      // Gilt nicht für eine gerade freigegebene Sitzung: Dort ist die Frist
      // frisch, und ein Vorlauf läge nie in der Vergangenheit.
      if (sperrAm.current <= Date.now() && vorher !== 'gesperrt' && vorher !== 'halten') {
        void sperren(sperrGrund.current);
        return;
      }
      setTakt((n) => n + 1);
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
        // Ohne Antwort ist nichts geprüft (Punkt 5). Liegt etwas auf dem
        // Gerät, öffnet es der Passkey (TRK-009), sonst bleibt der Fehler.
        const naechste: Phase = (await ohneNetzGeht()) ? 'ohneNetz' : 'fehler';
        if (phaseRef.current === 'start') {
          phaseRef.current = naechste;
          setPhase(naechste);
        }
        return;
      }
      if (jetzt === 'ohneNetz' || jetzt === 'lokal') return;
      // Ohne Antwort zählt die eigene Uhr: Ist die Frist um, wird gesperrt.
      if (sperrAm.current !== null && Date.now() >= sperrAm.current) {
        void sperren(sperrGrund.current);
      } else if (jetzt === 'pruefen') {
        phaseRef.current = 'offen';
        setPhase('offen');
      }
    }
  }, [uebernehmen, sperren, ohneNetzGeht]);

  // Punkt 5: Vor dem ersten Bild fragt die Anwendung den Server.
  useEffect(() => {
    void pruefen();
  }, [pruefen]);

  // Die Uhr bis zur nächsten Frist. Läuft sie ab, fragt die Oberfläche den
  // Server: Hat ein zweiter Tab derselben Sitzung inzwischen eine Bedienung
  // gemeldet, geht es ohne Sperre weiter.
  useEffect(() => {
    if (phase !== 'offen' || sperrAm.current === null) return;
    const uhr = setTimeout(
      () => {
        // Kam die Uhr zu spät (Gerät schlief, ohne Rückkehr-Ereignis) und ist
        // auch die Frist des Servers um: erst verbergen, dann fragen.
        if (sperrAm.current !== null && Date.now() >= sperrAm.current + VORLAUF_MS) {
          phaseRef.current = 'pruefen';
          setPhase('pruefen');
        }
        void pruefen();
      },
      Math.max(0, sperrAm.current - Date.now()),
    );
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

  // TRK-009: Gesperrt und ohne Verbindung - der Passkey öffnet die Ablage.
  // Mit Verbindung zurück: wie beim Öffnen erst prüfen; übertragen wird nur
  // in einer Sitzung, die der Server offen nennt (Punkt 16).
  useEffect(() => {
    async function getrennt() {
      if (phaseRef.current !== 'gesperrt') return;
      if (!(await ohneNetzGeht()) || phaseRef.current !== 'gesperrt') return;
      phaseRef.current = 'ohneNetz';
      setPhase('ohneNetz');
    }
    function verbunden() {
      const jetzt = phaseRef.current;
      if (jetzt !== 'ohneNetz' && jetzt !== 'lokal') return;
      queryClient.clear();
      phaseRef.current = 'start';
      setPhase('start');
      void pruefen();
    }
    if (phase === 'gesperrt' && typeof navigator !== 'undefined' && !navigator.onLine) {
      void getrennt();
    }
    const offline = () => void getrennt();
    window.addEventListener('offline', offline);
    window.addEventListener('online', verbunden);
    return () => {
      window.removeEventListener('offline', offline);
      window.removeEventListener('online', verbunden);
    };
  }, [phase, ohneNetzGeht, pruefen, queryClient]);

  // TRK-009: Die Fristen gelten auch für die lokale Ansicht (ADR-024 Punkt 9),
  // gerechnet ab der Freigabe ohne Netz mit der Uhr des Geräts.
  useEffect(() => {
    if (phase !== 'lokal') return;
    const geoeffnet = Date.now();
    let bedient = geoeffnet;
    const zurueck = () => {
      queryClient.clear();
      phaseRef.current = 'ohneNetz';
      setPhase('ohneNetz');
    };
    const pruefenLokal = () => {
      const jetzt = Date.now();
      if (
        jetzt - geoeffnet >= SPERRFRISTEN.hoechstMinuten * 60_000 ||
        jetzt - bedient >= SPERRFRISTEN.inaktivMinuten * 60_000
      ) {
        zurueck();
      }
    };
    const uhr = window.setInterval(pruefenLokal, 15_000);
    // Punkt 5: bei der Rückkehr sofort, nicht erst beim nächsten Takt
    // (Zweitreview H4).
    const rueckkehr = () => {
      if (document.visibilityState !== 'hidden') pruefenLokal();
    };
    const bedienung = () => {
      bedient = Date.now();
    };
    document.addEventListener('visibilitychange', rueckkehr);
    window.addEventListener('focus', rueckkehr);
    window.addEventListener('pageshow', rueckkehr);
    document.addEventListener('pointerdown', bedienung, true);
    document.addEventListener('keydown', bedienung, true);
    return () => {
      window.clearInterval(uhr);
      document.removeEventListener('visibilitychange', rueckkehr);
      window.removeEventListener('focus', rueckkehr);
      window.removeEventListener('pageshow', rueckkehr);
      document.removeEventListener('pointerdown', bedienung, true);
      document.removeEventListener('keydown', bedienung, true);
    };
  }, [phase, queryClient]);

  const sicherung = useMemo<Sperrsicherung>(
    () => ({
      meldeAn: (s) => {
        sicherungen.current.add(s);
        return () => sicherungen.current.delete(s);
      },
    }),
    [],
  );

  const [portalZiel, setPortalZiel] = useState<HTMLElement | null>(null);
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
      {phase === 'ohneNetz' ? (
        <SperreOhneNetz
          besitzer={besitzer}
          einleitung={ohneNetz?.einleitung}
          onFreigegeben={() => {
            phaseRef.current = 'lokal';
            setPhase('lokal');
          }}
          onErneut={() => {
            phaseRef.current = 'start';
            setPhase('start');
            void pruefen();
          }}
        />
      ) : null}
      {phase === 'lokal' && ohneNetz
        ? ohneNetz.ansicht(() => {
            queryClient.clear();
            phaseRef.current = 'ohneNetz';
            setPhase('ohneNetz');
          })
        : null}
      {phase === 'gesperrt' || phase === 'halten' ? (
        <Sperrseite
          grund={grund}
          haelt={phase === 'halten'}
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
          {/* Die Seite zeichnet erst, wenn das Ziel der Fenster steht: Ein
              Fenster, das beim ersten Zeichnen schon offen ist, zöge sonst
              vom `body` hierher um und behielte Fokuskreis und Sperre vom
              ersten Ort (Zweitreview BEF-175; wie `MitFensterZiel`). */}
          {portalZiel ? (
            <PortalZielKontext.Provider value={portalZiel}>{children}</PortalZielKontext.Provider>
          ) : null}
          {/* Fenster (`Dialogfenster`) werden hier gezeichnet, nicht am
              `body`: So verbirgt die Sperre sie mit (Zweitreview). */}
          <div ref={setPortalZiel} data-testid="sitzung-fenster" {...{ [FENSTERZIEL]: '' }} />
        </div>
      ) : null}
    </SperrsicherungKontext.Provider>
  );
}
