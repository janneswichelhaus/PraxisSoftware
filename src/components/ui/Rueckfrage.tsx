import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from './Button';
import { Statusmeldung } from './Statusmeldung';

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
 * Der Kasten ist ausdrücklich kein modaler Dialog. Er nimmt der Seite nichts
 * weg und fängt keinen Fokus ein — für eine Rückfrage mit zwei Antworten wäre
 * das mehr Sperre als Hilfe.
 */
export function Rueckfrage({
  ausloeser,
  ausloeserVariante = 'secondary',
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
  /** Zugängliche Bezeichnung des Kastens. Ohne Angabe der Auslösertext. */
  bezeichnung?: string;
  /** Beschriftung der bestätigenden Schaltfläche. */
  bestaetigen: string;
  /** Beschriftung, solange der Vorgang läuft. Ohne Angabe „Wird ausgeführt …". */
  bestaetigenLaeuft?: string;
  abbrechen?: string;
  /** Fehlertext des Vorgangs. Wird als `role="alert"` vorgelesen. */
  fehler?: string | undefined;
  laeuft?: boolean;
  onBestaetigen: () => void | Promise<unknown>;
  /** Zusätzliches Aufräumen beim Abbrechen, etwa das Zurücksetzen eines Fehlers. */
  onAbbrechen?: () => void;
  /** Die Frage. Meist ein Absatz, gelegentlich mehr. */
  children: ReactNode;
}) {
  const [offen, setOffen] = useState(false);
  const [fokusZurueck, setFokusZurueck] = useState(false);
  const ausloeserRef = useRef<HTMLButtonElement>(null);
  const bestaetigenRef = useRef<HTMLButtonElement>(null);
  // Zwischen dem Klick und dem naechsten Rendern des Elternteils ist `laeuft`
  // noch false; ohne diesen Riegel loeste ein Doppelklick zwei Vorgaenge aus.
  const laeuftGerade = useRef(false);

  async function bestaetigt() {
    if (laeuft || laeuftGerade.current) return;
    laeuftGerade.current = true;
    try {
      await onBestaetigen();
      // Erfolg: der Kasten hat seine Frage beantwortet. Der Fokus wandert
      // nicht zurueck - die ausloesende Schaltflaeche heisst nach dem Vorgang
      // oft anders oder ist ganz fort.
      setOffen(false);
    } catch {
      // Der Fehler steht ueber `fehler` im Kasten. Hier gibt es nichts zu tun,
      // und eine unbehandelte Ablehnung waere nur Rauschen in der Konsole.
    } finally {
      laeuftGerade.current = false;
    }
  }

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
        onClick={() => setOffen(true)}
      >
        {ausloeser}
      </Button>
    );
  }

  return (
    <div
      role="group"
      aria-label={bezeichnung ?? ausloeser}
      className="border-line-strong bg-surface-sunken w-full rounded-lg border p-4"
    >
      <div className="text-ink text-sm">{children}</div>
      {fehler ? (
        <Statusmeldung ton="fehler" className="mt-2">
          {fehler}
        </Statusmeldung>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-3">
        <Button
          ref={bestaetigenRef}
          type="button"
          disabled={laeuft}
          onClick={() => {
            void bestaetigt();
          }}
        >
          {laeuft ? (bestaetigenLaeuft ?? 'Wird ausgeführt …') : bestaetigen}
        </Button>
        <Button
          type="button"
          variant="quiet"
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
