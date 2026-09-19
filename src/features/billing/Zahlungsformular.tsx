import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Select } from '@/components/ui/Select';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { centZuEingabe, formatEuro, parseEuroZuCent } from '@/lib/geld';
import { todayInTimeZone } from '@/features/appointments/api';
import { RueckzahlungZuHoch, bucheZahlung, zahlungswegLabels } from './api';

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
 */
export function Zahlungsformular({
  invoiceId,
  offenCent,
  waehrung,
  zeitzone,
  onFertig,
}: {
  invoiceId: string;
  /** Der offene Betrag als Vorbelegung. Bei Überzahlung negativ — dann leer. */
  offenCent: number;
  waehrung: string;
  zeitzone: string;
  onFertig?: () => void;
}) {
  const queryClient = useQueryClient();
  const heute = todayInTimeZone(zeitzone);

  const [betrag, setBetrag] = useState(offenCent > 0 ? centZuEingabe(offenCent) : '');
  const [tag, setTag] = useState(heute);
  const [weg, setWeg] = useState('bank_transfer');
  const [richtung, setRichtung] = useState<'incoming' | 'refund'>('incoming');
  const [notiz, setNotiz] = useState('');
  const [fehler, setFehler] = useState<string | undefined>(undefined);

  const buchen = useMutation({
    mutationFn: (eingabe: { betragCent: number }) =>
      bucheZahlung({
        invoiceId,
        betragCent: eingabe.betragCent,
        tag,
        weg,
        richtung,
        notiz: notiz.trim() === '' ? null : notiz.trim(),
      }),
    onSuccess: async () => {
      setBetrag('');
      setNotiz('');
      await queryClient.invalidateQueries({ queryKey: ['offene-posten'] });
      await queryClient.invalidateQueries({ queryKey: ['rechnungen'] });
      await queryClient.invalidateQueries({ queryKey: ['zahlungen'] });
      await queryClient.invalidateQueries({ queryKey: ['rechnungszahlungen', invoiceId] });
      onFertig?.();
    },
  });

  function absenden(event: FormEvent) {
    event.preventDefault();
    const cent = parseEuroZuCent(betrag);

    if (cent === null || cent <= 0) {
      setFehler('Bitte einen Betrag größer als null eingeben, etwa 45,00.');
      return;
    }
    if (tag > heute) {
      setFehler('Eine Zahlung lässt sich nicht für die Zukunft erfassen.');
      return;
    }

    setFehler(undefined);
    buchen.mutate({ betragCent: cent });
  }

  return (
    <form onSubmit={absenden} className="mt-3 flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        <div className="min-w-32 flex-1">
          <Field
            label={richtung === 'refund' ? 'Rückzahlung' : 'Betrag'}
            inputMode="decimal"
            value={betrag}
            onChange={(e) => setBetrag(e.target.value)}
            hint={offenCent > 0 ? `Offen: ${formatEuro(offenCent, waehrung)}` : undefined}
            error={fehler}
          />
        </div>
        <div className="min-w-36 flex-1">
          <Field
            label="Am"
            type="date"
            max={heute}
            value={tag}
            onChange={(e) => setTag(e.target.value)}
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="min-w-40 flex-1">
          <Select label="Weg" value={weg} onChange={(e) => setWeg(e.target.value)}>
            {Object.entries(zahlungswegLabels).map(([wert, text]) => (
              <option key={wert} value={wert}>
                {text}
              </option>
            ))}
          </Select>
        </div>
        <div className="min-w-40 flex-1">
          <Select
            label="Art"
            value={richtung}
            onChange={(e) => setRichtung(e.target.value === 'refund' ? 'refund' : 'incoming')}
          >
            <option value="incoming">Zahlungseingang</option>
            <option value="refund">Rückzahlung an den Empfänger</option>
          </Select>
        </div>
      </div>

      <Field
        label="Notiz"
        hint="Optional, ohne Gesundheitsangaben."
        value={notiz}
        onChange={(e) => setNotiz(e.target.value)}
      />

      <div>
        <Button type="submit" disabled={buchen.isPending}>
          {buchen.isPending ? 'Wird gebucht …' : 'Zahlung buchen'}
        </Button>
      </div>

      {buchen.isError ? (
        <Statusmeldung ton="fehler">
          {buchen.error instanceof RueckzahlungZuHoch
            ? 'Es lässt sich höchstens zurückzahlen, was auf dieser Rechnung eingegangen ist.'
            : buchen.error.message}
        </Statusmeldung>
      ) : null}
    </form>
  );
}
