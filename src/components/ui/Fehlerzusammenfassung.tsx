import { useEffect, useRef } from 'react';

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
 */

export interface Formularfehler {
  /** Kennung des Feldes, auf das der Eintrag springt (`feldId`). */
  feldId: string;
  /** Beschriftung des Feldes, damit der Eintrag ohne Blick verständlich ist. */
  feld: string;
  meldung: string;
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
      <p className="text-danger text-[0.9375rem] font-medium">
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
              {eintrag.feld}: {eintrag.meldung}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Baut die Zusammenfassung aus den Feldfehlern eines Formulars.
 *
 * Die Reihenfolge folgt der Feldreihenfolge und nicht der Fundreihenfolge der
 * Prüfung: Wer die Liste von oben abarbeitet, geht damit durch das Formular
 * und nicht kreuz und quer.
 */
export function alsFormularfehler<F extends string>(
  reihenfolge: readonly F[],
  beschriftungen: Readonly<Record<F, string>>,
  fehler: Partial<Record<F, string>>,
  feldId: (feld: F) => string,
): Formularfehler[] {
  return reihenfolge
    .filter((feld) => Boolean(fehler[feld]))
    .map((feld) => ({
      feldId: feldId(feld),
      feld: beschriftungen[feld],
      meldung: fehler[feld]!,
    }));
}
