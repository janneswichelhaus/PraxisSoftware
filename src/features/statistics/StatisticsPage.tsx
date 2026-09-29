import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/ui/PageHeader';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Field } from '@/components/ui/Field';
import { CardGrid, Inhaltsflaeche } from '@/components/ui/Card';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { aufklappKopfKlassen } from '@/components/ui/aufklappStile';
import { formatEuro } from '@/lib/geld';
import { sichereAlsDatei } from '@/features/datenschutz/datei';
import { KENNZAHLEN_KEY, ZIELE_KEY, fetchKennzahlen, fetchZiele, setzeZiel } from './api';
import {
  KENNZAHLEN,
  alsCsv,
  auslastungProzent,
  ausfaelle,
  csvDateiname,
  formatiere,
  monatsauswahl,
  monatsname,
  tagText,
  zielAlsEingabe,
  zielAusEingabe,
  zielstand,
  type Kennzahl,
  type Kennzahlen,
  type Ziele,
} from './kennzahlen';

/**
 * Statistiken (STA-EPIC-001): fünf Zahlen, nach denen die Praxis gesteuert
 * wird, jede mit Ziel und der einen Handlung, die sie auslöst.
 *
 * Nur `owner` bekommt die Seite und — verbindlich — nur `owner` bekommt vom
 * Server eine Zeile (STA-001). Die Seite zeigt ausschließlich Summen: keine
 * Patientin, keine Rechnung, keine Mitarbeiterin (§20, B6).
 */
export function StatisticsPage() {
  const [monat, setMonat] = useState<string | null>(null);

  const kennzahlen = useQuery({
    queryKey: [...KENNZAHLEN_KEY, monat],
    queryFn: () => fetchKennzahlen(monat),
    // Beim Monatswechsel bleibt die Seite mit der Auswahl stehen, bis der neue
    // Monat da ist - sonst verschwände die Auswahl, und ein Fehler ließe
    // keinen Weg zu einem anderen Monat.
    placeholderData: keepPreviousData,
    retry: false,
  });
  const ziele = useQuery({ queryKey: ZIELE_KEY, queryFn: fetchZiele, retry: false });

  const k = kennzahlen.data;

  return (
    <>
      <PageHeader
        title="Statistiken"
        description="Fünf Zahlen für die Praxisführung – jede mit Ziel und dem nächsten Schritt. Nur Praxissummen, keine Werte je Person."
        actions={
          k && ziele.data ? (
            <Button variant="secondary" onClick={() => sichereCsv(k, ziele.data)} type="button">
              Als CSV speichern
            </Button>
          ) : null
        }
      />

      {kennzahlen.isPending ? <LoadingState label="Die Statistik wird geladen …" /> : null}
      {kennzahlen.isError ? (
        <>
          <ErrorState
            title="Die Statistik konnte nicht geladen werden."
            description="Bitte die Verbindung prüfen und erneut versuchen."
            onErneut={() => kennzahlen.refetch()}
          />
          {monat !== null ? (
            <Button variant="quiet" type="button" onClick={() => setMonat(null)}>
              Zum laufenden Monat
            </Button>
          ) : null}
        </>
      ) : null}
      {ziele.isError ? (
        <ErrorState
          title="Die Zielwerte konnten nicht geladen werden."
          description="Die Zahlen stehen trotzdem da; der Vergleich mit dem Ziel fehlt."
          onErneut={() => ziele.refetch()}
        />
      ) : null}

      {k ? (
        <>
          <div className="mb-6 sm:w-64">
            <Select
              label="Monat für Umsatz und Zahlungseingang"
              value={monat ?? k.month}
              onChange={(e) => setMonat(e.target.value)}
            >
              {monatsauswahl(k.today).map((wert) => (
                <option key={wert} value={wert}>
                  {monatsname(wert)}
                </option>
              ))}
            </Select>
          </div>

          <CardGrid>
            {KENNZAHLEN.map((kennzahl) => (
              <Kennzahlkarte
                key={kennzahl.ziel}
                kennzahl={kennzahl}
                k={k}
                ziel={ziele.data?.[kennzahl.ziel] ?? null}
                zieleGeladen={ziele.isSuccess}
              >
                <Einzelheiten kennzahl={kennzahl} k={k} />
              </Kennzahlkarte>
            ))}
          </CardGrid>

          <p className="text-ink-muted mt-8 max-w-prose text-sm">
            Umsatz und Zahlungseingang sind zwei Grundlagen und werden nie verrechnet. Die übrigen
            Zahlen gelten zum Stand {tagText(k.today)}. Kein steuerlicher Abschluss – die Aufteilung
            nach Steuerkennzeichen steht unter Abrechnung → Auswertung.
          </p>
        </>
      ) : null}
    </>
  );
}

