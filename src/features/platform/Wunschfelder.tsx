import { useId, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { Disclosure } from '@/components/ui/Card';
import { Checkbox } from '@/components/ui/Checkbox';
import { ListRow } from '@/components/ui/ListRow';
import { TextArea } from '@/components/ui/TextArea';
import { TAGESZEITEN, TAGESZEIT_NAME } from './api';
import {
  NOTIZ_MAX,
  WOCHENTAGE,
  WOCHENTAG_NAME,
  egalUmschalten,
  tagUmschalten,
  tageText,
  wunschtage,
  zeitUmschalten,
  zeitenText,
  zeitraumText,
  type Wann,
} from './terminablauf';

/**
 * Was „Termin wünschen“ und „Termin ändern“ teilen (POR-009, POR-010,
 * Überholung 6): die Seite „Wann passt es Ihnen?“, die Nachricht an die
 * Praxis und die Zeilen der Zusammenfassung.
 */

/**
 * „Wann passt es Ihnen?“: Montag bis Freitag und die drei Tageszeiten samt
 * „Egal“ als Häkchen, je zwei nebeneinander - zusammen auf einer Seite ohne
 * Rollen bei 375 × 667 in 18 px; warum Wochentage statt Daten, steht in
 * `terminablauf.ts`. Die Beschriftung ist das Ziel, mindestens 44 px hoch;
 * bei sehr wenig Breite (200 %) steht alles untereinander. Nichts ist
 * vorbelegt.
 */
export function Wunschfelder({ wann, onWann }: { wann: Wann; onWann: (wann: Wann) => void }) {
  return (
    <div className="flex flex-col gap-5">
      <fieldset className="min-w-0">
        <legend className="text-ink text-liste mb-1 font-semibold">An welchen Tagen?</legend>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 max-[20rem]:grid-cols-1">
          {WOCHENTAGE.map((tag, index) => (
            <Checkbox
              key={tag}
              label={WOCHENTAG_NAME[tag]}
              checked={wann.tage.includes(tag)}
              onChange={() => onWann(tagUmschalten(wann, tag))}
              // Der Fokus beginnt bei der ersten Antwort, nicht im Kopf.
              {...(index === 0 ? { 'data-autofocus': true } : {})}
            />
          ))}
        </div>
      </fieldset>
      <fieldset className="min-w-0">
        <legend className="text-ink text-liste mb-1 font-semibold">Zu welcher Tageszeit?</legend>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 max-[20rem]:grid-cols-1">
          {TAGESZEITEN.map((zeit) => (
            <Checkbox
              key={zeit}
              label={TAGESZEIT_NAME[zeit]}
              checked={wann.zeiten !== 'egal' && wann.zeiten.includes(zeit)}
              onChange={() => onWann(zeitUmschalten(wann, zeit))}
            />
          ))}
          <Checkbox
            label="Egal"
            checked={wann.zeiten === 'egal'}
            onChange={() => onWann(egalUmschalten(wann))}
          />
        </div>
      </fieldset>
    </div>
  );
}

/**
 * Eine Angabe der Zusammenfassung: Bezeichnung, Wert und - wo sie sich ändern
 * lässt - „Ändern“ in voller Größe (DESIGN.md „Plattform“). Der Name des
 * Knopfs beginnt mit dem sichtbaren Wort (WCAG 2.5.3). `zeit` vorn wie in der
 * Terminliste: Tag über Uhrzeit.
 */
export function Angabe({
  titel,
  zeit,
  onAendern,
  children,
}: {
  titel: string;
  zeit?: ReactNode;
  onAendern?: (() => void) | undefined;
  children?: ReactNode;
}) {
  return (
    <ListRow
      zeit={zeit}
      titel={titel}
      meta={children}
      aktion={
        onAendern ? (
          <Button
            variant="secondary"
            groesse="normal"
            aria-label={`Ändern: ${titel}`}
            onClick={onAendern}
          >
            Ändern
          </Button>
        ) : undefined
      }
    />
  );
}

/**
 * „Wann passt es Ihnen?“ in der Zusammenfassung - eine Zeile für die eine
 * Seite: Tage, Tageszeit und bis wann die Tage reichen, je eine Zeile.
 */
export function Wannzeile({
  wann,
  werktage,
  onAendern,
}: {
  wann: Wann;
  werktage: readonly string[];
  onAendern: () => void;
}) {
  return (
    <Angabe titel="Wann" onAendern={onAendern}>
      <span className="block">{tageText(wann.tage)}</span>
      <span className="block">{zeitenText(wann.zeiten)}</span>
      <span className="block">{zeitraumText(wunschtage(wann.tage, werktage))}</span>
    </Angabe>
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
