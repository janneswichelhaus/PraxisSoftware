import { memo, useId, useRef, type CSSProperties, type ReactNode, type Ref } from 'react';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { Field } from '@/components/ui/Field';
import { TextArea } from '@/components/ui/TextArea';
import { FREITEXT_MAX, gewaehlteKennungen, type Antwort, type Antworten } from './antworten';
import { KoerperschemaFeld } from './KoerperschemaFeld';
import { beschriftung, frageFeldId, ohneAbsenden } from './darstellung';
import { optionKennung, type ScoreDefinition, type ScoreItem } from './schema';

/**
 * Die Fragen einer Definition als Eingabe (FRB-002b).
 *
 * Gerendert wird nach dem **Typ** des Items, nie nach dem Instrument — ein
 * neuer Fragebogen ist eine Datei, keine Komponente (Leitprinzip des
 * Arbeitsauftrags). Der Wortlaut kommt unverändert aus der Definition.
 *
 * Eine Frage darf offen bleiben: Nicht beantwortet ist etwas anderes als
 * „nein", und nur das zweite hat die Person gesagt.
 *
 * `fehler` steht an der Frage, die ihn verursacht, mit derselben Kennung als
 * Sprungziel wie in der Fehlerzusammenfassung der Seite (BEF-03).
 */