function sichereCsv(k: Kennzahlen, ziele: Ziele) {
  // Ein BOM vorne, damit eine Tabellenkalkulation die Umlaute als UTF-8 liest.
  sichereAlsDatei(csvDateiname(k), `\uFEFF${alsCsv(k, ziele)}`, 'text/csv;charset=utf-8');
}

function Kennzahlkarte({
  kennzahl,
  k,
  ziel,
  zieleGeladen,
  children,
}: {
  kennzahl: Kennzahl;
  k: Kennzahlen;
  ziel: number | null;
  zieleGeladen: boolean;
  children: ReactNode;
}) {
  const wert = kennzahl.wert(k);
  const stand = zielstand(wert, ziel, kennzahl.richtung);
  const titelId = useId();

  return (
    <section aria-labelledby={titelId}>
      <Inhaltsflaeche className="flex h-full flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id={titelId} className="text-ink text-liste font-semibold">
            {kennzahl.titel}
          </h2>
          {stand === 'erreicht' ? <Badge ton="positiv">Ziel erreicht</Badge> : null}
          {stand === 'verfehlt' ? <Badge ton="warnung">Ziel verfehlt</Badge> : null}
        </div>

        <p className="text-ink text-2xl font-semibold tabular-nums">
          {formatiere(wert, kennzahl.einheit)}
        </p>

        <div className="text-ink-muted text-sm">{children}</div>

        {zieleGeladen ? <Zielzeile kennzahl={kennzahl} ziel={ziel} /> : null}

        <div className="mt-auto pt-1">
          <ButtonLink to={kennzahl.handlung.to} variant="secondary" groesse="kompakt">
            {kennzahl.handlung.label}
          </ButtonLink>
        </div>
      </Inhaltsflaeche>
    </section>
  );
}

function Einzelheiten({ kennzahl, k }: { kennzahl: Kennzahl; k: Kennzahlen }) {
  switch (kennzahl.ziel) {
    case 'revenue_cents':
      return (
        <>
          <p>
            {monatsname(k.month)}, Rechnungsstellung brutto · {monatsname(k.previous_month)}:{' '}
            {formatEuro(k.revenue_previous_cents)}
          </p>
          <p>
            Behandlung {formatEuro(k.revenue_therapy_cents)} · Training{' '}
            {formatEuro(k.revenue_training_cents)}
          </p>
          <p className="text-ink mt-2">
            Zahlungseingang {formatEuro(k.payments_cents)} · {monatsname(k.previous_month)}:{' '}
            {formatEuro(k.payments_previous_cents)}
          </p>
        </>
      );
    case 'open_items_cents':
      return (
        <>
          <p>
            {k.open_count} {k.open_count === 1 ? 'Rechnung' : 'Rechnungen'} offen, Stand{' '}
            {tagText(k.today)}
          </p>
          <ul className="mt-1">
            <li>
              noch nicht fällig: {formatEuro(k.open_not_due_cents)} ({k.open_not_due_count})
            </li>
            <li>
              1–30 Tage überfällig: {formatEuro(k.open_overdue_1_30_cents)} (
              {k.open_overdue_1_30_count})
            </li>
            <li>
              31–60 Tage überfällig: {formatEuro(k.open_overdue_31_60_cents)} (
              {k.open_overdue_31_60_count})
            </li>
            <li>
              über 60 Tage überfällig: {formatEuro(k.open_overdue_over_60_cents)} (
              {k.open_overdue_over_60_count})
            </li>
          </ul>
        </>
      );
    case 'utilization_percent': {
      const stunden = (minuten: number) =>
        new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 }).format(minuten / 60);
      return (
        <p>
          {tagText(k.utilization_from)} bis {tagText(k.utilization_to)}: {stunden(k.booked_minutes)}{' '}
          von {stunden(k.available_minutes)} Stunden Arbeitszeit gebucht
          {auslastungProzent(k) === null ? ' – keine Arbeitszeit hinterlegt' : ''}
        </p>
      );
    }
    case 'ending_bases':
      return (
        <p>
          Enden in 14 Tagen oder sind aufgebraucht, ohne neue Verordnung ·{' '}
          {k.uncovered_appointments}{' '}
          {k.uncovered_appointments === 1 ? 'kommender Termin' : 'kommende Termine'} ohne Deckung
        </p>
      );
    case 'absences':
      return (
        <>
          <p>
            {tagText(k.absences_from)} bis {tagText(k.absences_to)}: {k.patient_cancellations}{' '}
            {k.patient_cancellations === 1 ? 'Absage' : 'Absagen'} durch Patient:innen, {k.no_shows}{' '}
            nicht angetroffen
          </p>
          <p>
            davon {k.absences_with_fee} mit Ausfallhonorar, erfasst{' '}
            {formatEuro(k.absence_fee_cents)}
          </p>
          <p>
            vier Wochen davor: {k.absences_previous} ({formatEuro(k.absence_fee_previous_cents)})
            {ausfaelle(k) > k.absences_previous ? ' · mehr als davor' : ''}
          </p>
        </>
      );
  }
}

