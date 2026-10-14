import { useCallback, useId, useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialogfenster } from '@/components/ui/Dialogfenster';
import { EmptyState } from '@/components/ui/Feedback';
import { ListRows } from '@/components/ui/ListRow';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import type { Bibliothek, Uebung, Variante } from '@/features/exercises/api';
import { NeueUebungFormular } from '@/features/exercises/Formulare';
import type { Katalogeintrag } from '@/features/exercises/katalog/typen';
import {
  KEIN_FILTER,
  ZEILEN_JE_SEITE,
  filtere,
  gesetzteFilter,
  ungeprueft,
  type Filter,
} from '@/features/exercises/suche';
import { KOERPERREGION_LABEL } from '@/features/exercises/types';
import { useFormularschutz } from '@/features/exercises/useFormularschutz';
import { Bibliotheksfilter } from '@/features/exercises/Bibliotheksfilter';
import { Vorschaubild } from '@/features/exercises/Vorschaubild';
import { dosierungKurz, type Dosis } from './dosierung';
import { standardDosis } from './hinzufuegen';
import { eineListe } from './uebungsliste';

/**
 * Das Auswahlblatt „Übungen hinzufügen" (Welle B; Analyse Training 12.10.,
 * Abschnitt 5, Weg B).
 *
 * Ein Fenster, am Telefon von unten: Suche und Filterchips, darunter jede
 * Variante als Zeile mit Bild, Name und Standarddosierung und einem Haken.
 * Mehrere wählen, dann **„n hinzufügen"** - alle in einem Zug, jede mit ihrer
 * Standarddosierung (ANN-384); die Dosierung ändert man danach an der Zeile
 * im Plan.
 *
 * **Eine Liste** (Befund B9, O-002): die Bibliothek der Praxis und die
 * Einträge des mitgelieferten Katalogs, die ihr fehlen (`eineListe`). Einen
 * gewählten Katalogeintrag übernimmt der Planeditor beim Hinzufügen still;
 * an der Zeile steht dafür nur „ungeprüft“, wie an jeder übernommenen Übung
 * ohne Prüfvermerk (ANN-386).
 *
 * Geordnet nach Bezeichnung wie die Bibliothek; gefiltert nur von Hand.
 * Nichts hier liest Diagnose, Befund oder Verlauf der Person, nichts ist
 * vorausgewählt (ADR-006 Punkt 10). „Schon im Plan" ist ein Wort an der
 * Zeile, kein Filter.
 *
 * Owner legt eine fehlende Übung direkt hier an (ANN-293); sie ist danach
 * gewählt. Ein Abschnitt „Zuletzt in Plänen dieser Praxis" fehlt bewusst:
 * Keine bestehende Serverfunktion liefert ihn ohne Personenbezug.
 */

/** Ohne Katalog - fest, damit die Liste nicht bei jedem Zeichnen neu entsteht. */
const KEIN_KATALOG: readonly Katalogeintrag[] = [];

export interface Gewaehlt {
  uebung: Uebung;
  variante: Variante;
}

/**
 * Eine Zeile mit Haken - die ganze Zeile ist das Ziel (ein `label`). Auch die
 * Vorschau einer Vorlage zeigt so ihre Übungen, dort mit der Dosierung der
 * Vorlage (`dosis`).
 */
export function Auswahlzeile({
  uebung,
  variante,
  gewaehlt,
  imPlan,
  dosis,
  onUmschalten,
}: {
  uebung: Uebung;
  variante: Variante;
  gewaehlt: boolean;
  imPlan: boolean;
  /** Ohne Angabe die Standarddosierung (ANN-384). */
  dosis?: Dosis;
  onUmschalten: () => void;
}) {
  const id = useId();
  const titel = variante.name;
  const meta = [
    variante.name === uebung.name ? null : uebung.name,
    KOERPERREGION_LABEL[uebung.body_region],
    dosierungKurz(dosis ?? standardDosis(variante)),
    ungeprueft(variante) ? 'ungeprüft' : null,
    imPlan ? 'schon im Plan' : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <li className="border-line border-t first:border-t-0">
      <label
        htmlFor={id}
        className={`listenzeile -mx-4 grid min-h-14 cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-2 transition-colors duration-120 ${
          gewaehlt ? 'bg-accent-soft' : 'hover:bg-surface-sunken'
        }`}
      >
        <span aria-hidden="true" className="block size-14 shrink-0">
          <Vorschaubild bild={variante.illustration} name={variante.lay_name} />
        </span>
        <span className="min-w-0">
          <span className="text-ink block text-base font-semibold">{titel}</span>
          <span className="text-ink-muted block text-sm">{meta}</span>
        </span>
        <input
          id={id}
          type="checkbox"
          checked={gewaehlt}
          onChange={onUmschalten}
          className="border-line-strong accent-accent size-6 shrink-0"
        />
      </label>
    </li>
  );
}