export function FragebogenFelder({
  definition,
  antworten,
  onChange,
  fehler,
}: {
  definition: ScoreDefinition;
  antworten: Antworten;
  onChange: (itemId: string, antwort: Antwort | undefined) => void;
  /** Meldung je Kennung des Items; fehlt eine, ist die Frage in Ordnung. */
  fehler?: Readonly<Record<string, string>>;
}) {
  return (
    <ol className="flex flex-col gap-6">
      {definition.items.map((item, index) => {
        const vorher = definition.items[index - 1];
        // Ein Hinweis, der für mehrere Fragen gilt („Fragen 13-20"), steht
        // einmal vor der ersten - nicht achtmal.
        const hinweis = item.hinweis && item.hinweis !== vorher?.hinweis ? item.hinweis : null;
        return (
          <li key={item.id} className="flex flex-col gap-2">
            {hinweis ? <p className="text-ink-muted text-sm font-medium">{hinweis}</p> : null}
            <Frage
              item={item}
              antwort={antworten[item.id]}
              fehler={fehler?.[item.id]}
              onChange={onChange}
            />
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Eine Frage. `memo`, weil ein Kreuz sonst alle 46 Fragen samt Körperschema
 * neu zeichnet — auf einem älteren Handy spürbar. Dafür muss `onChange` über
 * die Lebensdauer des Formulars dieselbe Funktion bleiben.
 */
const Frage = memo(function Frage({
  item,
  antwort,
  fehler,
  onChange: melden,
}: {
  item: ScoreItem;
  antwort: Antwort | undefined;
  fehler: string | undefined;
  onChange: (itemId: string, antwort: Antwort | undefined) => void;
}) {
  const onChange = (neu: Antwort | undefined) => melden(item.id, neu);
  const feldId = frageFeldId(item.id);
  switch (item.typ) {
    case 'einzelauswahl':
    case 'mehrfachauswahl':
      return (
        <Auswahl
          item={item}
          antwort={antwort}
          feldId={feldId}
          fehler={fehler}
          onChange={onChange}
        />
      );
    case 'skala':
      return (
        <Skala item={item} antwort={antwort} feldId={feldId} fehler={fehler} onChange={onChange} />
      );
    case 'zahl':
      return (
        <Field
          feldId={feldId}
          label={beschriftung(item)}
          type="number"
          inputMode="decimal"
          enterKeyHint="done"
          onKeyDown={ohneAbsenden}
          error={fehler}
          value={antwort && 'wert' in antwort ? String(antwort.wert) : ''}
          onChange={(e) =>
            onChange(e.target.value === '' ? undefined : { wert: Number(e.target.value) })
          }
        />
      );
    case 'freitext':
      return (
        <TextArea
          feldId={feldId}
          label={beschriftung(item)}
          rows={2}
          maxLength={FREITEXT_MAX}
          error={fehler}
          value={antwort && 'text' in antwort ? antwort.text : ''}
          onChange={(e) =>
            onChange(e.target.value.trim() === '' ? undefined : { text: e.target.value })
          }
        />
      );
    case 'koerperschema':
      return (
        <KoerperschemaFeld
          legende={beschriftung(item)}
          feldId={feldId}
          fehler={fehler}
          markierungen={antwort && 'markierungen' in antwort ? antwort.markierungen : []}
          onChange={(markierungen) =>
            onChange(markierungen.length === 0 ? undefined : { markierungen })
          }
        />
      );
  }
});

/**
 * Eine Frage als Gruppe: Sprungziel der Fehlerzusammenfassung, der Fehler am
 * Ende und über `aria-describedby` mit ihr verbunden (BEF-03).
 *
 * `kopf` ist entweder eine `legend` oder - wo „Antwort entfernen" in der
 * Kopfzeile steht - ein Absatz, den `titelId` als Name der Gruppe nennt.
 */
function Frageblock({
  feldId,
  fehler,
  titelId,
  feldsatz,
  kopf,
  children,
}: {
  feldId: string;
  fehler: string | undefined;
  titelId?: string | undefined;
  feldsatz?: Ref<HTMLFieldSetElement>;
  kopf: ReactNode;
  children: ReactNode;
}) {
  const fehlerId = `${feldId}-fehler`;
  return (
    <fieldset
      ref={feldsatz}
      id={feldId}
      // Fokussierbar für den Sprung aus der Fehlerzusammenfassung, aber nicht
      // in der Tab-Reihenfolge.
      tabIndex={-1}
      aria-labelledby={titelId}
      aria-describedby={fehler ? fehlerId : undefined}
      className="flex flex-col gap-1"
    >
      {kopf}
      {children}
      {fehler ? (
        <p id={fehlerId} className="text-danger mt-1 text-sm">
          {fehler}
        </p>
      ) : null}
    </fieldset>
  );
}

/**
 * Die Kopfzeile einer Frage mit „Antwort entfernen" rechts (BEF-08).
 *
 * Bis UXR-009 erschien der Knopf nach jeder Antwort **unter** den Optionen und
 * schob alles Folgende um 48 px - wer zügig abtippt, traf danach die falsche
 * Option oder den Knopf selbst. Jetzt ist sein Platz in der ersten Zeile der
 * Frage immer frei gehalten (ein unsichtbarer Platzhalter, um den der Text
 * fließt), und der Knopf liegt darüber: Mit der Antwort erscheint er, ohne
 * dass sich irgendetwas verschiebt. Die 44 px seiner Trefferfläche ragen in
 * den Abstand zur Frage davor, nicht in die Optionen.
 */
function Kopfzeile({
  titelId,
  text,
  onEntfernen,
}: {
  titelId: string;
  text: string;
  /** Gesetzt, solange es eine Antwort gibt. */
  onEntfernen: (() => void) | undefined;
}) {
  return (
    <div className="relative mb-2">
      <p id={titelId} className="text-ink text-liste font-medium">
        <span aria-hidden="true" className="float-right ml-3 h-5 w-40" />
        {text}
      </p>
      {onEntfernen ? (
        <Button
          type="button"
          variant="quiet"
          groesse="kompakt"
          className="absolute -top-2.5 right-0 w-40 whitespace-nowrap"
          onClick={onEntfernen}
        >
          Antwort entfernen<span className="sr-only">: {text}</span>
        </Button>
      ) : null}
    </div>
  );
}

function Auswahl({
  item,
  antwort,
  feldId,
  fehler,
  onChange,
}: {
  item: ScoreItem;
  antwort: Antwort | undefined;
  feldId: string;
  fehler: string | undefined;
  onChange: (antwort: Antwort | undefined) => void;
}) {
  const name = useId();
  const titelId = useId();
  const feldsatz = useRef<HTMLFieldSetElement>(null);
  const mehrfach = item.typ === 'mehrfachauswahl';
  const gewaehlt = gewaehlteKennungen(antwort);
  const eigene = antwort && 'freitext' in antwort ? (antwort.freitext ?? '') : '';
  const optionen = item.optionen ?? [];
  const mitFreitext = optionen.find(
    (option) => option.freitext && gewaehlt.includes(optionKennung(option)),
  );

  function setzen(neu: string[], freitext: string) {
    if (neu.length === 0) return onChange(undefined);
    const behalten = optionen.some((o) => o.freitext && neu.includes(optionKennung(o)));
    const zusatz = behalten && freitext.trim() !== '' ? { freitext } : {};
    onChange(mehrfach ? { auswahl: neu, ...zusatz } : { auswahl: neu[0]!, ...zusatz });
  }

  function umschalten(kennung: string, exklusiv: boolean) {
    if (!mehrfach) return setzen([kennung], eigene);
    if (gewaehlt.includes(kennung))
      return setzen(
        gewaehlt.filter((k) => k !== kennung),
        eigene,
      );
    // „nein" räumt die übrigen Kreuze ab, und ein Kreuz räumt „nein" ab.
    const exklusive = optionen.filter((o) => o.exklusiv).map(optionKennung);
    const neu = exklusiv ? [kennung] : [...gewaehlt.filter((k) => !exklusive.includes(k)), kennung];
    setzen(neu, eigene);
  }

  function entfernen() {
    onChange(undefined);
    // Der Knopf verschwindet mit der Antwort; der Fokus bleibt in der Frage.
    feldsatz.current?.querySelector('input')?.focus();
  }

  // Kästchen lassen sich einzeln abwählen; nur die Einzelauswahl braucht
  // „Antwort entfernen" und damit die eigene Kopfzeile.
  const kopf = mehrfach ? (
    <legend className="text-ink text-liste mb-1 font-medium">{beschriftung(item)}</legend>
  ) : (
    <Kopfzeile
      titelId={titelId}
      text={beschriftung(item)}
      onEntfernen={gewaehlt.length > 0 ? entfernen : undefined}
    />
  );

  return (
    <Frageblock
      feldId={feldId}
      fehler={fehler}
      feldsatz={feldsatz}
      titelId={mehrfach ? undefined : titelId}
      kopf={kopf}
    >
      {/* Mehrfachauswahl auch am Telefon in Spalten (BEF-08): 109 Kästchen
          einspaltig machten den Bogen bei 390 px über 11 000 px lang. Lange
          Optionen brechen um - „Gleichgewichtsstörungen" mit Trennstrich, wo
          der Browser trennen kann, sonst an der Spaltenkante -, die
          Trefferfläche bleibt 44 px hoch. */}
      <div
        className={
          mehrfach
            ? 'grid [grid-template-columns:repeat(auto-fill,minmax(min(100%,9.5rem),1fr))] gap-x-4'
            : 'flex flex-wrap gap-x-6'
        }
      >
        {optionen.map((option) => {
          const kennung = optionKennung(option);
          return mehrfach ? (
            <Checkbox
              key={kennung}
              label={<span className="wrap-anywhere hyphens-auto">{option.label}</span>}
              checked={gewaehlt.includes(kennung)}
              onChange={() => umschalten(kennung, option.exklusiv === true)}
            />
          ) : (
            <label key={kennung} className="flex min-h-11 cursor-pointer items-center gap-3">
              <input
                type="radio"
                name={name}
                className="border-line-strong text-accent focus-visible:outline-accent size-5 shrink-0"
                checked={gewaehlt.includes(kennung)}
                onChange={() => umschalten(kennung, false)}
              />
              <span className="text-ink text-sm">{option.label}</span>
            </label>
          );
        })}
      </div>
      {mitFreitext ? (
        <Field
          label={`Angabe zu „${mitFreitext.label}“`}
          maxLength={FREITEXT_MAX}
          enterKeyHint="done"
          onKeyDown={ohneAbsenden}
          value={eigene}
          onChange={(e) => setzen(gewaehlt, e.target.value)}
        />
      ) : null}
    </Frageblock>
  );
}

function Skala({
  item,
  antwort,
  feldId,
  fehler,
  onChange,
}: {
  item: ScoreItem;
  antwort: Antwort | undefined;
  feldId: string;
  fehler: string | undefined;
  onChange: (antwort: Antwort | undefined) => void;
}) {
  const name = useId();
  const titelId = useId();
  const feldsatz = useRef<HTMLFieldSetElement>(null);
  const skala = item.skala ?? { min: 0, max: 10 };
  const aktuell = antwort && 'wert' in antwort ? antwort.wert : null;
  const stufen = Array.from({ length: skala.max - skala.min + 1 }, (_, i) => skala.min + i);
  // Mehr als sechs Stufen teilen sich am Handy auf zwei Reihen.
  const spaltenAmHandy = stufen.length > 6 ? Math.ceil(stufen.length / 2) : stufen.length;

  function entfernen() {
    onChange(undefined);
    feldsatz.current?.querySelector('input')?.focus();
  }

  return (
    <Frageblock
      feldId={feldId}
      fehler={fehler}
      titelId={titelId}
      feldsatz={feldsatz}
      kopf={
        <Kopfzeile
          titelId={titelId}
          text={beschriftung(item)}
          onEntfernen={aktuell !== null ? entfernen : undefined}
        />
      }
    >
      {/* Am Handy in zwei Reihen (BEF-057 Option 2 mit der Skala aus Option 3,
          ANN-258): 0–5 und 6–10, jede Stufe mindestens 44 × 44 px - elf
          Stufen zu je 29 px in einer Reihe trafen mit Handschuhen leicht die
          Nachbarin, und der Wert lebt im Verlauf weiter. Ab 640 px eine Reihe
          über die Breite des Bogens (RSP-08). Der Rand ist der eines
          Bedienelements (`line-strong`, BEF-04); der Fokus liegt in der
          Hauptfarbe mit Abstand um die Stufe. */}
      <div
        data-testid="skala-stufen"
        className="grid max-w-md grid-cols-[repeat(var(--skala-spalten),minmax(2.75rem,1fr))] gap-1 sm:max-w-none sm:grid-flow-col sm:grid-cols-none sm:gap-0.5"
        style={{ '--skala-spalten': spaltenAmHandy } as CSSProperties}
      >
        {stufen.map((stufe) => (
          <label
            key={stufe}
            className="has-[:checked]:bg-accent has-[:checked]:border-accent has-[:checked]:text-surface border-line-strong text-ink rounded-field has-[:focus-visible]:outline-accent flex min-h-11 cursor-pointer items-center justify-center border text-sm tabular-nums has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 sm:min-w-11"
          >
            <input
              type="radio"
              name={name}
              className="sr-only"
              checked={aktuell === stufe}
              onChange={() => onChange({ wert: stufe })}
            />
            {stufe}
          </label>
        ))}
      </div>
      {item.anker ? (
        <div className="text-ink-muted flex max-w-md justify-between text-xs sm:max-w-none">
          <span>{item.anker.min}</span>
          <span>{item.anker.max}</span>
        </div>
      ) : null}
      {/* Der gewählte Wert als Text (BEF-057): Die gefüllte Stufe allein sagt
          am Handy in der Sonne wenig, und Vorlesesoftware hört ihn. */}
      <p aria-live="polite" className="text-ink-muted text-sm tabular-nums">
        {aktuell === null ? '' : `gewählt: ${aktuell}`}
      </p>
    </Frageblock>
  );
}