function Zielzeile({ kennzahl, ziel }: { kennzahl: Kennzahl; ziel: number | null }) {
  const queryClient = useQueryClient();
  const [eingabe, setEingabe] = useState(zielAlsEingabe(ziel, kennzahl.einheit));
  const [fehler, setFehler] = useState<string | undefined>();

  const speichern = useMutation({
    mutationFn: (wert: number | null) => setzeZiel(kennzahl.ziel, wert),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ZIELE_KEY }),
  });

  const richtung = kennzahl.richtung === 'mindestens' ? 'mindestens' : 'höchstens';

  function absenden(ereignis: FormEvent) {
    ereignis.preventDefault();
    const ergebnis = zielAusEingabe(eingabe, kennzahl.einheit);
    if (!ergebnis.ok) {
      setFehler(
        kennzahl.einheit === 'cent'
          ? 'Bitte einen Betrag in Euro eingeben, etwa 12000 oder 12000,50.'
          : kennzahl.einheit === 'prozent'
            ? 'Bitte eine ganze Zahl von 0 bis 100 eingeben.'
            : 'Bitte eine ganze Zahl eingeben.',
      );
      return;
    }
    setFehler(undefined);
    speichern.mutate(ergebnis.wert);
  }

  return (
    <details className="group border-line border-t pt-1">
      <summary className={`${aufklappKopfKlassen} text-sm`}>
        <span className="text-ink">
          Ziel:{' '}
          {ziel === null ? 'nicht gesetzt' : `${richtung} ${formatiere(ziel, kennzahl.einheit)}`}
        </span>
        <span className="text-accent ml-auto text-sm">Ändern</span>
      </summary>
      <form onSubmit={absenden} className="mt-2 flex flex-col gap-2" noValidate>
        <Field
          label={`Ziel ${kennzahl.titel} (${richtung}${kennzahl.einheit === 'cent' ? ', Euro' : kennzahl.einheit === 'prozent' ? ', Prozent' : ''})`}
          hint="Leer lassen, um das Ziel zu entfernen."
          inputMode={kennzahl.einheit === 'cent' ? 'decimal' : 'numeric'}
          value={eingabe}
          onChange={(e) => setEingabe(e.target.value)}
          error={fehler ?? (speichern.isError ? speichern.error.message : undefined)}
        />
        <div>
          <Button type="submit" groesse="kompakt" disabled={speichern.isPending}>
            {speichern.isPending ? 'Wird gespeichert …' : 'Ziel speichern'}
          </Button>
          {speichern.isSuccess && !speichern.isPending ? (
            <span role="status" className="text-ink-muted ml-3 text-sm">
              Gespeichert.
            </span>
          ) : null}
        </div>
      </form>
    </details>
  );
}
