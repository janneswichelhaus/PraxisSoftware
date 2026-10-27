import { useEffect, useRef, type ReactNode } from 'react';
import { Aufnahmeanzeige } from '@/components/ui/Aufnahmeanzeige';
import { Button } from '@/components/ui/Button';
import { Disclosure } from '@/components/ui/Card';
import { Kleingedrucktes } from '@/components/ui/Kleingedrucktes';
import { MikrofonSymbol } from '@/components/ui/MikrofonSymbol';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { Section } from '@/components/ui/Section';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { TextArea } from '@/components/ui/TextArea';
import { unverstaendlicheStellen } from '@/lib/ki/gateway';
import { aufnahmedauer } from '@/lib/aufnahme';
import { AUFNAHME_OFFEN, DIKTAT_OFFEN, type Diktat } from './diktat';

/**
 * Spracheingabe auf der Schreibseite (BEF-153, KI-EPIC-001,
 * PROJECT_PRINCIPLES.md 6.3): die Zeile mit „Sprechen" über der Fußleiste und
 * der Vorschlag über dem Feld.
 *
 * Der Weg ohne Sprechen bleibt vollständig (5): Feld, Textbausteine und Befund
 * stehen unverändert da, und ohne Netz, ohne Mikrofon oder bei verweigerter
 * Freigabe sagt die Zeile, warum es hier nicht geht. Wo der Gateway das
 * Diktat nicht anbietet oder die Seite das Mikrofon nicht öffnen darf, steht
 * die Zeile gar nicht da.
 */

/** Rand und Abstand der Zeile - auch um die laufende Aufnahme. */
const ZEILE = 'border-line nicht-drucken border-t px-3 py-2';

function Zeile({ children }: { children: ReactNode }) {
  return <div className={`flex flex-wrap items-center gap-x-3 gap-y-2 ${ZEILE}`}>{children}</div>;
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

  if (aufnahme.zustand !== 'bereit') {
    return (
      <Aufnahmeanzeige
        zustand={aufnahme.zustand}
        zeit={aufnahmedauer(aufnahme.sekunden)}
        verwerfenBezeichnung="Aufnahme verwerfen"
        onAbbrechen={diktat.abbrechen}
        onFertig={diktat.fertig}
        className={ZEILE}
      />
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
  // Nicht eingerichtet oder das Mikrofon für die Seite gesperrt: kein Weg.
  if (!diktat.angeboten) return null;

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
        <MikrofonSymbol />
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
