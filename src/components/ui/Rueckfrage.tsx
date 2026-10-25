import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from './Button';
import { Statusmeldung } from './Statusmeldung';
import { istVersprechen } from './versprechen';

/** Fehlersatz, wenn ein Vorgang scheitert und die Seite keinen eigenen nennt. */
const STANDARDFEHLER = 'Das hat nicht geklappt. Bitte die Verbindung prüfen und erneut versuchen.';

/**
 * Rückfrage an der Stelle des Klicks; was dort aus dem Blick fiele, kommt als `Dialogfenster`
 * (ANN-058). Der Fokus geht aufs Bestätigen und beim Abbrechen zurück. Liefert `onBestaetigen` ein
 * Versprechen, bleibt der Kasten bis zum Ergebnis offen und zeigt einen Fehler (§13).
 */
export function Rueckfrage({
  ausloeser,
  ausloeserVariante = 'secondary',
  ausloeserGroesse = 'normal',
  ausloeserZusatz,
  ausloeserBreit = false,
  ausloeserAutofokus = false,
  unterDerReihe = false,
  bezeichnung,
  bestaetigen,
  bestaetigenLaeuft,
  abbrechen = 'Abbrechen',
  fehler,
  laeuft = false,
  onBestaetigen,
  onAbbrechen,
  children,
}: {
  /** Beschriftung der Schaltfläche, die die Rückfrage öffnet. */
  ausloeser: string;
  ausloeserVariante?: 'primary' | 'secondary' | 'quiet';
  /** `kompakt` in dichten Leisten (Design-Handoff 2026-10-01, Abschnitt 6). */
  ausloeserGroesse?: 'normal' | 'kompakt';
  /**
   * Für Vorlesesoftware hinter dem sichtbaren Wort, etwa wessen Termin
   * („für Erika Beispiel um 10:00 Uhr“): Stehen gleiche Auslöser
   * untereinander, sind sie so zu unterscheiden. Der Name beginnt mit dem
   * sichtbaren Wort, damit die Sprachsteuerung ihn trifft (UEB-10, WCAG
   * 2.5.3); das Leerzeichen dazwischen setzt der Baustein wie bei „Doku“.
   */
  ausloeserZusatz?: string | undefined;
  /** Der Auslöser in voller Breite, wie der Hauptknopf einer Frageseite (FLT-005). */
  ausloeserBreit?: boolean;
  /**
   * Der Auslöser ist der Startpunkt des Fokus im `Dialogfenster`
   * (`data-autofocus`), etwa die Antwort im geführten Check-Up.
   */
  ausloeserAutofokus?: boolean;
  /**
   * Der Auslöser steht in einer umbrechenden Knopfreihe: Der Kasten rückt
   * über die ganze Breite unter die übrigen Knöpfe, statt sie unter sich zu
   * schieben (`order-last`, wie die Felder der Übersicht, B12).
   */
  unterDerReihe?: boolean;
  /** Zugängliche Bezeichnung des Kastens. Ohne Angabe Auslösertext und Zusatz. */
  bezeichnung?: string;
  /** Beschriftung der bestätigenden Schaltfläche. */
  bestaetigen: string;
  /** Beschriftung, solange der Vorgang läuft. Ohne Angabe „Wird ausgeführt …". */
  bestaetigenLaeuft?: string;
  abbrechen?: string;
  /**
   * Fehlertext des Vorgangs. Wird als `role="alert"` vorgelesen. Geht einem
   * verworfenen Versprechen aus `onBestaetigen` vor dem Standardsatz vor.
   */
  fehler?: string | undefined;
  /** Läuft der Vorgang? Mit einem Versprechen aus `onBestaetigen` nicht nötig. */
  laeuft?: boolean;
  /** Synchron oder mit Versprechen; mit Versprechen wartet der Kasten. */
  onBestaetigen: () => void | Promise<unknown>;
  /** Zusätzliches Aufräumen beim Abbrechen, etwa das Zurücksetzen eines Fehlers. */
  onAbbrechen?: () => void;
  /** Die Frage. Meist ein Absatz, gelegentlich mehr. */
  children: ReactNode;
}) {
  const [offen, setOffen] = useState(false);
  const [fokusZurueck, setFokusZurueck] = useState(false);
  // Läuft ein Versprechen aus `onBestaetigen`? Unabhängig von `laeuft`, damit
  // eine Seite den Zustand nicht eigens durchreichen muss.
  const [wartet, setWartet] = useState(false);
  const [gescheitert, setGescheitert] = useState(false);
  const ausloeserRef = useRef<HTMLButtonElement>(null);
  const bestaetigenRef = useRef<HTMLButtonElement>(null);
  // Zwischen dem Klick und dem naechsten Rendern des Elternteils ist `laeuft`
  // noch false; ohne diesen Riegel loeste ein Doppelklick zwei Vorgaenge aus.
  const laeuftGerade = useRef(false);

  async function bestaetigt() {
    if (laeuft || laeuftGerade.current) return;
    laeuftGerade.current = true;
    setGescheitert(false);
    try {
      const ergebnis = onBestaetigen();
      if (istVersprechen(ergebnis)) {
        setWartet(true);
        await ergebnis;
      }
      // Erfolg: der Kasten hat seine Frage beantwortet. Der Fokus wandert
      // nicht zurueck - die ausloesende Schaltflaeche heisst nach dem Vorgang
      // oft anders oder ist ganz fort.
      setOffen(false);
    } catch {
      // Der Kasten bleibt offen und zeigt den Fehler - den der Seite oder den
      // Standardsatz. Eine unbehandelte Ablehnung waere nur Rauschen in der
      // Konsole.
      setGescheitert(true);
    } finally {
      laeuftGerade.current = false;
      setWartet(false);
    }
  }

  const laeuftJetzt = laeuft || wartet;
  const meldung = fehler ?? (gescheitert ? STANDARDFEHLER : undefined);

  useEffect(() => {
    if (offen) bestaetigenRef.current?.focus();
  }, [offen]);

  useEffect(() => {
    if (!offen && fokusZurueck) {
      ausloeserRef.current?.focus();
      setFokusZurueck(false);
    }
  }, [offen, fokusZurueck]);

  if (!offen) {
    return (
      <Button
        ref={ausloeserRef}
        type="button"
        variant={ausloeserVariante}
        groesse={ausloeserGroesse}
        {...(ausloeserBreit ? { className: 'w-full' } : {})}
        {...(ausloeserAutofokus ? { 'data-autofocus': true } : {})}
        onClick={() => {
          setGescheitert(false);
          setOffen(true);
        }}
      >
        {ausloeser}
        {ausloeserZusatz ? (
          <>
            {' '}
            <span className="sr-only">{ausloeserZusatz}</span>
          </>
        ) : null}
      </Button>
    );
  }

  return (
    <div
      role="group"
      aria-label={bezeichnung ?? (ausloeserZusatz ? `${ausloeser} ${ausloeserZusatz}` : ausloeser)}
      // Eine vertiefte Fläche mit Linie links (Leitfaden L2): Die Rückfrage
      // öffnet sich meist in einem Abschnitt, der schon eine Karte ist; als
      // eigene Karte war sie der Kasten im Kasten. Sie bleibt keine
      // Schaltfläche (DS-001).
      className={`border-line-strong bg-surface-sunken w-full border-l-4 py-3 pr-4 pl-4 ${
        unterDerReihe ? 'order-last' : ''
      }`.trim()}
    >
      <div className="text-ink text-sm">{children}</div>
      {meldung ? (
        <Statusmeldung ton="fehler" className="mt-2">
          {meldung}
        </Statusmeldung>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-3">
        <Button
          ref={bestaetigenRef}
          type="button"
          disabled={laeuftJetzt}
          onClick={() => {
            void bestaetigt();
          }}
        >
          {laeuftJetzt ? (bestaetigenLaeuft ?? 'Wird ausgeführt …') : bestaetigen}
        </Button>
        {/* Während der Vorgang läuft, bricht „Abbrechen" nichts ab: Der Aufruf
            am Server wird trotzdem wirksam. Deshalb ist der Knopf bis zur
            Antwort gesperrt (Zweitreview H2). */}
        <Button
          type="button"
          variant="quiet"
          disabled={laeuftJetzt}
          onClick={() => {
            setOffen(false);
            setFokusZurueck(true);
            onAbbrechen?.();
          }}
        >
          {abbrechen}
        </Button>
      </div>
    </div>
  );
}