export function Uebungsauswahl({
  bibliothek,
  katalog = KEIN_KATALOG,
  katalogFehlt = false,
  imPlan,
  laeuft,
  fehler,
  onHinzufuegen,
  onSchliessen,
}: {
  bibliothek: Bibliothek;
  /** Der mitgelieferte Katalog; was die Bibliothek schon hat, steht nur einmal da. */
  katalog?: readonly Katalogeintrag[];
  /** Der Katalog ließ sich nicht laden - die Liste zeigt nur die Bibliothek. */
  katalogFehlt?: boolean;
  /** Varianten, die schon im Plan stehen - nur zur Anzeige. */
  imPlan: ReadonlySet<string>;
  /** Läuft das Hinzufügen, und wie weit („2 von 5")? */
  laeuft: string | null;
  fehler: string | null;
  onHinzufuegen: (gewaehlt: Gewaehlt[]) => void;
  onSchliessen: () => void;
}) {
  const [filter, setFilterRoh] = useState<Filter>(KEIN_FILTER);
  const [zeigen, setZeigen] = useState(ZEILEN_JE_SEITE);
  // Eine neue Suche beginnt wieder mit der ersten Seite.
  const setFilter = (neu: Filter) => {
    setZeigen(ZEILEN_JE_SEITE);
    setFilterRoh(neu);
  };
  const [auswahl, setAuswahl] = useState<string[]>([]);
  const [anlegen, setAnlegen] = useState(false);
  const [ungespeichert, setUngespeichert] = useState(false);
  const schutz = useFormularschutz();
  const schutzMelden = schutz.melden;
  // Fest, damit die Meldung des Formulars nicht bei jedem Zeichnen neu läuft.
  const melden = useCallback(
    (formularId: string, wert: boolean) => {
      setUngespeichert(wert);
      schutzMelden(formularId, wert);
    },
    [schutzMelden],
  );

  const aktiv = useMemo(
    () =>
      eineListe(bibliothek, katalog).filter(
        (uebung) => !uebung.archived && uebung.variants.some((v) => !v.archived),
      ),
    [bibliothek, katalog],
  );
  const treffer = filtere(aktiv, filter);
  const zeilen = treffer.flatMap((t) =>
    t.varianten.map((variante) => ({ uebung: t.uebung, variante })),
  );
  const alleZeilen = aktiv.flatMap((uebung) =>
    uebung.variants.filter((v) => !v.archived).map((variante) => ({ uebung, variante })),
  );
  const gefiltert = filter.text.trim() !== '' || gesetzteFilter(filter) > 0;
  const gewaehlt = auswahl
    .map((id) => alleZeilen.find((z) => z.variante.id === id))
    .filter((z): z is Gewaehlt => z !== undefined);

  function umschalten(id: string) {
    setAuswahl((bisher) =>
      bisher.includes(id) ? bisher.filter((x) => x !== id) : [...bisher, id],
    );
  }

  if (anlegen) {
    return (
      <Dialogfenster
        titel="Übung anlegen"
        // Mit Eingaben schließen weder Escape noch ein Tipp daneben das
        // Fenster - dafür gibt es „Abbrechen".
        onSchliessen={() => {
          if (!ungespeichert) setAnlegen(false);
        }}
      >
        <NeueUebungFormular
          formularId="auswahl-neu"
          anlegenText="Anlegen und wählen"
          onFertig={(angelegt) => {
            if (angelegt.varianteId) {
              const id = angelegt.varianteId;
              setAuswahl((bisher) => [...bisher, id]);
            }
            setFilter(KEIN_FILTER);
            setAnlegen(false);
          }}
          onAbbrechen={() => setAnlegen(false)}
          onUngespeichert={melden}
          schutz={schutz.schutzFuer('auswahl-neu')}
        />
      </Dialogfenster>
    );
  }

  const ergebnis = gefiltert
    ? `${zeilen.length} von ${alleZeilen.length}`
    : `${alleZeilen.length} ${alleZeilen.length === 1 ? 'Übung' : 'Übungen'}`;

  return (
    <Dialogfenster titel="Übungen hinzufügen" onSchliessen={onSchliessen} breit>
      <Bibliotheksfilter
        filter={filter}
        setFilter={setFilter}
        uebungen={aktiv}
        ergebnis={ergebnis}
        suchbeschriftung="Übung suchen"
        eingeklappt
      />
      {katalogFehlt ? (
        <Statusmeldung ton="warnung" className="mb-3">
          Nicht alle Übungen konnten geladen werden.
        </Statusmeldung>
      ) : null}
      {zeilen.length === 0 ? (
        <EmptyState
          inKarte
          title={alleZeilen.length === 0 ? 'Noch keine Übung.' : 'Keine Übung gefunden.'}
          {...(bibliothek.can_manage
            ? {
                aktion: (
                  <Button
                    type="button"
                    variant="secondary"
                    groesse="kompakt"
                    onClick={() => setAnlegen(true)}
                  >
                    Übung anlegen
                  </Button>
                ),
              }
            : {})}
        />
      ) : (
        <ListRows>
          {zeilen.slice(0, zeigen).map(({ uebung, variante }) => (
            <Auswahlzeile
              key={variante.id}
              uebung={uebung}
              variante={variante}
              gewaehlt={auswahl.includes(variante.id)}
              imPlan={imPlan.has(variante.id)}
              onUmschalten={() => umschalten(variante.id)}
            />
          ))}
        </ListRows>
      )}
      {zeilen.length > zeigen ? (
        <div className="mt-2">
          <Button
            type="button"
            variant="secondary"
            groesse="kompakt"
            onClick={() => setZeigen((bisher) => bisher + ZEILEN_JE_SEITE)}
          >
            Weitere laden ({zeilen.length - zeigen})
          </Button>
        </div>
      ) : null}
      {bibliothek.can_manage && zeilen.length > 0 ? (
        <div className="mt-2">
          <Button type="button" variant="quiet" groesse="kompakt" onClick={() => setAnlegen(true)}>
            Nicht dabei? Übung anlegen
          </Button>
        </div>
      ) : null}

      <Auswahlfuss
        anzahl={gewaehlt.length}
        laeuft={laeuft}
        fehler={fehler}
        onHinzufuegen={() => onHinzufuegen(gewaehlt)}
        onSchliessen={onSchliessen}
      />
    </Dialogfenster>
  );
}

