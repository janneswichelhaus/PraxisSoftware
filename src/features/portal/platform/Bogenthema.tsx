import { Fragment, useId, type ReactNode } from 'react';
import { Field } from '@/components/ui/Field';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Stufenskala } from '@/components/ui/Stufenskala';
import { TextArea } from '@/components/ui/TextArea';
import { Wahlflaechen } from '@/components/ui/Wahlflaechen';
import { Zwischentitel } from '@/components/ui/Zwischentitel';
import { useFenstertitelId } from '@/components/ui/fenstertitel';
import { FragebogenFelder } from '@/features/clinical/assessments/FragebogenFelder';
import {
  FREITEXT_MAX,
  gewaehlteKennungen,
  type Antwort,
  type Antworten,
} from '@/features/clinical/assessments/antworten';
import { ohneAbsenden } from '@/features/clinical/assessments/darstellung';
import {
  optionKennung,
  type ScoreDefinition,
  type ScoreItem,
} from '@/features/clinical/assessments/schema';
import {
  ankerSatz,
  frageText,
  istJaNein,
  sichtbar,
  wortlaut,
  type Bogenfrage,
  type Bogenthema as Thema,
} from './bogenthemen';

type Melden = (itemId: string, antwort: Antwort | undefined) => void;

/**
 * Die Fragen eines Themas: ja/nein als zwei Flächen, jede andere Wahl als ganze Zeilen, die Skala
 * mit dem Satz der Anker, Text in einer oder drei Zeilen, das Körperbild wie in der Praxis. Hat das
 * Thema nur eine Frage, ist sie der Titel des Fensters und benennt die Antworten.
 */
