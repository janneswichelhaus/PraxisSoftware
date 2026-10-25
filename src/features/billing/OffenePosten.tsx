import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { Field } from '@/components/ui/Field';
import { ListRow, ListRows } from '@/components/ui/ListRow';
import { Section } from '@/components/ui/Section';
import { Segment } from '@/components/ui/Segment';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { formatDate, todayInTimeZone } from '@/lib/datum';
import { formatEuro } from '@/lib/geld';
import { bucheZahlung, fetchOffenePosten, type OffenerPosten } from './api';
import { monatsname } from './anzeige';
import { Zahlungsformular, type Buchung } from './Zahlungsformular';

/**
 * Offene Posten (ABR-004) - ganz oben auf der Einstiegsseite, ohne einen Tipp
 * (K14: „0 Tipps bis zur Liste“).
 *
 * Seit der Bereichsüberholung 4 eine Liste (DESIGN.md Regel 3) statt einer
 * Karte je Posten: Die ganze Zeile führt zur Rechnung, „Zahlung buchen“ steht
 * daneben und öffnet das Formular unter der Zeile (≤ 3 Tipps je Zahlung).
 *
 * **Mehrere buchen (K14, Zahlungseingang als Sammellauf):** Wer mit dem
 * Kontoauszug vor sich sitzt, hakt die bezahlten Posten an und bucht sie in
 * einem Tipp - je Posten der offene Betrag als Überweisung am gewählten Tag.
 * Abweichende Beträge und Rückzahlungen bleiben beim Formular der Zeile. Eine
 * Buchung ist kein Schritt ohne Rückweg: Sie lässt sich an der Rechnung
 * stornieren (ADR-009 Punkt 12) - deshalb ohne Rückfrage.
 */

/**
 * Anzahl und Summe der offenen Posten - beide vom Server, über alle Posten,
 * auch wenn die Liste gekürzt ist (ABR-033, BEF-061 Option 1).
 */
function postenHinweis(posten: OffenerPosten[]): string {
  const erster = posten[0]!;
  const gesamt = erster.total_count ?? posten.length;
  const anzahl = gesamt === 1 ? 'Eine Rechnung' : `${gesamt} Rechnungen`;
  const summe = `${formatEuro(erster.open_total_cents, erster.currency)} offen`;
  return posten.length < gesamt
    ? `${anzahl} · ${summe} · die ${posten.length} am frühesten fälligen stehen hier`
    : `${anzahl} · ${summe}`;
}

/** Die Meldung nach einer Buchung - dort, wo das Formular stand. */
interface Buchungsmeldung {
  text: string;
  ton: 'erfolg' | 'fehler';
  /** Zählt mit, damit auch eine gleichlautende zweite Meldung den Fokus holt. */
  nummer: number;
}

export function OffenePosten({
  darfBuchen,
  zeitzone,
  onSammeln,
}: {
  darfBuchen: boolean;
  zeitzone: string | null;
  /** Die Sammelbuchung ist offen - die Seite stellt den Lauf so lange zurück. */
  onSammeln?: (an: boolean) => void;
}) {
  const [meldung, setMeldung] = useState<Buchungsmeldung | null>(null);
  const [mehrere, setMehrere] = useState(false);
  const kasten = useRef<HTMLDivElement>(null);

  const posten = useQuery({
    queryKey: ['offene-posten'],
    queryFn: fetchOffenePosten,
    retry: false,
  });

  // Nach der Buchung schließt das Formular, und ein bezahlter Posten
  // verschwindet ganz. Ohne Meldung am Ort fiele der Fokus an den
  // Seitenanfang (ABR-10).
  useEffect(() => {
    if (meldung) kasten.current?.focus();
  }, [meldung]);

  function umschalten(an: boolean) {
    setMehrere(an);
    onSammeln?.(an);
  }

  function melde(text: string, ton: Buchungsmeldung['ton'] = 'erfolg') {
    setMeldung((alt) => ({ text, ton, nummer: (alt?.nummer ?? 0) + 1 }));
  }

  const buchbar = darfBuchen && zeitzone !== null;
  const mehrereMoeglich = buchbar && (posten.data?.length ?? 0) > 1;

  return (
    <Section
      titel="Offene Posten"
      hinweis={
        // Ohne offene Posten erklärt die Leermeldung den Abschnitt (UX-005i).
        posten.data && posten.data.length > 0 ? postenHinweis(posten.data) : undefined
      }
    >
      {/* Zwei Ansichten derselben Liste, genau eine gilt (DESIGN.md 9.9). */}
      {mehrereMoeglich ? (
        <div className="mb-3">
          <Segment
            beschriftung="Zahlungen buchen"
            wahlen={[
              { wert: 'einzeln', text: 'Einzeln' },
              { wert: 'mehrere', text: 'Mehrere buchen' },
            ]}
            gewaehlt={mehrere ? 'mehrere' : 'einzeln'}
            onWaehlen={(wert) => umschalten(wert === 'mehrere')}
          />
        </div>
      ) : null}

      {meldung ? (
        <div ref={kasten} tabIndex={-1} className="mb-3 outline-none">
          <Statusmeldung ton={meldung.ton}>{meldung.text}</Statusmeldung>
        </div>
      ) : null}

      <Abfragezustand
        abfrage={posten}
        laden="Offene Posten werden geladen …"
        fehler="Die offenen Posten konnten nicht geladen werden."
        leer={{
          wenn: (daten) => daten.length === 0,
          titel: 'Nichts offen',
          beschreibung: 'Jede ausgestellte Rechnung ist bezahlt.',
        }}
        inKarte
      >
        {(daten) =>
          mehrere && buchbar ? (
            <Sammelbuchung
              posten={daten}
              zeitzone={zeitzone}
              onFertig={(text, ton) => {
                umschalten(false);
                melde(text, ton);
              }}
            />
          ) : (
            <ListRows>
              {daten.map((eintrag) => (
                <PostenZeile
                  key={eintrag.id}
                  posten={eintrag}
                  zeitzone={buchbar ? zeitzone : null}
                  onGebucht={(text) => melde(text)}
                />
              ))}
            </ListRows>
          )
        }
      </Abfragezustand>
    </Section>
  );
}