/**
 * Der Fuß des Auswahlblatts und der Vorschau einer Vorlage: „n hinzufügen“
 * als Hauptknopf, „Abbrechen“ leise. Klebt am unteren Rand des Fensters - die
 * Wahl bleibt beim Rollen durch die Liste mit dem Daumen erreichbar.
 */
export function Auswahlfuss({
  anzahl,
  laeuft,
  fehler,
  onHinzufuegen,
  onSchliessen,
}: {
  anzahl: number;
  /** Läuft das Hinzufügen, und wie weit („2 von 5")? */
  laeuft: string | null;
  fehler: string | null;
  onHinzufuegen: () => void;
  onSchliessen: () => void;
}) {
  return (
    <div className="bg-surface border-line sticky -bottom-6 -mx-6 mt-4 -mb-6 border-t px-6 py-3">
      {fehler ? (
        <Statusmeldung ton="fehler" className="mb-2">
          {fehler}
        </Statusmeldung>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" disabled={anzahl === 0 || laeuft !== null} onClick={onHinzufuegen}>
          {laeuft
            ? `Wird hinzugefügt … (${laeuft})`
            : anzahl === 0
              ? 'Hinzufügen'
              : `${anzahl} hinzufügen`}
        </Button>
        <Button type="button" variant="quiet" disabled={laeuft !== null} onClick={onSchliessen}>
          Abbrechen
        </Button>
      </div>
    </div>
  );
}
