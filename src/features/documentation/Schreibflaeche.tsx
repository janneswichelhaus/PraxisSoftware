import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { symbolknopfKlassen } from '@/components/ui/buttonStile';
import { Disclosure } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { rueckwegBeschriftung } from '@/lib/rueckweg';
import { kalenderZumTermin } from '@/lib/termin';
import { FREITEXT } from '@/components/ui/textStile';

/**
 * Die Hülle der Schreibseite für die übrigen Wege eines Eintrags: Nachtrag,
 * Nachtrag bearbeiten, Korrektur und Änderungsverlauf (Design-Rollout B4,
 * DESIGN.md Seitentyp „Arbeitsseite“; Vorbild ist `CompleteTreatmentPage`,
 * Design-Handoff 2026-10-01, Abschnitt 6a).
 *
 * Eine Fläche statt Karten: Die Seite hebt die Polsterung des
 * Inhaltsbereichs auf und füllt die Höhe; getrennt wird über Linien. Oben
 * eine Kopfzeile mit dem Pfeil zurück, dem Namen und einer Zeile darunter
 * (was, Tag, Uhrzeit) - die Kontrolle dagegen, in der falschen Akte zu
 * schreiben. Darunter auf Wunsch eine Chipzeile (`leiste`), dann der Inhalt;
 * die Knöpfe stehen in der klebenden `Aktionsleiste einbettung="flaeche"`.
 *
 * Der Pfeil führt dorthin, woher die Seite kam, und heißt danach („Zurück
 * zur Übersicht“) - wie jeder Weg hinaus läuft er durch den
 * Textverlustschutz der Seite. Ein eigenes „Abbrechen“ daneben gibt es nicht
 * (ANN-445).
 *
 * Lokal gebaut, solange die Hülle nur in der Dokumentation gebraucht wird;
 * gehört mit der Schreibseite als Baustein nach `src/components/ui`.
 */
export function Schreibflaeche({
  zurueck,
  titel,
  kopfzeile,
  leiste,
  children,
}: {
  /** Ziel des Pfeils oben links. */
  zurueck: string;
  /** Der Name der Patient:in - die Überschrift der Seite. */
  titel: string;
  /** Die Zeile unter dem Namen: was, Tag, Uhrzeit. */
  kopfzeile: string;
  /** Chipzeile unter dem Kopf, etwa die Textbausteine. */
  leiste?: ReactNode;
  children: ReactNode;
}) {
  return (
    // Die Höhe ist die des Fensters unter der Kopfzeile (56 px); am Telefon
    // liegt die Tableiste darüber, und die Aktionsleiste bleibt über ihr.
    <div className="bg-surface border-line -mx-4 -mt-4 -mb-28 flex min-h-[calc(100dvh-3.5rem)] flex-col pb-[calc(3.5rem+1px+env(safe-area-inset-bottom))] sm:-mx-6 sm:-mt-6 sm:-mb-10 sm:border-x sm:pb-0 lg:-mx-8 lg:-mb-12">
      <header className="border-line flex min-h-12 shrink-0 items-center gap-1 border-b pr-4 pl-1">
        <Link
          to={zurueck}
          aria-label={rueckwegBeschriftung(zurueck)}
          className={symbolknopfKlassen('quiet')}
        >
          <span aria-hidden="true" className="text-xl leading-none">
            ←
          </span>
        </Link>
        {/* Die Überschrift trägt keine eigenen Klassen: Schrift und Kürzung
            setzt die Zeile um sie herum, wie im Kopf der Schreibseite. Die
            Zeile darunter bricht um, statt Tag und Uhrzeit abzuschneiden. */}
        <div className="text-ink text-liste min-w-0 py-1 leading-tight font-bold [&>h1]:truncate">
          <h1>{titel}</h1>
          <p className="text-ink-muted text-[13px] font-normal">{kopfzeile}</p>
        </div>
      </header>

      {leiste ? (
        // Läuft waagerecht, statt umzubrechen (Abschnitt 6a).
        <div className="border-line nicht-drucken flex shrink-0 items-center gap-2 overflow-x-auto border-b px-4 py-1.5">
          {leiste}
        </div>
      ) : null}

      {children}
    </div>
  );
}

