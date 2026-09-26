import { useId } from 'react';
import { Checkbox } from '@/components/ui/Checkbox';
import { Field } from '@/components/ui/Field';
import { TextArea } from '@/components/ui/TextArea';
import { FREITEXT_MAX, gewaehlteKennungen, type Antwort, type Antworten } from './antworten';
import { KoerperschemaFeld } from './KoerperschemaFeld';
import { beschriftung } from './darstellung';
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
 */
export function FragebogenFelder({
  definition,
  antworten,
  onChange,
}: {
  definition: ScoreDefinition;
  antworten: Antworten;
  onChange: (itemId: string, antwort: Antwort | undefined) => void;
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
              onChange={(a) => onChange(item.id, a)}
            />
          </li>
        );
      })}
    </ol>
  );
}

function Frage({
  item,
  antwort,
  onChange,
}: {
  item: ScoreItem;
  antwort: Antwort | undefined;
  onChange: (antwort: Antwort | undefined) => void;
}) {
  switch (item.typ) {
    case 'einzelauswahl':
    case 'mehrfachauswahl':
      return <Auswahl item={item} antwort={antwort} onChange={onChange} />;
    case 'skala':
      return <Skala item={item} antwort={antwort} onChange={onChange} />;
    case 'zahl':
      return (
        <Field
          label={beschriftung(item)}
          type="number"
          inputMode="decimal"
          value={antwort && 'wert' in antwort ? String(antwort.wert) : ''}
          onChange={(e) =>
            onChange(e.target.value === '' ? undefined : { wert: Number(e.target.value) })
          }
        />
      );
    case 'freitext':
      return (
        <TextArea
          label={beschriftung(item)}
          rows={2}
          maxLength={FREITEXT_MAX}
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
          bereiche={antwort && 'bereiche' in antwort ? antwort.bereiche : []}
          onChange={(bereiche) => onChange(bereiche.length === 0 ? undefined : { bereiche })}
        />
      );
  }
}

function Auswahl({
  item,
  antwort,
  onChange,
}: {
  item: ScoreItem;
  antwort: Antwort | undefined;
  onChange: (antwort: Antwort | undefined) => void;
}) {
  const name = useId();
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

  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="text-ink mb-1 text-[0.9375rem] font-medium">{beschriftung(item)}</legend>
      <div className={mehrfach ? 'grid gap-x-4 sm:grid-cols-2' : 'flex flex-wrap gap-x-6'}>
        {optionen.map((option) => {
          const kennung = optionKennung(option);
          return mehrfach ? (
            <Checkbox
              key={kennung}
              label={option.label}
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
      {!mehrfach && gewaehlt.length > 0 ? (
        <button
          type="button"
          className="text-ink-muted hover:text-ink min-h-11 self-start text-sm underline"
          onClick={() => onChange(undefined)}
        >
          Antwort entfernen
        </button>
      ) : null}
      {mitFreitext ? (
        <Field
          label={`Angabe zu „${mitFreitext.label}“`}
          maxLength={FREITEXT_MAX}
          value={eigene}
          onChange={(e) => setzen(gewaehlt, e.target.value)}
        />
      ) : null}
    </fieldset>
  );
}

function Skala({
  item,
  antwort,
  onChange,
}: {
  item: ScoreItem;
  antwort: Antwort | undefined;
  onChange: (antwort: Antwort | undefined) => void;
}) {
  const name = useId();
  const skala = item.skala ?? { min: 0, max: 10 };
  const aktuell = antwort && 'wert' in antwort ? antwort.wert : null;
  const stufen = Array.from({ length: skala.max - skala.min + 1 }, (_, i) => skala.min + i);

  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="text-ink mb-1 text-[0.9375rem] font-medium">{beschriftung(item)}</legend>
      {/* Elf Felder zu je knapp 30 px passen bei 375 px in eine Reihe; die
          ganze Zelle ist Trefferfläche, 44 px hoch. */}
      <div className="grid max-w-md grid-flow-col gap-0.5">
        {stufen.map((stufe) => (
          <label
            key={stufe}
            className="has-[:checked]:bg-accent has-[:checked]:text-surface border-line text-ink rounded-field flex min-h-11 cursor-pointer items-center justify-center border text-sm tabular-nums has-[:focus-visible]:outline-2"
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
        <div className="text-ink-muted flex max-w-md justify-between text-xs">
          <span>{item.anker.min}</span>
          <span>{item.anker.max}</span>
        </div>
      ) : null}
      {aktuell !== null ? (
        <button
          type="button"
          className="text-ink-muted hover:text-ink min-h-11 self-start text-sm underline"
          onClick={() => onChange(undefined)}
        >
          Antwort entfernen
        </button>
      ) : null}
    </fieldset>
  );
}
