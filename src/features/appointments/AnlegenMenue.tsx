import { useEffect, useRef, type CSSProperties } from 'react';
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
 * **Im Gitter, nicht als Fenster darüber** (ANN-058): Die Frage lautet „was
 * soll hier entstehen?", und der Kalender ist der Zusammenhang, in dem sie
 * beantwortet wird. Deshalb steht das Menü neben der Auswahl, die es meint —
 * wie die Zieh-Rückfrage seit FIX-017.
 *
 * **Mit der Tastatur bedienbar:** Der Fokus wandert beim Öffnen auf den ersten
 * Eintrag, Escape schließt. Ein Weg ohne Zeigegerät ist das Menü damit noch
 * nicht — eine Spanne zieht man nicht mit der Tastatur auf. Dafür bleiben die
 * Schaltflächen über dem Gitter, und jeder Eintrag hat dort seine Entsprechung.
 */
export function AnlegenMenue({
  auswahl,
  className = '',
  style,
}: {
  auswahl: Spanne & { eintraege: AnlegenEintrag[]; onSchliessen: () => void };
  className?: string;
  style?: CSSProperties | undefined;
}) {
  const ersterRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    ersterRef.current?.focus();
  }, [auswahl.spalteId, auswahl.vonMinute, auswahl.bisMinute]);

  return (
    <div
      role="group"
      aria-label="Was soll hier entstehen?"
      className={`border-line-strong bg-surface rounded-card border-2 p-2 ${className}`}
      style={style}
      onKeyDown={(event) => {
        if (event.key === 'Escape') auswahl.onSchliessen();
      }}
    >
      <ul className="flex flex-col">
        {auswahl.eintraege.map((eintrag, i) => (
          <li key={eintrag.schluessel}>
            <button
              ref={i === 0 ? ersterRef : undefined}
              type="button"
              disabled={eintrag.deaktiviert}
              onClick={eintrag.onWaehlen}
              className={[
                'rounded-button flex w-full flex-col gap-0.5 px-3 py-2 text-left',
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
      <div className="border-line mt-1 border-t pt-1">
        <button
          type="button"
          onClick={auswahl.onSchliessen}
          className="text-ink-muted hover:bg-surface-sunken rounded-button w-full px-3 py-2 text-left text-sm"
        >
          Abbrechen
        </button>
      </div>
    </div>
  );
}
