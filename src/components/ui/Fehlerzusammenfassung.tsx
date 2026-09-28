import { useEffect, useRef } from 'react';
import type { Formularfehler } from '@/lib/formularfehler';

/**
 * Was ist noch zu korrigieren — und wo? (UX-012)
 *
 * Ein abgewiesenes Formular meldete den Fehler bisher nur **am Feld**. Auf
 * einem langen Formular steht er damit außerhalb des Bildes: Man tippt auf
 * „Speichern", nichts passiert, und der Grund liegt sechs Felder weiter oben.
 * Auf dem Telefon ist das der Regelfall, nicht die Ausnahme.
 *
 * Diese Zusammenfassung steht **über** den Feldern, sobald die Prüfung etwas
 * gefunden hat, und jeder Eintrag ist ein Weg zum Feld: Ein Klick, ein Tap oder
 * die Eingabetaste setzt den Fokus dorthin und rollt es ins Bild. Die
 * Meldungen am Feld bleiben unverändert daneben stehen — die Zusammenfassung
 * ersetzt sie nicht, sie führt hin.
 *
 * **Für Vorlesesoftware:** Der Kasten trägt `role="alert"` und bekommt beim
 * Erscheinen den Fokus. Ohne das bliebe der Fokus auf der Schaltfläche, und
 * die Meldung wäre für jemanden ohne Blick auf den Bildschirm nicht auffindbar
 * (WCAG 3.3.1).
 *
 * **Jeder Eintrag nennt das Feld - einmal (WRT-B02).** Ein Eintrag lautet
 * „Feld: Meldung", damit er ohne Blick aufs Formular verständlich ist. Nennt
 * die Meldung das Feld schon selbst, stünde es doppelt da („Vorname: Vorname
 * ist erforderlich."); dann trägt der Eintrag nur die Meldung.
 */

/** Ein Buchstabe oder eine Ziffer - das, was ein Wort fortsetzt. */
const WORTZEICHEN = /[\p{L}\p{N}]/u;

/**
 * Nennt `meldung` das Feld `feld` als eigenes Wort? Groß- und Kleinschreibung
 * zählen nicht („Das Datum ist erforderlich." nennt „Datum"), ein Wortteil
 * zählt nicht („Nachname" nennt nicht „Name").
 */
function nenntFeld(meldung: string, feld: string): boolean {
  const text = meldung.toLocaleLowerCase('de');
  const name = feld.trim().toLocaleLowerCase('de');
  if (name === '') return false;
  for (let stelle = text.indexOf(name); stelle >= 0; stelle = text.indexOf(name, stelle + 1)) {
    const davor = text.charAt(stelle - 1);
    const danach = text.charAt(stelle + name.length);
    if (!WORTZEICHEN.test(davor) && !WORTZEICHEN.test(danach)) return true;
  }
  return false;
}

function eintragText({ feld, meldung }: Formularfehler): string {
  return nenntFeld(meldung, feld) ? meldung : `${feld}: ${meldung}`;
}

export function Fehlerzusammenfassung({
  fehler,
  titel = 'Bitte prüfen Sie diese Angaben',
}: {
  fehler: readonly Formularfehler[];
  titel?: string;
}) {
  const kasten = useRef<HTMLDivElement>(null);
  const anzahl = fehler.length;

  useEffect(() => {
    if (anzahl > 0) kasten.current?.focus();
  }, [anzahl]);

  if (anzahl === 0) return null;

  return (
    <div
      ref={kasten}
      role="alert"
      tabIndex={-1}
      className="rounded-card border-danger/25 bg-danger-soft mb-6 border px-4 py-3 outline-none"
    >
      <p className="text-danger text-liste font-medium">
        {anzahl === 1 ? titel.replace('diese Angaben', 'diese Angabe') : titel}
      </p>
      <ul className="mt-2 flex flex-col gap-1">
        {fehler.map((eintrag) => (
          <li key={eintrag.feldId}>
            <a
              href={`#${eintrag.feldId}`}
              className="text-danger inline-flex min-h-11 items-center text-sm underline"
              onClick={(event) => {
                // Ein Sprungziel allein setzt den Fokus nicht in jedem Browser.
                // Ohne Fokus landet die Tastaturbedienung weiterhin bei der
                // Schaltfläche, und der nächste Tabulator geht am Feld vorbei.
                const ziel = document.getElementById(eintrag.feldId);
                if (!ziel) return;
                event.preventDefault();
                ziel.focus();
                ziel.scrollIntoView({ block: 'center' });
              }}
            >
              {eintragText(eintrag)}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
