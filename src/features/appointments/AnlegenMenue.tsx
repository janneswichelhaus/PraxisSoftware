import { useEffect, useRef } from 'react';
import { minuteZuZeit } from './calendar';
import type { Spanne } from './useSpanneAufziehen';

/**
 * Was an der Auswahl im Kalender zur Wahl steht (CAL-019).
 *
 * Die Einträge kommen fertig von der aufrufenden Seite: Sie kennt Person,
 * Datum, Patientenfilter und Rückweg, das Gitter nicht. Dasselbe Verhältnis
 * wie bei der Zieh-Rückfrage (FIX-017).
 */
export interface AnlegenEintrag {
  schluessel: string;
  beschriftung: string;
  /** Ein Satz darunter: was der Eintrag bewirkt oder warum er nicht geht. */
  hinweis?: string;
  /** Nicht wählbar - der Hinweis sagt dann, was vorher fehlt. */
  deaktiviert?: boolean;
  onWaehlen: () => void;
}

/**
 * Das Anlegen-Menü an einer Auswahl im Kalender (CAL-019).
 *
 * Bis CAL-019 führte ein Tap auf freie Zeit unmittelbar in die Terminanlage.
 * Das war richtig, solange es nur einen Weg gab; inzwischen sind es vier, und
 * drei davon waren aus dem Kalender gar nicht erreichbar. Die Auswahl der Zeit
 * und die Wahl der Art sind deshalb zwei Schritte geworden.
 *
 * **Eine Leiste am unteren Rand, nicht mehr in der Spalte** (BEF-035,
 * ANN-108). Bis 2026-09-26 stand das Menü 4 px unter der Auswahl im Gitter und
 * deckte damit genau die Felder zu, auf denen die Spanne weitergehen würde.
 * Jetzt bleibt die ganze Spalte frei für den zweiten Tipp; die Auswahl selbst
 * trägt ihre Zeit im Gitter, und die Leiste nennt sie noch einmal.
 *
 * **Mit der Tastatur bedienbar:** Der Fokus wandert beim Öffnen auf den ersten
 * Eintrag, Escape schließt. Ein Weg ohne Zeigegerät ist das Menü damit noch
 * nicht — eine Spanne zieht man nicht mit der Tastatur auf. Dafür bleiben die
 * Schaltflächen im Kalender, und jeder Eintrag hat dort seine Entsprechung.
 */
export function AnlegenMenue({
  auswahl,
  className = '',
}: {
  auswahl: Spanne & { eintraege: AnlegenEintrag[]; onSchliessen: () => void };
  className?: string;
}) {
  const ersterRef = useRef<HTMLButtonElement>(null);
  const spanne = auswahl.bisMinute > auswahl.vonMinute;

  useEffect(() => {
    // Ohne Bildlauf: Die Leiste steht ohnehin im Sichtfeld, und ein Sprung
    // der Seite nähme die gerade gewählte Stelle aus dem Blick.
    ersterRef.current?.focus({ preventScroll: true });
  }, [auswahl.spalteId, auswahl.vonMinute, auswahl.bisMinute]);

  return (
    <div
      role="group"
      aria-label="Was soll hier entstehen?"
      className={`border-line-strong bg-surface rounded-card border-2 p-2 shadow-lg ${className}`}
      onKeyDown={(event) => {
        if (event.key === 'Escape') auswahl.onSchliessen();
      }}
    >
      <div className="flex items-start justify-between gap-2 px-1">
        <p className="min-w-0 text-sm">
          <span className="text-ink font-semibold tabular-nums">
            {minuteZuZeit(auswahl.vonMinute)}
            {spanne ? `–${minuteZuZeit(auswahl.bisMinute)}` : ''} Uhr
          </span>
          {/* Der Hinweis sagt die Geste, die man sonst nicht sieht (BEF-035,
              BEF-036). Nach einer fertigen Spanne ist er erledigt. */}
          {spanne ? null : (
            <span className="text-ink-muted block text-xs">
              Zweites Feld antippen: Spanne bis dorthin. Dasselbe Feld: aufheben.
            </span>
          )}
        </p>
        <button
          type="button"
          onClick={auswahl.onSchliessen}
          className="text-ink-muted hover:bg-surface-sunken rounded-button min-h-11 shrink-0 px-3 text-sm"
        >
          Abbrechen
        </button>
      </div>
      <ul className="mt-1 grid grid-cols-2 gap-1 sm:grid-cols-4">
        {auswahl.eintraege.map((eintrag, i) => (
          <li key={eintrag.schluessel} className="min-w-0">
            <button
              ref={i === 0 ? ersterRef : undefined}
              type="button"
              disabled={eintrag.deaktiviert}
              onClick={eintrag.onWaehlen}
              className={[
                'rounded-button border-line flex min-h-11 w-full flex-col gap-0.5 border px-3 py-1.5 text-left',
                eintrag.deaktiviert
                  ? 'text-ink-subtle cursor-not-allowed'
                  : 'text-ink hover:bg-surface-sunken',
              ].join(' ')}
            >
              <span className="text-[0.9375rem] font-medium">{eintrag.beschriftung}</span>
              {eintrag.hinweis ? (
                <span className="text-ink-muted text-xs leading-snug">{eintrag.hinweis}</span>
              ) : null}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