/** Was unter der Nummer steht: Empfänger, Monat, Ziel und was schon kam. */
function postenMeta(posten: OffenerPosten): string {
  return [
    posten.recipient_name,
    monatsname(posten.period_month),
    `zahlbar bis ${formatDate(posten.due_on)}`,
    posten.paid_cents > 0
      ? `${formatEuro(posten.paid_cents, posten.currency)} von ${formatEuro(
          posten.total_cents,
          posten.currency,
        )} bezahlt`
      : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/**
 * Ein offener Posten. Die Zeile führt zur Rechnung; „Zahlung buchen“ öffnet
 * das Formular darunter - die Rechnung, um die es geht, bleibt im Blick.
 */
function PostenZeile({
  posten,
  zeitzone,
  onGebucht,
}: {
  posten: OffenerPosten;
  /** Ohne Zeitzone (oder ohne Recht) kein Buchen. */
  zeitzone: string | null;
  onGebucht: (meldung: string) => void;
}) {
  const [offen, setOffen] = useState(false);

  function gebucht(buchung: Buchung) {
    setOffen(false);
    const betrag = formatEuro(buchung.betragCent, posten.currency);
    onGebucht(
      buchung.richtung === 'refund'
        ? `Rückzahlung über ${betrag} zu ${posten.invoice_number} gebucht.`
        : `${betrag} zu ${posten.invoice_number} gebucht.`,
    );
  }

  return (
    <ListRow
      to={`/abrechnung/rechnungen/${posten.id}`}
      titel={posten.invoice_number}
      meta={postenMeta(posten)}
      betrag={formatEuro(posten.outstanding_cents, posten.currency)}
      status={posten.overdue ? <Badge ton="kritisch">Überfällig</Badge> : undefined}
      aktion={
        zeitzone !== null ? (
          // Kurz sichtbar, ganz vorgelesen - wie „Erfassen“ an den Leistungen:
          // Neben Nummer und Betrag bleibt am Telefon so Platz für die Nummer.
          <Button
            type="button"
            variant="secondary"
            aria-expanded={offen}
            aria-label={offen ? undefined : 'Zahlung buchen'}
            onClick={() => setOffen((wert) => !wert)}
          >
            {offen ? 'Abbrechen' : 'Buchen'}
          </Button>
        ) : undefined
      }
      darunter={
        offen && zeitzone !== null ? (
          <div className="pb-4">
            <Zahlungsformular
              invoiceId={posten.id}
              offenCent={posten.outstanding_cents}
              eingegangenCent={posten.paid_cents}
              waehrung={posten.currency}
              zeitzone={zeitzone}
              onFertig={gebucht}
            />
          </div>
        ) : undefined
      }
    />
  );
}

/**
 * Mehrere Posten in einem Tipp als bezahlt buchen: je Posten der offene
 * Betrag, Überweisung, am gewählten Tag. Jede Buchung läuft einzeln über
 * `record_payment`; eine abgewiesene hält die übrigen nicht auf.
 */
function Sammelbuchung({
  posten,
  zeitzone,
  onFertig,
}: {
  posten: OffenerPosten[];
  zeitzone: string;
  onFertig: (meldung: string, ton: 'erfolg' | 'fehler') => void;
}) {
  const queryClient = useQueryClient();
  const heute = todayInTimeZone(zeitzone);
  const [gewaehlt, setGewaehlt] = useState<ReadonlySet<string>>(new Set());
  const [tag, setTag] = useState(heute);
  const [tagFehler, setTagFehler] = useState<string | undefined>();
  const [laeuft, setLaeuft] = useState(false);

  const auswahl = posten.filter((p) => gewaehlt.has(p.id));
  const summe = auswahl.reduce((s, p) => s + p.outstanding_cents, 0);

  function umschalten(id: string, an: boolean) {
    setGewaehlt((alt) => {
      const neu = new Set(alt);
      if (an) neu.add(id);
      else neu.delete(id);
      return neu;
    });
  }

  async function buchen() {
    if (laeuft || auswahl.length === 0) return;
    if (tag === '') return setTagFehler('Bitte ein Datum wählen.');
    if (tag > heute) return setTagFehler('Eine Zahlung lässt sich nicht für die Zukunft erfassen.');
    setLaeuft(true);
    const fehlgeschlagen: string[] = [];
    let gebucht = 0;
    for (const eintrag of auswahl) {
      try {
        await bucheZahlung({
          invoiceId: eintrag.id,
          betragCent: eintrag.outstanding_cents,
          tag,
          weg: 'bank_transfer',
          richtung: 'incoming',
          notiz: null,
        });
        gebucht += 1;
      } catch {
        fehlgeschlagen.push(eintrag.invoice_number);
      }
    }
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['offene-posten'] }),
      queryClient.invalidateQueries({ queryKey: ['rechnungen'] }),
      queryClient.invalidateQueries({ queryKey: ['zahlungen'] }),
    ]);
    setLaeuft(false);
    const erfolg =
      gebucht === 1 ? 'Eine Zahlung gebucht.' : gebucht > 1 ? `${gebucht} Zahlungen gebucht.` : '';
    onFertig(
      fehlgeschlagen.length === 0
        ? `${erfolg} ${formatEuro(summe, posten[0]?.currency)} am ${formatDate(tag)}.`
        : `${erfolg} Nicht gebucht: ${fehlgeschlagen.join(', ')}. Bitte an der Zeile einzeln buchen.`.trim(),
      fehlgeschlagen.length === 0 ? 'erfolg' : 'fehler',
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <ListRows>
        {posten.map((eintrag) => (
          <ListRow
            key={eintrag.id}
            titel={eintrag.invoice_number}
            meta={postenMeta(eintrag)}
            betrag={formatEuro(eintrag.outstanding_cents, eintrag.currency)}
            status={eintrag.overdue ? <Badge ton="kritisch">Überfällig</Badge> : undefined}
            aktion={
              // Kästchen und Wort sind ein Ziel von 44 px; vorgelesen mit der Nummer.
              <Checkbox
                label="Bezahlt"
                aria-label={`${eintrag.invoice_number} bezahlt`}
                checked={gewaehlt.has(eintrag.id)}
                onChange={(event) => umschalten(eintrag.id, event.target.checked)}
              />
            }
          />
        ))}
      </ListRows>

      <div className="max-w-formular flex flex-col gap-3">
        <Field
          label="Eingegangen am"
          type="date"
          value={tag}
          max={heute}
          error={tagFehler}
          onChange={(event) => {
            setTag(event.target.value);
            setTagFehler(undefined);
          }}
        />
        <div>
          {/* Der Hauptknopf dieser Ansicht; der Lauf steht so lange zurück. */}
          <Button
            type="button"
            disabled={auswahl.length === 0 || laeuft}
            onClick={() => void buchen()}
            className="w-full sm:w-auto"
          >
            {laeuft
              ? 'Wird gebucht …'
              : auswahl.length === 0
                ? 'Bezahlte Posten anhaken'
                : `${auswahl.length === 1 ? 'Eine Zahlung' : `${auswahl.length} Zahlungen`} buchen · ${formatEuro(summe, posten[0]?.currency)}`}
          </Button>
        </div>
      </div>
    </div>
  );
}