export function Bogenthema({
  definition,
  thema,
  antworten,
  onAntwort,
  fehler,
}: {
  definition: ScoreDefinition;
  thema: Thema;
  antworten: Antworten;
  onAntwort: Melden;
  /** Meldung je Kennung des Items aus der Prüfung vor dem Senden. */
  fehler: Readonly<Record<string, string>>;
}) {
  const fenstertitel = useFenstertitelId();
  const einzeln = thema.fragen.length === 1;
  const fragen = thema.fragen.filter((frage) => sichtbar(frage, antworten));
  const vorab = fragen[0]?.item.hinweis;
  const abstand = thema.linien ? 'gap-6' : 'gap-8 [.plattform-schrift[data-rechner]_&]:gap-12';
  return (
    <div className="flex flex-col">
      {/* Ein Hinweis für mehrere Fragen steht einmal, gleich unter dem Titel. */}
      {vorab ? <p className="text-ink-muted -mt-2.5">{vorab}</p> : null}
      <div className={`flex flex-col ${abstand} ${vorab ? 'mt-6' : einzeln ? '' : 'mt-4'}`}>
        {fragen.map((frage, index) => {
          const hinweis = frage.item.hinweis;
          const neuerHinweis =
            index > 0 && hinweis !== undefined && hinweis !== fragen[index - 1]?.item.hinweis;
          return (
            <div
              key={frage.item.id}
              className={thema.linien && index > 0 ? 'border-line border-t pt-6' : undefined}
            >
              {neuerHinweis ? <p className="text-ink-muted mb-3">{hinweis}</p> : null}
              <Frage
                definition={definition}
                frage={frage}
                antworten={antworten}
                onAntwort={onAntwort}
                fehler={fehler[frage.item.id]}
                fenstertitel={einzeln ? fenstertitel : undefined}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Frage({
  definition,
  frage,
  antworten,
  onAntwort,
  fehler,
  fenstertitel,
}: {
  definition: ScoreDefinition;
  frage: Bogenfrage;
  antworten: Antworten;
  onAntwort: Melden;
  fehler: string | undefined;
  /** Gesetzt, wenn die Frage schon im Titel des Fensters steht. */
  fenstertitel: string | undefined;
}) {
  const eigeneId = useId();
  const { item } = frage;
  const antwort = antworten[item.id];
  const melden = (neu: Antwort | undefined) => onAntwort(item.id, neu);
  const titelId = fenstertitel ?? eigeneId;
  // Unter 23rem passt „Gleichgewichtsstörungen“ in keine Zeile: Die Frage trennt dort an der Silbe
  // wie ein Übungsname (ANN-707), statt ohne Strich mitten im Wort zu brechen.
  const kopf = fenstertitel ? null : (
    <Zwischentitel ebene={3} id={eigeneId}>
      <span className="trennen-schmal">{umbrechbar(frageText(item))}</span>
    </Zwischentitel>
  );
  const meldung = fehler ? (
    <Statusmeldung ton="fehler" className="mt-2">
      {fehler}
    </Statusmeldung>
  ) : null;

  switch (item.typ) {
    case 'einzelauswahl':
    case 'mehrfachauswahl':
      return (
        <div>
          {kopf}
          <Wahl item={item} titelId={titelId} antwort={antwort} onAntwort={melden} />
          {meldung}
        </div>
      );
    case 'skala':
      return (
        <div>
          {kopf}
          <Skala item={item} titelId={titelId} antwort={antwort} onAntwort={melden} />
          {meldung}
        </div>
      );
    case 'freitext':
    case 'zahl':
      return (
        <Text
          item={item}
          mehrzeilig={frage.mehrzeilig}
          versteckt={fenstertitel !== undefined}
          antwort={antwort}
          onAntwort={melden}
          fehler={fehler}
        />
      );
    case 'koerperschema':
      // Das Körperbild der Praxis mit seinen Texten; steht die Frage im Titel, hört die Legende
      // nur Vorlesesoftware.
      return (
        <div className={fenstertitel ? '[&_legend]:sr-only' : undefined}>
          <FragebogenFelder
            definition={{ ...definition, items: [{ ...item, text: wortlaut(item) }] }}
            antworten={antworten}
            onChange={onAntwort}
            fehler={fehler ? { [item.id]: fehler } : {}}
          />
        </div>
      );
  }
}

/** Eine Wahl: „nein“ nimmt die anderen zurück und umgekehrt, ein zweiter Tipp nimmt zurück. */
function Wahl({
  item,
  titelId,
  antwort,
  onAntwort,
}: {
  item: ScoreItem;
  titelId: string;
  antwort: Antwort | undefined;
  onAntwort: (antwort: Antwort | undefined) => void;
}) {
  const mehrfach = item.typ === 'mehrfachauswahl';
  const optionen = item.optionen ?? [];
  const gewaehlt = gewaehlteKennungen(antwort);
  const eigene = antwort && 'freitext' in antwort ? (antwort.freitext ?? '') : '';
  const mitAngabe = optionen.find(
    (option) => option.freitext && gewaehlt.includes(optionKennung(option)),
  );
  const exklusive = optionen.filter((option) => option.exklusiv).map(optionKennung);

  function setzen(neu: readonly string[], freitext: string) {
    if (neu.length === 0) return onAntwort(undefined);
    const behalten = optionen.some((o) => o.freitext && neu.includes(optionKennung(o)));
    const zusatz = behalten && freitext.trim() !== '' ? { freitext } : {};
    onAntwort(mehrfach ? { auswahl: [...neu], ...zusatz } : { auswahl: neu[0]!, ...zusatz });
  }

  function umschalten(kennung: string) {
    if (gewaehlt.includes(kennung)) {
      return setzen(
        gewaehlt.filter((k) => k !== kennung),
        eigene,
      );
    }
    if (!mehrfach || exklusive.includes(kennung)) return setzen([kennung], eigene);
    setzen([...gewaehlt.filter((k) => !exklusive.includes(k)), kennung], eigene);
  }

  return (
    <>
      <Wahlflaechen
        beschriftetVon={titelId}
        form={istJaNein(item) ? 'paar' : 'zeilen'}
        wahlen={optionen.map((option) => ({
          schluessel: optionKennung(option),
          text: option.label,
        }))}
        gewaehlt={gewaehlt}
        onUmschalten={umschalten}
      />
      {mitAngabe ? (
        <div className="mt-3">
          <Field
            label={`Angabe zu „${mitAngabe.label}“`}
            maxLength={FREITEXT_MAX}
            enterKeyHint="done"
            onKeyDown={ohneAbsenden}
            value={eigene}
            onChange={(e) => setzen(gewaehlt, e.target.value)}
          />
        </div>
      ) : null}
    </>
  );
}

function Skala({
  item,
  titelId,
  antwort,
  onAntwort,
}: {
  item: ScoreItem;
  titelId: string;
  antwort: Antwort | undefined;
  onAntwort: (antwort: Antwort | undefined) => void;
}) {
  const anker = ankerSatz(item);
  const skala = item.skala ?? { min: 0, max: 10 };
  return (
    <>
      {anker ? <p className="text-ink-muted mb-3">{anker}</p> : null}
      <Stufenskala
        beschriftetVon={titelId}
        min={skala.min}
        max={skala.max}
        enden={item.anker ? [item.anker.min, item.anker.max] : undefined}
        wert={antwort && 'wert' in antwort ? antwort.wert : null}
        onChange={(wert) => onAntwort(wert === null ? undefined : { wert })}
      />
    </>
  );
}

/** Text in einer oder drei Zeilen, eine Zahl; die Frage ist die Beschriftung des Felds. */
function Text({
  item,
  mehrzeilig,
  versteckt,
  antwort,
  onAntwort,
  fehler,
}: {
  item: ScoreItem;
  mehrzeilig: boolean;
  /** Die Frage steht schon im Titel des Fensters: die Beschriftung nur für Vorlesesoftware. */
  versteckt: boolean;
  antwort: Antwort | undefined;
  onAntwort: (antwort: Antwort | undefined) => void;
  fehler: string | undefined;
}) {
  const beschriftung = frageText(item);
  const stil = versteckt
    ? '[&_label]:sr-only'
    : '[&_label]:font-semibold max-[23rem]:[&_label]:hyphens-auto max-[23rem]:[&_label]:[hyphenate-limit-chars:12_5_5]';
  if (item.typ === 'zahl') {
    return (
      <div className={stil}>
        <Field
          label={beschriftung}
          type="number"
          inputMode="decimal"
          enterKeyHint="done"
          onKeyDown={ohneAbsenden}
          error={fehler}
          value={antwort && 'wert' in antwort ? String(antwort.wert) : ''}
          onChange={(e) =>
            onAntwort(e.target.value === '' ? undefined : { wert: Number(e.target.value) })
          }
        />
      </div>
    );
  }
  const text = antwort && 'text' in antwort ? antwort.text : '';
  const aendern = (wert: string) => onAntwort(wert.trim() === '' ? undefined : { text: wert });
  return (
    <div className={stil}>
      {mehrzeilig ? (
        <TextArea
          label={beschriftung}
          rows={3}
          maxLength={FREITEXT_MAX}
          error={fehler}
          value={text}
          onChange={(e) => aendern(e.target.value)}
        />
      ) : (
        <Field
          label={beschriftung}
          maxLength={FREITEXT_MAX}
          enterKeyHint="done"
          onKeyDown={ohneAbsenden}
          error={fehler}
          value={text}
          onChange={(e) => aendern(e.target.value)}
        />
      )}
    </div>
  );
}

/** Der Schrägstrich für sich: Das Wort davor trennt an der Silbe, die Zeile darf an ihm enden. */
function umbrechbar(text: string): ReactNode {
  return text.split('/').map((teil, index) =>
    index === 0 ? (
      teil
    ) : (
      <Fragment key={index}>
        <span className="inline-block">/</span>
        {teil}
      </Fragment>
    ),
  );
}
