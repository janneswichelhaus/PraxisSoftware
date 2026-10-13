import { Medienbild } from '@/components/ui/Medienbild';
import { Tile, TileGrid } from '@/components/ui/Tile';
import type { Dosis } from '@/features/exercise-plans/dosierung';
import type { Ablageplan } from './ablage';

/**
 * Eine Übung zum Ablesen (DESIGN.md Lücke 9.10): Bild oben, die Dosierung
 * als Kacheln, dann Anleitung, Hilfsmittel und Hinweis - in der Übersicht
 * („Übungen“) und in der Durchführung gleich.
 *
 * Das Bild hat seinen festen Platz (4:3, `Medienbild`), auch solange es noch
 * keins gibt: Dann steht dort der Platzhalter „Noch kein Bild“ (ANN-466). Die
 * gezeichneten Figuren der Übungsbibliothek kommen später als `children` des
 * `Medienbild` hinein; die Felder der Übung bleiben dieselben.
 */
export function Uebungsinhalt({ position }: { position: Ablageplan['items'][number] }) {
  return (
    <>
      <Medienbild alt={`Zeichnung der Übung „${position.variant_lay_name}“`} />
      <div className="mt-4">
        <Dosierungskacheln dosis={position} />
      </div>
      {position.instruction ? <p className="text-ink mt-4">{position.instruction}</p> : null}
      {position.equipment.length > 0 ? (
        <p className="text-ink-muted mt-2">Sie brauchen: {position.equipment.join(', ')}</p>
      ) : null}
      {position.note ? (
        <p className="text-ink mt-2">
          <span className="font-semibold">Hinweis: </span>
          {position.note}
        </p>
      ) : null}
    </>
  );
}

/**
 * Die Dosierung einer Übung zum Ablesen (Welle B, DESIGN.md Lücke 9.10:
 * „Dosierung als `Tile`-Reihe, dann Anleitung“; ANN-466).
 *
 * Statt eines Absatzes in Alltagssprache („3 Durchgänge mit je 8 bis 12
 * Wiederholungen. Mit: Rucksack 3 kg. Pause dazwischen: 60 Sekunden.“) stehen
 * die Zahlen einzeln und groß da - Durchgänge, Wiederholungen oder Dauer,
 * Pause, womit -, höchstens vier Kacheln. Was sich nicht als Zahl lesen lässt,
 * steht darunter als Zeile: das Tempo und die Regel zur Steigerung.
 *
 * Dieselben Wörter und Felder wie `dosierungAlltag` (ANN-299): reine
 * Darstellung dessen, was die Fachperson eingetragen hat. Nichts hier rechnet
 * eine Steigerung aus oder schlägt eine vor (ADR-006 Punkt 10).
 */
/**
 * Mit weichem Trennstrich: In einer Kachel von 150 px passt das Wort in
 * Versalien bei 18 px nicht in eine Zeile, und ohne Trennstelle bräche es
 * mitten im Wort („WIEDERHOLU NGEN“).
 */
const WIEDERHOLUNGEN = 'Wieder­holungen';

export function Dosierungskacheln({ dosis: d }: { dosis: Dosis }) {
  const wiederholungen =
    d.reps_min === null || d.reps_max === null
      ? null
      : d.reps_min === d.reps_max
        ? `${d.reps_min}`
        : `${d.reps_min} bis ${d.reps_max}`;
  return (
    <div>
      <TileGrid spalte="kachel">
        <Tile label={d.sets === 1 ? 'Durchgang' : 'Durchgänge'}>
          <Zahl>{d.sets}</Zahl>
        </Tile>
        {wiederholungen ? (
          <Tile label={WIEDERHOLUNGEN}>
            <Zahl>{wiederholungen}</Zahl>
            <span className="sr-only"> je Durchgang</span>
          </Tile>
        ) : (
          <Tile label="Dauer">
            <Zahl einheit={sekunden(d.duration_seconds ?? 0)}>{d.duration_seconds ?? 0}</Zahl>
            <span className="sr-only"> je Durchgang</span>
          </Tile>
        )}
        {d.rest_seconds !== null && d.rest_seconds > 0 ? (
          <Tile label="Pause">
            <Zahl einheit={sekunden(d.rest_seconds)}>{d.rest_seconds}</Zahl>
          </Tile>
        ) : null}
        {d.load ? <Tile label="Mit">{d.load}</Tile> : null}
      </TileGrid>
      {d.tempo ? <p className="text-ink mt-3">Tempo: {d.tempo}</p> : null}
      {d.double_progression && d.reps_min !== null && d.reps_max !== null ? (
        // Die Regel stammt von der Fachperson; die Steigerung der Last
        // entscheidet sie selbst (IDEA-TRN-007, ADR-006 Punkt 4).
        <p className="text-ink mt-3">
          Beginnen Sie mit {d.reps_min} und steigern Sie bis {d.reps_max} Wiederholungen. Schaffen
          Sie in allen Durchgängen {d.reps_max}, sagen Sie es uns – dann passen wir das Gewicht an.
        </p>
      ) : null}
    </div>
  );
}

/**
 * Eine Zahl der Dosierung: groß und tabellarisch, damit sie aus Armlänge
 * lesbar ist; die Einheit klein dahinter, damit „Sekunden“ nicht mitten im
 * Wort umbricht.
 */
function Zahl({ children, einheit }: { children: string | number; einheit?: string }) {
  return (
    <span className="block">
      <span className="text-h3 tabular-nums">{children}</span>
      {einheit ? <span className="font-normal"> {einheit}</span> : null}
    </span>
  );
}

/** Die Einheit zur Zahl: „Sekunde“ oder „Sekunden“. */
function sekunden(anzahl: number): string {
  return anzahl === 1 ? 'Sekunde' : 'Sekunden';
}
