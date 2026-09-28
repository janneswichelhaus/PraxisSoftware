import { useId, useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Select } from '@/components/ui/Select';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { centZuEingabe, formatEuro, parseEuroZuCent } from '@/lib/geld';
import { todayInTimeZone } from '@/features/appointments/api';
import { RueckzahlungZuHoch, bucheZahlung, zahlungswegLabels } from './api';

export type Zahlungsrichtung = 'incoming' | 'refund';

/** Was gebucht wurde - für die Meldung dort, wo das Formular danach nicht mehr steht. */
export interface Buchung {
  betragCent: number;
  richtung: Zahlungsrichtung;
}

type Feld = 'betrag' | 'tag';

/**
 * „1.234,56" oder „1.234": eine Zahl mit Tausenderpunkt (ABR-09).
 *
 * Nur zum Erkennen, **nicht** zum Annehmen: Welche Beträge gelten, legt
 * `parseEuroZuCent` fest, und das bleibt so - die Funktion liest auch die
 * Katalogpreise. Diese Prüfung ändert allein die Meldung, damit sie den
 * Grund nennt statt „größer als null" zu verlangen.
 */
const TAUSENDERPUNKT = /^\d{1,3}\.\d{3}/;

/**
 * Eine Zahlung buchen (ABR-004).
 *
 * Derselbe Baustein an zwei Stellen: am offenen Posten auf der Einstiegsseite
 * und an der Rechnung selbst. Zwei Formulare für denselben Vorgang liefen
 * früher oder später auseinander — und der Unterschied fiele erst auf, wenn
 * eine Buchung an der einen Stelle etwas anderes täte als an der anderen.
 *
 * **Der offene Betrag ist vorbelegt**, das Datum ist heute. Der häufigste Fall
 * — die Rechnung wird vollständig bezahlt — ist damit ein Knopfdruck, und die
 * **Teilzahlung braucht keinen eigenen Weg**: Es ist dasselbe Formular mit
 * einer anderen Zahl (`OPTIMIERUNG.md`, „Zahlung buchen: ≤ 3 Taps,
 * Teilzahlung ohne Sonderweg").
 *
 * Die **Rückzahlung** steht daneben und nicht in einem eigenen Bereich: Sie
 * ist derselbe Vorgang mit anderer Richtung. Gerechnet wird nichts hier — was
 * eine Rechnung noch offen hat, sagt der Server (ADR-009 Punkt 12).
 *
 * **Seit UXR-010 (ABR-09, ABR-10, ZST-11):** Wer auf „Rückzahlung" wechselt,
 * bekommt den offenen Betrag nicht mehr mitgeliefert - als Rückzahlung wäre
 * er fast immer falsch. Der Hinweis nennt dann, was eingegangen ist, und zwar
 * den Wert des Servers. Fehler stehen an dem Feld, das sie betreffen, und
 * verschwinden mit der nächsten Eingabe dort. Nach dem Buchen sagt eine
 * Meldung, was gebucht wurde; wo das Formular dabei schließt, übernimmt das
 * die Seite (`onFertig`).
 */
