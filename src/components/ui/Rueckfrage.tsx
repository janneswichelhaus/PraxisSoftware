import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from './Button';
import { Statusmeldung } from './Statusmeldung';
import { istVersprechen } from './versprechen';

/** Fehlersatz, wenn ein Vorgang scheitert und die Seite keinen eigenen nennt. */
const STANDARDFEHLER = 'Das hat nicht geklappt. Bitte die Verbindung prüfen und erneut versuchen.';

/**
 * Rückfrage vor einem Vorgang, der nicht versehentlich passieren soll (UI-000).
 *
 * Die auslösende Schaltfläche wird durch einen Kasten mit der Frage ersetzt.
 * Das war bisher in acht Dateien einzeln gebaut, und die Fokusführung — ohne
 * die eine Tastaturbedienung nach dem Klick am Seitenanfang landet — nur an
 * einer davon (`AppointmentDetailPage`, CAL-004). Dieser Baustein hebt genau
 * dieses Verhalten für alle:
 *
 *   * beim Öffnen wandert der Fokus auf die bestätigende Schaltfläche,
 *   * beim Abbrechen kehrt er auf die auslösende zurück.
 *
 * Die Rückkehr braucht einen eigenen Durchlauf: während der Rückfrage ist die
 * auslösende Schaltfläche nicht im Dokument, ihre Referenz zeigt also auf ein
 * bereits entferntes Element.
 *
 * Der Kasten ist kein modaler Dialog: Er erscheint **an der Stelle des
 * Klicks** und ist damit immer im Blick. Rückfragen, die woanders als am
 * Klick entstehen — die Arbeitszeit-Rückfrage nach dem Absenden eines langen
 * Formulars etwa —, sind seit FIX-016 ein Fenster über dem Inhalt
 * (`Dialogfenster`, ANN-058). Die Grenze ist der Ort: Was neben dem Auslöser
 * stehen kann, steht dort; was sonst aus dem Sichtfeld fiele, kommt darüber.
 *
 * **Der Kasten wartet auf das Ergebnis (ABR-03, ZST-06).** Liefert
 * `onBestaetigen` ein Versprechen - `() => x.mutateAsync()` -, bleibt der
 * Kasten offen, zeigt bis zu dessen Ende „läuft" und nimmt keinen zweiten
 * Tipp an; erst ein erfülltes Versprechen schließt ihn. Wird es verworfen,
 * bleibt er offen und zeigt den Fehler: den `fehler` der Seite oder, fehlt
 * der, einen Satz ohne technische Einzelheiten (§13). Ein synchroner Aufruf
 * (`() => x.mutate()`) schließt wie bisher sofort - dann kann der Kasten
 * aber auch keinen Fehler mehr zeigen, weil es ihn nicht mehr gibt.
 */
export function Rueckfrage({
  ausloeser,
  ausloeserVariante = 'secondary',
  ausloeserGroesse = 'normal',
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
  /** Zugängliche Bezeichnung des Kastens. Ohne Angabe der Auslösertext. */
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
        onClick={() => {
          setGescheitert(false);
          setOffen(true);
        }}
      >
        {ausloeser}
      </Button>
    );
  }

  return (
    <div
      role="group"
      aria-label={bezeichnung ?? ausloeser}
      // Eine vertiefte Fläche mit Linie links (Leitfaden L2): Die Rückfrage
      // öffnet sich meist in einem Abschnitt, der schon eine Karte ist; als
      // eigene Karte war sie der Kasten im Kasten. Sie bleibt keine
      // Schaltfläche (DS-001).
      className="border-line-strong bg-surface-sunken w-full border-l-4 py-3 pr-4 pl-4"
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
