import { useId, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { Disclosure } from '@/components/ui/Card';
import { ListRows } from '@/components/ui/ListRow';
import { OhneNetzSymbol } from '@/components/ui/OhneNetzSymbol';
import { TextArea } from '@/components/ui/TextArea';
import { Wahlflaechen, type Wahl } from '@/components/ui/Wahlflaechen';
import { Wochenleiste, type Wochentag as Leistentag } from '@/components/ui/Wochenleiste';
import { TAGESZEITEN, TAGESZEIT_NAME, type Tageszeit } from './api';
import {
  NOTIZ_MAX,
  WOCHENTAGE,
  WOCHENTAG_NAME,
  egalUmschalten,
  tagUmschalten,
  wunschtage,
  wunschzeiten,
  zeitUmschalten,
  type Wann,
  type Wochentag,
} from './terminablauf';
import { bisTag, tageSatz, wunschInWorten } from './termintexte';
import { WUNSCHSCHUTZ } from './wunschtexte';

/**
 * Was „Termin wünschen“ und „Termin ändern“ teilen: die Seite „Wann passt es Ihnen?“, die Karte der
 * Zusammenfassung und die Nachricht an die Praxis.
 */

const TAGE: readonly Leistentag[] = WOCHENTAGE.map((nummer) => ({
  nummer,
  kurz: WOCHENTAG_NAME[nummer].slice(0, 2),
  lang: WOCHENTAG_NAME[nummer],
}));

const ZEITWAHLEN: readonly Wahl[] = [
  ...TAGESZEITEN.map((zeit) => ({ schluessel: zeit, text: TAGESZEIT_NAME[zeit] })),
  { schluessel: 'egal', text: 'Egal' },
];

/**
 * „Wann passt es Ihnen?“: Montag bis Freitag als Leiste mit dem Satz darunter, die Tageszeiten als
 * Wahlflächen; „Egal“ nimmt die anderen zurück und umgekehrt. Nichts ist vorbelegt.
 */
export function Wunschfelder({
  wann,
  werktage,
  onWann,
}: {
  wann: Wann;
  /** Die angebotenen Werktage: Der Satz nennt den letzten, der gesendet würde. */
  werktage: readonly string[];
  onWann: (wann: Wann) => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      <Wochenleiste
        titel="An welchen Tagen?"
        ebene={2}
        autofokus
        wochentage={TAGE}
        tage={wann.tage}
        onUmschalten={(tag) => onWann(tagUmschalten(wann, tag as Wochentag))}
        satz={tageSatz(wann.tage, wunschtage(wann.tage, werktage))}
      />
      <Wahlflaechen
        titel="Zu welcher Tageszeit?"
        wahlen={ZEITWAHLEN}
        gewaehlt={wann.zeiten === 'egal' ? ['egal'] : wann.zeiten}
        onUmschalten={(schluessel) =>
          onWann(
            schluessel === 'egal'
              ? egalUmschalten(wann)
              : zeitUmschalten(wann, schluessel as Tageszeit),
          )
        }
      />
    </div>
  );
}

/** Die Karte der Zusammenfassung: ihre Angaben mit einer Linie dazwischen. */
export function Zusammenfassungskarte({ children }: { children: ReactNode }) {
  return <ListRows className="max-[23rem]:px-3">{children}</ListRows>;
}

/**
 * Eine Angabe der Karte: die Bezeichnung in Leise, der Wert fett, ein Zusatz in Leise und, wo sie
 * sich ändern lässt, „Ändern“ kompakt rechts. Der Name des Knopfs beginnt mit dem Wort (WCAG 2.5.3).
 */
export function Kartenangabe({
  titel,
  wert,
  zusatz,
  vorn,
  onAendern,
}: {
  titel?: string;
  wert: string;
  /** Eine oder mehrere Zeilen in Leise unter dem Wert. */
  zusatz?: string | readonly string[] | undefined;
  /** Ein Zeichen vor der Angabe, etwa der Kreis einer Absage. */
  vorn?: ReactNode;
  onAendern?: (() => void) | undefined;
}) {
  const zeilen = (typeof zusatz === 'string' ? [zusatz] : (zusatz ?? [])).filter(Boolean);
  if (onAendern) {
    // „Ändern“ steht in der Zeile der Bezeichnung, damit die Wahl die ganze Breite hat (ANN-784);
    // im Baum bleibt der Knopf hinter dem Wert. Unter 23rem steht er darunter.
    return (
      <li className="border-line grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 border-t py-3 hyphens-manual first:border-t-0 max-[23rem]:grid-cols-1">
        <p className="col-start-1 row-start-1 flex min-h-11 items-center">
          <span className="text-ink-muted">{titel}</span>
        </p>
        <p className="col-span-full flex flex-col">
          <span className="font-semibold">{wert}</span>
          {zeilen.map((zeile) => (
            <span key={zeile} className="text-ink-muted">
              {zeile}
            </span>
          ))}
        </p>
        <Button
          variant="secondary"
          groesse="kompakt"
          aria-label={`Ändern: ${titel ?? wert}`}
          className="col-start-2 row-start-1 self-start max-[23rem]:col-start-1 max-[23rem]:row-start-auto max-[23rem]:mt-2 max-[23rem]:justify-self-start"
          onClick={onAendern}
        >
          Ändern
        </Button>
      </li>
    );
  }
  return (
    <li className="border-line flex items-start gap-3 border-t py-3.5 first:border-t-0 max-[23rem]:flex-col max-[23rem]:py-3">
      {vorn}
      <p className="flex min-w-0 grow flex-col hyphens-manual">
        {titel ? <span className="text-ink-muted">{titel}</span> : null}
        <span className="font-semibold">{wert}</span>
        {zeilen.map((zeile) => (
          <span key={zeile} className="text-ink-muted">
            {zeile}
          </span>
        ))}
      </p>
    </li>
  );
}

/**
 * Die gewählten Tage und Tageszeiten in denselben Worten wie die Wunschzeile der Liste
 * („Dienstag oder Donnerstag, vormittags“), darunter bis wann die Tage reichen.
 */
export function Wannangabe({
  titel,
  wann,
  werktage,
  onAendern,
}: {
  titel: string;
  wann: Wann;
  werktage: readonly string[];
  onAendern: () => void;
}) {
  const tage = wunschtage(wann.tage, werktage);
  const wert = wunschInWorten({ preferred_days: tage, preferred_times: wunschzeiten(wann.zeiten) });
  return (
    <Kartenangabe titel={titel} wert={wert ?? ''} zusatz={bisTag(tage)} onAendern={onAendern} />
  );
}

/**
 * Reißt die Verbindung im Ablauf ab, wartet das Senden (ANN-783): der Satz ruhig und mit dem Zeichen
 * über dem gesperrten Knopf, die Angaben bleiben stehen. Die Region steht immer im Baum.
 */
export function OhneNetzHinweis({ id, verbunden }: { id: string; verbunden: boolean }) {
  return (
    <div role="status">
      {verbunden ? null : (
        <p id={id} className="text-ink-muted mb-2 flex items-start gap-2 text-sm">
          <OhneNetzSymbol />
          <span>{WUNSCHSCHUTZ.ohneVerbindung}</span>
        </p>
      )}
    </div>
  );
}

/**
 * Wo der Fokus in der Zusammenfassung beginnt: an ihrem Anfang, nicht beim
 * Knopf - ein Enter sendet so nichts ungesehen.
 */
export function Zusammenfassungsanfang() {
  return (
    <p tabIndex={-1} data-autofocus className="sr-only">
      Ihre Angaben
    </p>
  );
}

/**
 * Die Nachricht an die Praxis: eingeklappt und freiwillig. Wer sie aufklappt,
 * will schreiben - das Feld bekommt gleich den Fokus. Steht schon etwas darin,
 * ist sie offen.
 */
export function Nachricht({
  label,
  wert,
  onWert,
}: {
  label: string;
  wert: string;
  onWert: (wert: string) => void;
}) {
  const feldId = useId();
  const [anfangsOffen] = useState(() => wert.trim() !== '');
  // Ein von Anfang an offener Aufklapper meldet das Öffnen einmal selbst -
  // das ist kein Tipp der Person und nimmt der Seite nicht den Fokus.
  const ersteMeldung = useRef(anfangsOffen);
  return (
    <Disclosure
      summary="Nachricht an die Praxis (freiwillig)"
      offen={anfangsOffen}
      onUmschalten={(offen) => {
        if (ersteMeldung.current) {
          ersteMeldung.current = false;
          return;
        }
        if (offen) document.getElementById(feldId)?.focus();
      }}
    >
      <TextArea
        feldId={feldId}
        label={label}
        hint={`${wert.trim().length} von ${NOTIZ_MAX} Zeichen`}
        rows={3}
        value={wert}
        onChange={(event) => onWert(event.target.value)}
      />
    </Disclosure>
  );
}
