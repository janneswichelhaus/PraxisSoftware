import { useEffect, useRef, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { Disclosure } from '@/components/ui/Card';
import { Kleingedrucktes } from '@/components/ui/Kleingedrucktes';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { Section } from '@/components/ui/Section';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { TextArea } from '@/components/ui/TextArea';
import { unverstaendlicheStellen } from '@/lib/ki/gateway';
import { aufnahmedauer } from './aufnahme';
import { AUFNAHME_OFFEN, DIKTAT_OFFEN, type Diktat } from './diktat';

/**
 * Spracheingabe auf der Schreibseite (BEF-153, KI-EPIC-001,
 * PROJECT_PRINCIPLES.md 6.3): die Zeile mit „Sprechen" über der Fußleiste und
 * der Vorschlag über dem Feld.
 *
 * Der Weg ohne Sprechen bleibt vollständig (5): Feld, Textbausteine und Befund
 * stehen unverändert da, und ohne Netz, ohne Mikrofon oder bei verweigerter
 * Freigabe sagt die Zeile, warum es hier nicht geht.
 */

/** Ein Mikrofon im Raster 20, Strich 1,75, runde Enden (DESIGN.md 9.15). */
function Mikrofon() {
  return (
    <svg
      viewBox="0 0 20 20"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
    >
      <rect x="7.25" y="2.5" width="5.5" height="9.5" rx="2.75" />
      <path d="M4.5 9.75a5.5 5.5 0 0 0 11 0M10 15.25v2.25" />
    </svg>
  );
}

function Zeile({ children }: { children: ReactNode }) {
  return (
    <div className="border-line nicht-drucken flex flex-wrap items-center gap-x-3 gap-y-2 border-t px-3 py-2">
      {children}
    </div>
  );
}

/**
 * Die Zeile der Spracheingabe in der Aktionsleiste - am Telefon im
 * Daumenbereich über der Fußleiste, „Sprechen" in voller Breite und 48 px hoch.
 *
 * `haupt`: „Sprechen" ist der Hauptknopf der Ansicht, solange das Feld leer
 * und nichts offen ist (ANN-521); sonst steht er sekundär da, mit Zeichen und
 * Wort.
 */
export function Sprechleiste({
  diktat,
  haupt,
  verbunden,
}: {
  diktat: Diktat;
  haupt: boolean;
  verbunden: boolean;
}) {
  const { aufnahme, stand } = diktat;

  if (aufnahme.zustand === 'startet') {
    return (
      <Zeile>
        <Statusmeldung>Mikrofon wird geöffnet …</Statusmeldung>
        <Button type="button" variant="quiet" className="ml-auto" onClick={diktat.abbrechen}>
          Abbrechen
        </Button>
      </Zeile>
    );
  }

  if (aufnahme.zustand === 'laeuft') {
    return (
      <Zeile>
        {/* Status als Zeichen und Wort: ein roter Punkt und „Aufnahme 0:12".
            Vorgelesen wird der Beginn, nicht jede Sekunde. */}
        <p role="status" className="text-danger flex items-center gap-2 text-base font-bold">
          <span
            aria-hidden="true"
            className="bg-danger rounded-pill size-3 shrink-0 motion-safe:animate-pulse"
          />
          <span>
            Aufnahme{' '}
            <span aria-live="off" className="tabular-nums">
              {aufnahmedauer(aufnahme.sekunden)}
            </span>
          </span>
        </p>
        <div className="ml-auto flex gap-2">
          <Button type="button" variant="quiet" groesse="normal" onClick={diktat.abbrechen}>
            Abbrechen
          </Button>
          <Button type="button" groesse="normal" onClick={diktat.fertig}>
            Fertig
          </Button>
        </div>
      </Zeile>
    );
  }

  if (stand.art === 'aufbereitung') {
    return (
      <Zeile>
        <Statusmeldung>Wird aufbereitet …</Statusmeldung>
        <Button type="button" variant="quiet" className="ml-auto" onClick={diktat.abbrechen}>
          Abbrechen
        </Button>
      </Zeile>
    );
  }

  if (stand.art === 'gescheitert') {
    return (
      <Zeile>
        <Statusmeldung ton="fehler" className="basis-full">
          {stand.meldung} Die Aufnahme ist noch da.
        </Statusmeldung>
        {diktat.hinweis ? (
          <Statusmeldung ton="warnung" className="basis-full">
            {AUFNAHME_OFFEN}
          </Statusmeldung>
        ) : null}
        {!verbunden ? (
          <Statusmeldung className="basis-full">Ohne Netz nicht verfügbar.</Statusmeldung>
        ) : null}
        <div className="ml-auto flex flex-wrap gap-2">
          <Rueckfrage
            ausloeser="Verwerfen"
            ausloeserVariante="quiet"
            bezeichnung="Aufnahme verwerfen"
            bestaetigen="Ja, verwerfen"
            onBestaetigen={diktat.verwerfen}
          >
            Die Aufnahme ist nicht gespeichert und lässt sich danach nicht zurückholen.
          </Rueckfrage>
          <Button type="button" groesse="normal" disabled={!verbunden} onClick={diktat.erneut}>
            Erneut senden
          </Button>
        </div>
      </Zeile>
    );
  }

  // Ein offener Vorschlag steht über dem Feld; hier wartet nichts.
  if (stand.art === 'vorschlag') return null;

  const nutzbar = diktat.verfuegbar && verbunden;
  const grund = !diktat.verfuegbar
    ? 'Auf diesem Gerät nicht verfügbar – bitte tippen.'
    : !verbunden
      ? 'Ohne Netz nicht verfügbar.'
      : undefined;

  return (
    <Zeile>
      <Button
        type="button"
        variant={haupt && nutzbar ? 'primary' : 'secondary'}
        groesse="normal"
        className="w-full sm:ml-auto sm:w-auto"
        disabled={!nutzbar}
        aria-describedby={grund || diktat.meldung ? 'spracheingabe-hinweis' : undefined}
        onClick={diktat.sprechen}
      >
        <Mikrofon />
        Sprechen
      </Button>
      {grund || diktat.meldung ? (
        <div id="spracheingabe-hinweis" className="basis-full sm:order-first sm:basis-auto">
          {diktat.meldung ? (
            <Statusmeldung ton="fehler">{diktat.meldung}</Statusmeldung>
          ) : (
            <Statusmeldung>{grund}</Statusmeldung>
          )}
        </div>
      ) : null}
    </Zeile>
  );
}

/**
 * Der Vorschlag aus der Aufnahme - ein Abschnitt über dem Feld, kein Kasten im
 * Kasten. Lesbar, prüfbar, korrigierbar (6.3): der eingeordnete Text zum
 * Bearbeiten, darunter wörtlich, was gesprochen wurde. „In die Doku
 * übernehmen" fügt ihn am Ende des Feldes ein; erst dann ist er Entwurf.
 */
export function VorschlagAusAufnahme({
  diktat,
  gesperrt,
  onUebernehmen,
}: {
  diktat: Diktat;
  /** Solange die Seite schreibt, ist das Feld festgehalten. */
  gesperrt: boolean;
  onUebernehmen: (text: string) => void;
}) {
  const { stand } = diktat;
  const abschnitt = useRef<HTMLDivElement>(null);
  const da = stand.art === 'vorschlag';

  // Der Vorschlag erscheint ohne Tipp an dieser Stelle - der Fokus folgt ihm,
  // damit er im Blick und für Vorlesesoftware angekündigt ist.
  useEffect(() => {
    if (da) abschnitt.current?.focus();
  }, [da]);

  if (stand.art !== 'vorschlag') return null;
  const stellen = unverstaendlicheStellen(stand.text);

  return (
    <div
      ref={abschnitt}
      tabIndex={-1}
      className="bg-canvas border-line nicht-drucken shrink-0 border-b px-4 py-3 focus:outline-none"
    >
      {/* Überschrift h2 wie der Vorschlag aus Bausteinen: Sie folgt dem
          Seitentitel (h1) unmittelbar. */}
      <Section titel="Vorschlag aus der Aufnahme – bitte prüfen">
        <div className="flex flex-col gap-3">
          {stand.vorschlag.quelle === 'nachbildung' ? (
            <Statusmeldung ton="warnung">
              Nachbildung ohne Spracherkennung: Der Vorschlag ist ein fester Beispieltext, nicht die
              Aufnahme.
            </Statusmeldung>
          ) : null}
          <TextArea
            label="Text des Vorschlags"
            value={stand.text}
            rows={8}
            disabled={gesperrt}
            onChange={(ereignis) => diktat.textAendern(ereignis.target.value)}
          />
          {stellen > 0 ? (
            <Statusmeldung ton="warnung">
              {stellen === 1 ? '1 Stelle unverständlich' : `${stellen} Stellen unverständlich`}
            </Statusmeldung>
          ) : null}
          {diktat.hinweis ? <Statusmeldung ton="fehler">{DIKTAT_OFFEN}</Statusmeldung> : null}
          <Disclosure summary="Wörtlich gesprochen">
            <p className="text-ink max-w-prose text-sm wrap-anywhere whitespace-pre-wrap">
              {stand.vorschlag.transkript}
            </p>
          </Disclosure>
          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              disabled={gesperrt || stand.text.trim() === ''}
              onClick={() => {
                const text = diktat.uebernehmen();
                if (text) onUebernehmen(text);
              }}
            >
              In die Doku übernehmen
            </Button>
            <Rueckfrage
              ausloeser="Verwerfen"
              ausloeserVariante="quiet"
              bezeichnung="Vorschlag aus der Aufnahme verwerfen"
              bestaetigen="Ja, verwerfen"
              onBestaetigen={diktat.verwerfen}
            >
              Der Vorschlag ist nicht gespeichert; die Aufnahme lässt sich nicht zurückholen.
            </Rueckfrage>
          </div>
          <Kleingedrucktes>
            Die Aufnahme wird nur für diesen Vorschlag verarbeitet und nicht gespeichert. Erst
            „Übernehmen“ macht daraus Ihren Entwurf.
          </Kleingedrucktes>
        </div>
      </Section>
    </div>
  );
}