export function Zahlungsformular({
  invoiceId,
  offenCent,
  eingegangenCent,
  waehrung,
  zeitzone,
  onFertig,
}: {
  invoiceId: string;
  /** Der offene Betrag als Vorbelegung. Bei Überzahlung negativ — dann leer. */
  offenCent: number;
  /** Was auf die Rechnung eingegangen ist (Server); Hinweis bei einer Rückzahlung. */
  eingegangenCent?: number | undefined;
  waehrung: string;
  zeitzone: string;
  /** Nach dem Buchen, mit dem, was gebucht wurde. */
  onFertig?: ((buchung: Buchung) => void) | undefined;
}) {
  const queryClient = useQueryClient();
  const heute = todayInTimeZone(zeitzone);
  const vorbelegung = offenCent > 0 ? centZuEingabe(offenCent) : '';
  const kennung = useId();
  const feldId: Record<Feld, string> = {
    betrag: `${kennung}-betrag`,
    tag: `${kennung}-tag`,
  };

  const [betrag, setBetrag] = useState(vorbelegung);
  const [tag, setTag] = useState(heute);
  const [weg, setWeg] = useState('bank_transfer');
  const [richtung, setRichtung] = useState<Zahlungsrichtung>('incoming');
  const [notiz, setNotiz] = useState('');
  const [fehler, setFehler] = useState<Partial<Record<Feld, string>>>({});
  const [gebucht, setGebucht] = useState<string | null>(null);

  const buchen = useMutation({
    mutationFn: (eingabe: Buchung) =>
      bucheZahlung({
        invoiceId,
        betragCent: eingabe.betragCent,
        tag,
        weg,
        richtung: eingabe.richtung,
        notiz: notiz.trim() === '' ? null : notiz.trim(),
      }),
    onSuccess: async (_ergebnis, eingabe) => {
      setBetrag('');
      setNotiz('');
      await queryClient.invalidateQueries({ queryKey: ['offene-posten'] });
      await queryClient.invalidateQueries({ queryKey: ['rechnungen'] });
      await queryClient.invalidateQueries({ queryKey: ['zahlungen'] });
      await queryClient.invalidateQueries({ queryKey: ['rechnungszahlungen', invoiceId] });
      // Aus der Rechnung selbst kommt der offene Betrag. Ohne sie neu zu
      // laden stand nach der Buchung weiter der alte da - samt Vorbelegung,
      // Hinweis und Erinnerungsknopf (ABR-01).
      await queryClient.invalidateQueries({ queryKey: ['rechnung', invoiceId] });
      const summe = formatEuro(eingabe.betragCent, waehrung);
      setGebucht(
        eingabe.richtung === 'refund' ? `Rückzahlung über ${summe} gebucht.` : `${summe} gebucht.`,
      );
      onFertig?.(eingabe);
    },
  });

  /** Jede Eingabe nimmt die Meldungen zurück, die sie betrifft. */
  function geaendert(feld?: Feld) {
    setGebucht(null);
    if (feld && fehler[feld]) setFehler((alt) => ({ ...alt, [feld]: undefined }));
  }

  function absenden(event: FormEvent) {
    event.preventDefault();
    if (buchen.isPending) return;

    const cent = parseEuroZuCent(betrag);
    const gefunden: Partial<Record<Feld, string>> = {};

    if (cent === null && TAUSENDERPUNKT.test(betrag.trim())) {
      gefunden.betrag = 'Bitte ohne Tausenderpunkt eingeben, etwa 1234,56.';
    } else if (cent === null || cent <= 0) {
      gefunden.betrag = 'Bitte einen Betrag größer als null eingeben, etwa 45,00.';
    }
    // Die Zukunftsprüfung gehört an das Datum, nicht an den Betrag (ZST-11).
    // Ohne `noValidate` hielt bisher die Prüfung des Browsers an - mit einer
    // Blase in dessen Sprache -, und diese Zeilen liefen nie.
    if (tag === '') {
      gefunden.tag = 'Bitte ein Datum wählen.';
    } else if (tag > heute) {
      gefunden.tag =
        'Eine Zahlung lässt sich nicht für die Zukunft buchen. Bitte ein Datum bis heute wählen.';
    }

    const erstes = (['betrag', 'tag'] as const).find((feld) => gefunden[feld]);
    if (erstes || cent === null) {
      setFehler(gefunden);
      if (erstes) document.getElementById(feldId[erstes])?.focus();
      return;
    }

    setFehler({});
    setGebucht(null);
    buchen.mutate({ betragCent: cent, richtung });
  }

  const hinweis =
    richtung === 'refund'
      ? eingegangenCent === undefined
        ? undefined
        : `Eingegangen: ${formatEuro(eingegangenCent, waehrung)}`
      : offenCent > 0
        ? `Offen: ${formatEuro(offenCent, waehrung)}`
        : undefined;

  return (
    <form onSubmit={absenden} noValidate className="mt-4 flex max-w-xl flex-col gap-4">
      {/* `items-end`: Der Hinweis am Betrag verschiebt dessen Feld nicht mehr
          gegen das Datum daneben (ABR-09). */}
      <div className="flex flex-wrap items-end gap-4">
        <div className="min-w-32 flex-1">
          <Field
            label={richtung === 'refund' ? 'Rückzahlung' : 'Betrag'}
            feldId={feldId.betrag}
            inputMode="decimal"
            value={betrag}
            onChange={(e) => {
              setBetrag(e.target.value);
              geaendert('betrag');
            }}
            hint={hinweis}
            error={fehler.betrag}
          />
        </div>
        <div className="min-w-36 flex-1">
          <Field
            label={richtung === 'refund' ? 'Zurückgezahlt am' : 'Eingegangen am'}
            feldId={feldId.tag}
            type="date"
            max={heute}
            value={tag}
            onChange={(e) => {
              setTag(e.target.value);
              geaendert('tag');
            }}
            error={fehler.tag}
          />
        </div>
      </div>

      {/* Mindestens 176 px je Auswahl: Schmaler schnitt „Zahlungseingang" ab.
          Am Handy stehen die beiden dann untereinander. */}
      <div className="flex flex-wrap items-end gap-4">
        <div className="min-w-44 flex-1">
          <Select
            label="Zahlungsweg"
            value={weg}
            onChange={(e) => {
              setWeg(e.target.value);
              geaendert();
            }}
          >
            {Object.entries(zahlungswegLabels).map(([wert, text]) => (
              <option key={wert} value={wert}>
                {text}
              </option>
            ))}
          </Select>
        </div>
        <div className="min-w-44 flex-1">
          <Select
            label="Art"
            value={richtung}
            onChange={(e) => {
              const neu = e.target.value === 'refund' ? 'refund' : 'incoming';
              setRichtung(neu);
              // Die Rückzahlung beginnt leer; zurück beim Eingang steht der
              // offene Betrag wieder da, wenn das Feld leer ist (ABR-09).
              if (neu === 'refund') setBetrag('');
              else if (betrag.trim() === '') setBetrag(vorbelegung);
              setFehler({});
              setGebucht(null);
            }}
          >
            <option value="incoming">Zahlungseingang</option>
            <option value="refund">Rückzahlung</option>
          </Select>
        </div>
      </div>

      <Field
        label="Notiz"
        hint="Optional, ohne Gesundheitsangaben."
        value={notiz}
        onChange={(e) => {
          setNotiz(e.target.value);
          geaendert();
        }}
      />

      <div>
        <Button type="submit" disabled={buchen.isPending}>
          {buchen.isPending ? 'Wird gebucht …' : 'Zahlung buchen'}
        </Button>
      </div>

      {gebucht ? <Statusmeldung ton="erfolg">{gebucht}</Statusmeldung> : null}

      {buchen.isError ? (
        <Statusmeldung ton="fehler">
          {buchen.error instanceof RueckzahlungZuHoch
            ? 'Es lässt sich höchstens zurückzahlen, was auf dieser Rechnung eingegangen ist.'
            : buchen.error.message}{' '}
          Die Eingaben stehen noch im Formular.
        </Statusmeldung>
      ) : null}
    </form>
  );
}
