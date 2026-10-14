import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Dialogfenster } from '@/components/ui/Dialogfenster';
import { ListRow, ListRows } from '@/components/ui/ListRow';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import type { Katalogvorlage } from '@/features/exercises/katalog/typen';
import { Vorschaubild } from '@/features/exercises/Vorschaubild';
import { Auswahlfuss, Auswahlzeile } from './Uebungsauswahl';
import { vorausgewaehlt, type Vorlagenzeile } from './vorlagen';

/** Eine wählbare Übung der Vorlage. */
export type Vorlagenwahl = Extract<Vorlagenzeile, { art: 'waehlbar' }>;

/**
 * Die Vorschau einer Vorlage (Befund B9): Ein Tipp auf eine Vorlage
 * zeigt ihre Übungen als Zeilen mit Haken, alle vorgewählt außer dem, was
 * schon im Plan steht; „n hinzufügen“ legt die gewählten mit der Dosierung
 * der Vorlage an. Fehlt eine Übung der Praxis, kommt sie still mit
 * (`addCatalogExercises`); eine archivierte steht ohne Haken mit dem Wort da.
 *
 * Bekommt Vorlage und Zeilen - keine Person, keine Diagnose (ADR-006
 * Punkt 10). Die Vorauswahl ist der Inhalt der Vorlage, für jede Person
 * gleich.
 */
export function Vorlagenvorschau({
  vorlage,
  zeilen,
  imPlan,
  laeuft,
  fehler,
  katalogFehlt = false,
  onHinzufuegen,
  onSchliessen,
}: {
  vorlage: Katalogvorlage;
  zeilen: readonly Vorlagenzeile[];
  /** Varianten, die schon im Plan stehen - ohne Haken, mit Wort. */
  imPlan: ReadonlySet<string>;
  laeuft: string | null;
  fehler: string | null;
  /** Der Katalog ließ sich nicht laden - es fehlt, was der Praxis fehlt. */
  katalogFehlt?: boolean;
  onHinzufuegen: (gewaehlt: Vorlagenwahl[]) => void;
  onSchliessen: () => void;
}) {
  const [auswahl, setAuswahl] = useState<string[]>(() => vorausgewaehlt(zeilen, imPlan));
  const gewaehlt = zeilen.filter(
    (z): z is Vorlagenwahl => z.art === 'waehlbar' && auswahl.includes(z.schluessel),
  );

  function umschalten(schluessel: string) {
    setAuswahl((bisher) =>
      bisher.includes(schluessel)
        ? bisher.filter((s) => s !== schluessel)
        : [...bisher, schluessel],
    );
  }

  return (
    <Dialogfenster titel={vorlage.name} onSchliessen={onSchliessen} breit>
      <p className="text-ink-muted mb-3 text-sm">{vorlage.ziel}</p>
      {katalogFehlt ? (
        <Statusmeldung ton="warnung" className="mb-3">
          Nicht alle Übungen konnten geladen werden.
        </Statusmeldung>
      ) : null}
      <ListRows>
        {zeilen.map((zeile) =>
          zeile.art === 'waehlbar' ? (
            <Auswahlzeile
              key={zeile.schluessel}
              uebung={zeile.uebung}
              variante={zeile.variante}
              dosis={zeile.dosis}
              gewaehlt={auswahl.includes(zeile.schluessel)}
              imPlan={imPlan.has(zeile.variante.id)}
              onUmschalten={() => umschalten(zeile.schluessel)}
            />
          ) : (
            <ListRow
              key={zeile.schluessel}
              bild={<Vorschaubild bild={null} name={zeile.name} />}
              titel={zeile.name}
              status={<Badge ton="warnung">archiviert</Badge>}
              gedaempft
            />
          ),
        )}
      </ListRows>
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
