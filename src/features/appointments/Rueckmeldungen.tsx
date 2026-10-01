import { useEffect, useRef, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { Statusmeldung } from '@/components/ui/Statusmeldung';

/**
 * Die Bestätigung eines Vorgangs, dort, wo man danach hinsieht (ZST-16,
 * TER-04, TER-17, DOK-15).
 *
 * Nach „Ja, Termin absagen", einem Abschluss oder dem Anlegen eines
 * Folgetermins verschwand bisher der Knopf, der den Fokus hatte - der Fokus
 * fiel an den Seitenanfang, und ob der Vorgang geklappt hatte, stand nur im
 * geänderten Seitenkopf. Am Telefon lag der außerhalb des Bildes.
 *
 * Diese Zeile steht unter dem Seitenkopf und nimmt beim Erscheinen den Fokus:
 * Der Browser rollt sie ins Bild, Vorlesesoftware liest sie vor, und die
 * Tastatur macht von hier aus weiter (Oberflächen-Checkliste Punkt 7). Sie
 * erscheint nur nach einem bestätigten Erfolg - nie auf Verdacht (Punkt 6).
 *
 * Seit dem Design-Handoff vom 2026-10-01 steht sie auf der Akzentfläche statt
 * als grüne Textzeile: Sie ist die Antwort auf den Vorgang und soll so
 * auffallen wie der Knopf, der ihn ausgelöst hat.
 *
 * Eine neue Meldung ist eine neue Zeile: Die Seite setzt einen neuen `key`,
 * damit auch eine zweite, gleichlautende Bestätigung den Fokus wieder nimmt.
 */
export function Rueckmeldung({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  const zeile = useRef<HTMLDivElement>(null);

  useEffect(() => {
    zeile.current?.focus();
  }, []);

  return (
    // Fokussierbar, aber kein Bedienelement: ohne eigenen Fokusrahmen, wie die
    // Fehlerzusammenfassung, die ebenso von selbst den Fokus nimmt.
    <div ref={zeile} tabIndex={-1} className={`outline-none ${className}`}>
      {/* Aussehen nach dem Design-Handoff vom 2026-10-01 (Abschnitt 3):
          Akzentfläche, Radius 14, innen 12/16, 15 px in 600 in der Hauptfarbe,
          das Häkchen vorn für Vorlesesoftware ausgeblendet - der Satz sagt es. */}
      <p
        role="status"
        className="bg-accent-soft text-accent rounded-card text-liste px-4 py-3 font-semibold"
      >
        <span aria-hidden="true" className="mr-1.5">
          ✓
        </span>
        {children}
      </p>
    </div>
  );
}

/**
 * Das Nachladen ist gescheitert, der bisherige Stand steht noch da (ZST-03).
 *
 * Eine Abfrage mit Daten meldet bei einem gescheiterten Nachladen ebenfalls
 * einen Fehler. Die Seiten ersetzten ihr Formular dann durch „Nicht gefunden"
 * - mitten in der Eingabe, nach einem kurzen Funkloch. Jetzt bleibt der Inhalt
 * stehen, und diese Zeile sagt, dass er veraltet sein kann, samt dem Weg, es
 * noch einmal zu versuchen.
 */
export function NachladeHinweis({
  laeuft,
  onErneut,
  className = '',
}: {
  laeuft: boolean;
  onErneut: () => void;
  className?: string;
}) {
  return (
    <div className={`flex flex-wrap items-center gap-3 ${className}`}>
      <Statusmeldung ton="warnung">
        Der angezeigte Stand konnte nicht aktualisiert werden. Bitte die Verbindung prüfen.
      </Statusmeldung>
      <Button
        type="button"
        variant="secondary"
        groesse="kompakt"
        disabled={laeuft}
        onClick={onErneut}
      >
        {laeuft ? 'Wird erneut geladen …' : 'Erneut versuchen'}
      </Button>
    </div>
  );
}

/**
 * Eine Auswahlliste des Formulars ist nicht geladen (ZST-07).
 *
 * Bis UXR-005 stand dort nur `data ?? []`: Scheiterte die Liste, blieb die
 * Auswahl leer - das Formular sah bedienbar aus und ließ sich doch nicht
 * füllen. Die Zeile steht direkt am Feld und nennt den Weg, es noch einmal zu
 * versuchen.
 */
export function Listenfehler({ text, onErneut }: { text: string; onErneut: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Statusmeldung ton="fehler">{text}</Statusmeldung>
      <Button type="button" variant="secondary" groesse="kompakt" onClick={onErneut}>
        Erneut versuchen
      </Button>
    </div>
  );
}
