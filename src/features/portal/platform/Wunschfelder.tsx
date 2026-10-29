import { useId, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { Disclosure } from '@/components/ui/Card';
import { TextArea } from '@/components/ui/TextArea';
import { Wahlflaechen } from '@/components/ui/Wahlflaechen';
import { Wochenleiste } from '@/components/ui/Wochenleiste';
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

/**
 * Was „Termin wünschen“ und „Termin ändern“ teilen (Handoff „Termine“ 5.3 und 5.4): die Seite „Wann
 * passt es Ihnen?“, die Karte der Zusammenfassung und die Nachricht.
 */

/** Montag bis Freitag in der Wochenleiste: „Mo“ sichtbar, „Montag“ vorgelesen. */
const TAGE = WOCHENTAGE.map((tag) => ({
  nummer: tag,
  kurz: WOCHENTAG_NAME[tag].slice(0, 2),
  lang: WOCHENTAG_NAME[tag],
}));

const EGAL = 'egal';

const ZEITEN = [
  ...TAGESZEITEN.map((zeit) => ({ schluessel: zeit, text: TAGESZEIT_NAME[zeit] })),
  { schluessel: EGAL, text: 'Egal' },
];

/**
 * „Wann passt es Ihnen?“: die Tage als Segment mit dem Satz, bis wann sie reichen, die Tageszeiten
 * als Wahlflächen; „Egal“ nimmt die anderen zurück und umgekehrt. Nichts ist vorbelegt, der Fokus
 * beginnt beim Montag. Warum Wochentage statt Daten, steht in `terminablauf.ts`.
 */
export function Wunschfelder({
  wann,
  werktage,
  onWann,
}: {
  wann: Wann;
  /** Die angebotenen Werktage (`naechsteWerktage(WUNSCHTAGE)`), für den Satz unter den Tagen. */
  werktage: readonly string[];
  onWann: (wann: Wann) => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      <Wochenleiste
        titel="An welchen Tagen?"
        ebene={2}
        wochentage={TAGE}
        tage={wann.tage}
        onUmschalten={(tag) => onWann(tagUmschalten(wann, tag as Wochentag))}
        satz={tageSatz(wann.tage, wunschtage(wann.tage, werktage))}
        autofokus
      />
      <Wahlflaechen
        titel="Zu welcher Tageszeit?"
        wahlen={ZEITEN}
        gewaehlt={wann.zeiten === 'egal' ? [EGAL] : wann.zeiten}
        onUmschalten={(schluessel) =>
          onWann(
            schluessel === EGAL
              ? egalUmschalten(wann)
              : zeitUmschalten(wann, schluessel as Tageszeit),
          )
        }
      />
    </div>
  );
}

/**
 * Eine Angabe der Zusammenfassung in einer `Terminliste`: Bezeichnung leise, der Wert in 600, darunter leise ein Zusatz;
 * wo sie sich ändern lässt, rechts „Ändern“ (44). Der Name des Knopfs beginnt mit dem sichtbaren
 * Wort (WCAG 2.5.3). Unter 23rem steht „Ändern“ unter dem Text.
 */
export function Angabe({
  titel,
  wert,
  zusatz,
  onAendern,
}: {
  titel: string;
  wert: ReactNode;
  zusatz?: ReactNode;
  onAendern?: (() => void) | undefined;
}) {
  return (
    <li className="flex items-start justify-between gap-3 px-4 py-3.5 max-[23rem]:flex-col max-[23rem]:px-3">
      <span className="flex min-w-0 flex-col hyphens-manual">
        <span className="text-ink-muted">{titel}</span>
        <span className="font-semibold">{wert}</span>
        {zusatz ? <span className="text-ink-muted">{zusatz}</span> : null}
      </span>
      {onAendern ? (
        <Button
          variant="secondary"
          groesse="kompakt"
          className="shrink-0"
          aria-label={`Ändern: ${titel}`}
          onClick={onAendern}
        >
          Ändern
        </Button>
      ) : null}
    </li>
  );
}

/**
 * Die Wahl von „Wann passt es Ihnen?“ als Angabe: „Dienstag oder Donnerstag, vormittags“ und bis
 * wann die Tage reichen - in den Worten der Liste der Wünsche (ANN-767).
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
  return (
    <Angabe
      titel={titel}
      wert={wunschInWorten({ preferred_days: tage, preferred_times: wunschzeiten(wann.zeiten) })}
      zusatz={bisTag(tage)}
      onAendern={onAendern}
    />
  );
}

/** Der Fuß der Zusammenfassung: was der Knopf bewirkt, darunter der eine Hauptknopf. */
export function Sendefuss({ hinweis, children }: { hinweis: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      {hinweis}
      {children}
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
 * Die Nachricht an die Praxis: eingeklappt und freiwillig. Mit `alsTitel` ist die Frage selbst der
 * Aufklapper, das Feld heißt nur für Vorlesesoftware nach ihr (ANN-785). Wer aufklappt, will
 * schreiben: Das Feld bekommt den Fokus; steht etwas darin, ist sie offen.
 */
export function Nachricht({
  frage,
  alsTitel = false,
  wert,
  onWert,
}: {
  frage: string;
  alsTitel?: boolean;
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
      summary={alsTitel ? `${frage} (freiwillig)` : 'Nachricht an die Praxis (freiwillig)'}
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
        label={frage}
        labelVersteckt={alsTitel}
        hint={`${wert.trim().length} von ${NOTIZ_MAX} Zeichen`}
        rows={3}
        value={wert}
        onChange={(event) => onWert(event.target.value)}
      />
    </Disclosure>
  );
}