/**
 * Das Schreibfeld der Hülle: füllt die Höhe, ohne Rahmen, die Beschriftung
 * nur für Vorlesesoftware (die Kopfzeile sagt sichtbar, was hier entsteht).
 * Ein Fehler steht über dem Feld, nicht darunter (Abschnitt 6a), und ist wie
 * `beschreibung` mit dem Feld verbunden.
 */
export function Schreibfeld({
  feldId,
  label,
  wert,
  fehler,
  beschreibungId,
  readOnly = false,
  mindesthoehe = 'min-h-40',
  onAendern,
}: {
  feldId: string;
  label: string;
  wert: string;
  fehler: string | undefined;
  /** Kennung eines Satzes, der das Feld beschreibt (etwa die Frist). */
  beschreibungId?: string | undefined;
  readOnly?: boolean;
  /** `min-h-40` füllt, ein zweites Feld darunter nimmt weniger. */
  mindesthoehe?: string;
  onAendern: (wert: string) => void;
}) {
  const fehlerId = `${feldId}-fehler`;
  const beschrieben = [fehler ? fehlerId : undefined, beschreibungId].filter(Boolean).join(' ');
  return (
    <>
      {fehler ? (
        <p
          id={fehlerId}
          role="alert"
          className="text-danger bg-danger-soft shrink-0 px-4 py-2 text-sm font-semibold"
        >
          <span aria-hidden="true">× </span>
          {fehler}
        </p>
      ) : null}
      <label htmlFor={feldId} className="sr-only">
        {label}
      </label>
      <textarea
        id={feldId}
        value={wert}
        aria-invalid={fehler ? true : undefined}
        aria-describedby={beschrieben || undefined}
        readOnly={readOnly}
        className={`text-ink placeholder:text-ink-muted ${mindesthoehe} w-full flex-1 resize-none border-0 bg-transparent px-4 py-3.5 text-base leading-[1.55] focus:outline-none focus-visible:outline-none`}
        onChange={(event) => onAendern(event.target.value)}
      />
    </>
  );
}

/**
 * Der Eintrag, den ein Nachtrag ergänzt: zugeklappt mit seiner ersten Zeile
 * (BEF-057 Option 2), als Zeile mit Linie unter der Kopfzeile. Ein Tipp
 * zeigt ihn vollständig; er bleibt Akteninhalt, kein Hinweis (DOK-19).
 */
export function Ursprungseintrag({ inhalt }: { inhalt: string }) {
  return (
    <div className="border-line shrink-0 border-b px-4 [&>details]:mt-0 [&>details]:border-t-0 [&>details]:pt-0">
      <Disclosure
        kopf="label"
        summary={
          <>
            <span className="shrink-0">Ursprünglicher Eintrag</span>
            <span
              aria-hidden="true"
              className="text-ink-muted min-w-0 truncate text-sm font-normal tracking-normal normal-case group-open:hidden"
            >
              {inhalt}
            </span>
          </>
        }
      >
        <p data-testid="ursprung" className={`text-ink text-liste max-w-prose pb-3 ${FREITEXT}`}>
          {inhalt}
        </p>
      </Disclosure>
    </div>
  );
}

/**
 * Ein Zustand statt der Hülle - nicht gefunden, noch ein Entwurf, kein
 * Nachtrag zum Nachtrag: mit dem Rückweg darüber, den der Rahmen bei einer
 * Seite mit eigenem Kopf nicht setzt (DOK-12). Ohne mitgereisten Rückweg
 * führt er zum Termin im Kalender, wie im Rahmen.
 *
 * Darunter der Kopf der Seite (Sichtung 13.10.2026, A7): derselbe Name und
 * dieselbe Zeile wie auf der Schreibfläche, damit auch ein Zustand sagt, wo
 * man ist - bis dahin stand die Meldung ohne Überschrift da.
 */
export function ZustandMitRueckweg({
  appointmentId,
  titel,
  beschreibung,
  children,
}: {
  appointmentId: string;
  /** Der Name der Patient:in, wie auf der Schreibfläche. */
  titel: string;
  /** Die Zeile darunter: was, Tag, Uhrzeit (`kopfzeileFuer`). */
  beschreibung: string;
  children: ReactNode;
}) {
  return (
    <>
      <Rueckweg standard={kalenderZumTermin(appointmentId)} />
      <PageHeader title={titel} description={beschreibung} />
      {children}
    </>
  );
}
