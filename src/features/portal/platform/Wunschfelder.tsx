import { useId, useRef, useState, type ReactNode } from 'react';
import { Anrufknoepfe } from '@/components/ui/Anrufknoepfe';
import { Button } from '@/components/ui/Button';
import { Disclosure } from '@/components/ui/Card';
import { ListRow, ListRows } from '@/components/ui/ListRow';
import { OhneNetzSymbol } from '@/components/ui/OhneNetzSymbol';
import { TextArea } from '@/components/ui/TextArea';
import { Wahlflaechen, type Wahl } from '@/components/ui/Wahlflaechen';
import { Wochenleiste, type Wochentag as Leistentag } from '@/components/ui/Wochenleiste';
import { telHref } from '@/lib/telefon';
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
    <ListRow
      bezeichnung={titel}
      titel={wert ?? ''}
      meta={bisTag(tage)}
      aktion={
        // Der Name beginnt mit dem Wort auf dem Knopf (WCAG 2.5.3).
        <Button
          variant="secondary"
          groesse="kompakt"
          aria-label={`Ändern: ${titel}`}
          onClick={onAendern}
        >
          Ändern
        </Button>
      }
    />
  );
}

/**
 * Reißt die Verbindung im Ablauf ab, wartet das Senden (ANN-783): der Satz ruhig mit dem Zeichen über
 * dem gesperrten Knopf. Beim Absagen läuft die Frist weiter; ein Anruf braucht kein Netz.
 */
export function OhneNetzHinweis({
  id,
  verbunden,
  anruf = null,
  className = '',
}: {
  id: string;
  verbunden: boolean;
  /** Die Rufnummer der Praxis für „Praxis anrufen“, sonst `null`. */
  anruf?: string | null;
  /** Der Abstand zum Knopf darunter oder zum Satz darüber. */
  className?: string;
}) {
  // Die Region steht immer im Baum: Mit ihrem Text entstanden, sagte Vorlesesoftware sie nicht an.
  return (
    <div role="status">
      {verbunden ? null : (
        <div className={`flex flex-col gap-3 ${className}`}>
          <p id={id} className="text-ink-muted flex items-start gap-2 text-sm">
            <OhneNetzSymbol />
            <span>{WUNSCHSCHUTZ.ohneVerbindung}</span>
          </p>
          {anruf ? (
            <Anrufknoepfe
              nummern={[{ label: 'Praxis', anzeige: anruf, href: telHref(anruf) }]}
              zweizeilig
            />
          ) : null}
        </div>
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
