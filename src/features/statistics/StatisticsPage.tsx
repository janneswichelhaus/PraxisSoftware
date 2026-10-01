import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/ui/PageHeader';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Field } from '@/components/ui/Field';
import { Aufklappzeichen, CardGrid, Inhaltsflaeche } from '@/components/ui/Card';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { aufklappKopfKlassen } from '@/components/ui/aufklappStile';
import { formatEuro } from '@/lib/geld';
import { sichereAlsDatei } from '@/features/datenschutz/datei';
import { isOwner, type CurrentUser } from '@/features/session/types';
import { todayInTimeZone } from '@/features/appointments/api';
import {
  JE_PERSON_KEY,
  KENNZAHLEN_KEY,
  LEISTUNGEN_KEY,
  MONATE_KEY,
  ZIELE_KEY,
  fetchKennzahlen,
  fetchTopLeistungen,
  fetchUmsatzJePerson,
  fetchUmsatzMonate,
  fetchZiele,
  setzeZiel,
} from './api';
import { euroKurz, letzteMonate, personenReihen, umsatzReihen } from './diagramme';
import { Balkenliste, Messbalken, Saeulendiagramm } from './grafiken';
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
 * wird, jede mit Ziel und der einen Handlung, die sie auslöst — dazu der
 * Verlauf als Grafiken (STA-007).
 *
 * `owner` sieht alles; eine Person mit Umsatzbeteiligung sieht nur ihren
 * eigenen Umsatz (STA-006, ANN-156). Verbindlich entscheidet der Server, wer
 * welche Zeile bekommt — die Weiche hier ist nur Darstellung. Keine Patientin,
 * keine Rechnung erscheint je; Umsatz je Person ist die einzige Zahl mit
 * Personenbezug, und jeder Aufruf steht im Protokoll.
 */
export function StatisticsPage({ user }: { user: CurrentUser }) {
  return isOwner(user.roles) ? (
    <Praxisstatistik />
  ) : (
    <MeinUmsatz zeitzone={user.organizationTimeZone ?? 'Europe/Berlin'} />
  );
}

function Praxisstatistik() {
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
        description="Fünf Zahlen für die Praxisführung – jede mit Ziel und dem nächsten Schritt –, darunter der Verlauf. Umsatz je Person sehen nur du und die Person selbst bei Umsatzbeteiligung; jeder Blick darauf steht im Protokoll."
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
                <Einzelheiten
                  kennzahl={kennzahl}
                  k={k}
                  ziel={ziele.data?.[kennzahl.ziel] ?? null}
                />
              </Kennzahlkarte>
            ))}
          </CardGrid>

          <Verlauf monat={monat} heute={k.today} />

          {/* Die Fußnote erklärt die Rechnung, nicht die Zahlen - zugeklappt (UX-005i). */}
          <details className="group border-line mt-8 max-w-prose border-t pt-2">
            <summary className={`${aufklappKopfKlassen} text-ink-muted hover:text-ink text-sm`}>
              <Aufklappzeichen />
              Hinweise zur Berechnung
            </summary>
            <p className="text-ink-muted mt-2 text-sm">
              Umsatz und Zahlungseingang sind zwei Grundlagen und werden nie verrechnet. Die übrigen
              Zahlen gelten zum Stand {tagText(k.today)}. Kein steuerlicher Abschluss – die
              Aufteilung nach Steuerkennzeichen steht unter Abrechnung → Auswertung.
            </p>
          </details>
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

function Einzelheiten({
  kennzahl,
  k,
  ziel,
}: {
  kennzahl: Kennzahl;
  k: Kennzahlen;
  ziel: number | null;
}) {
  switch (kennzahl.ziel) {
    case 'revenue_cents':
      return (
        <>
          <p>
            {monatsname(k.month)}, Rechnungsstellung brutto · {monatsname(k.previous_month)}:{' '}
            {formatEuro(k.revenue_previous_cents)}
          </p>
          <div className="my-3">
            <Balkenliste
              titel="Umsatz nach Bereich"
              format={formatEuro}
              zeilen={[
                { schluessel: 'therapy', label: 'Behandlung', wert: k.revenue_therapy_cents },
                { schluessel: 'training', label: 'Training', wert: k.revenue_training_cents },
              ]}
            />
          </div>
          <p className="text-ink">
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
          <div className="mt-3">
            <Balkenliste
              titel="Offene Posten nach Alter"
              format={formatEuro}
              zeilen={[
                {
                  schluessel: '0',
                  label: `noch nicht fällig (${k.open_not_due_count})`,
                  wert: k.open_not_due_cents,
                },
                {
                  schluessel: '1',
                  label: `1–30 Tage überfällig (${k.open_overdue_1_30_count})`,
                  wert: k.open_overdue_1_30_cents,
                },
                {
                  schluessel: '2',
                  label: `31–60 Tage überfällig (${k.open_overdue_31_60_count})`,
                  wert: k.open_overdue_31_60_cents,
                },
                {
                  schluessel: '3',
                  label: `über 60 Tage überfällig (${k.open_overdue_over_60_count})`,
                  wert: k.open_overdue_over_60_cents,
                },
              ]}
            />
          </div>
        </>
      );
    case 'utilization_percent': {
      const stunden = (minuten: number) =>
        new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 }).format(minuten / 60);
      return (
        <>
          <div className="mb-3">
            <Messbalken titel="Auslastung" prozent={auslastungProzent(k)} ziel={ziel} />
          </div>
          <p>
            {tagText(k.utilization_from)} bis {tagText(k.utilization_to)}:{' '}
            {stunden(k.booked_minutes)} von {stunden(k.available_minutes)} Stunden Arbeitszeit
            gebucht
            {auslastungProzent(k) === null ? ' – keine Arbeitszeit hinterlegt' : ''}
            {ziel !== null ? ` · Strich: Ziel ${ziel} %` : ''}
          </p>
        </>
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
          <div className="mt-3">
            <Balkenliste
              titel="Ausfälle im Vergleich"
              format={(wert) => String(wert)}
              zeilen={[
                { schluessel: 'jetzt', label: 'letzte vier Wochen', wert: ausfaelle(k) },
                { schluessel: 'davor', label: 'vier Wochen davor', wert: k.absences_previous },
              ]}
            />
          </div>
          <p className="mt-2">Ausfallhonorare davor: {formatEuro(k.absence_fee_previous_cents)}</p>
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

/** Die Grafiken unter den Kennzahlen (STA-007). */
function Verlauf({ monat, heute }: { monat: string | null; heute: string }) {
  const monate = useQuery({
    queryKey: MONATE_KEY,
    queryFn: () => fetchUmsatzMonate(12),
    retry: false,
  });
  const leistungen = useQuery({
    queryKey: [...LEISTUNGEN_KEY, monat],
    queryFn: () => fetchTopLeistungen(monat),
    retry: false,
  });
  // Umsatz je Person ist die einzige Zahl mit Personenbezug; jeder Abruf steht
  // im Protokoll. Geladen wird sie deshalb erst auf ausdrücklichen Wunsch -
  // wer nur die Praxiszahlen ansieht, erzeugt keinen Eintrag (ANN-156).
  const [personenZeigen, setPersonenZeigen] = useState(false);
  const jePerson = useQuery({
    queryKey: [...JE_PERSON_KEY, 6],
    queryFn: () => fetchUmsatzJePerson(6),
    enabled: personenZeigen,
    retry: false,
  });

  const gewaehlt = monat ?? `${heute.slice(0, 7)}-01`;

  return (
    <div className="mt-8 grid gap-3 lg:grid-cols-2">
      <Grafikflaeche
        titel="Umsatz der letzten 12 Monate"
        unterzeile="Säulen: Umsatz nach Rechnungsstellung · Punkte: Zahlungseingang"
        breit
        zustand={monate}
      >
        {monate.data ? (
          <Saeulendiagramm
            titel="Umsatz und Zahlungseingang der letzten 12 Monate"
            {...umsatzReihen(monate.data)}
            format={formatEuro}
            achsenformat={euroKurz}
          />
        ) : null}
      </Grafikflaeche>

      <Grafikflaeche
        titel="Umsatz nach Therapeut:in"
        unterzeile="Letzte 6 Monate, nach Rechnungsstellung, der behandelnden Person zugeordnet"
        zustand={
          personenZeigen ? jePerson : { isPending: false, isError: false, refetch: () => null }
        }
      >
        {!personenZeigen && !jePerson.data ? (
          <div>
            <p className="text-ink-muted mb-3 max-w-prose text-sm">
              Umsatz je Person sind Beschäftigtendaten. Jeder Abruf steht im Protokoll.
            </p>
            <Button type="button" variant="secondary" onClick={() => setPersonenZeigen(true)}>
              Umsatz je Person anzeigen
            </Button>
          </div>
        ) : null}
        {jePerson.data ? (
          jePerson.data.length === 0 ? (
            <p className="text-ink-muted text-sm">In diesen Monaten ist nichts abgerechnet.</p>
          ) : (
            <Saeulendiagramm
              titel="Umsatz je Therapeut:in der letzten 6 Monate"
              {...personenReihen(jePerson.data, letzteMonate(heute, 6))}
              gestapelt
              format={formatEuro}
              achsenformat={euroKurz}
            />
          )
        ) : null}
      </Grafikflaeche>

      <Grafikflaeche
        titel="Umsatzstärkste Leistungen"
        unterzeile={`${monatsname(gewaehlt)}, nach Rechnungsstellung`}
        zustand={leistungen}
      >
        {leistungen.data ? (
          leistungen.data.length === 0 ? (
            <p className="text-ink-muted text-sm">In diesem Monat ist nichts abgerechnet.</p>
          ) : (
            <Balkenliste
              titel="Umsatzstärkste Leistungen"
              format={formatEuro}
              zeilen={leistungen.data.map((l) => ({
                schluessel: l.code,
                label: (
                  <>
                    <span className="font-medium">{l.code}</span>{' '}
                    <span className="text-ink-muted">{l.label}</span>
                  </>
                ),
                wert: l.revenue_cents,
              }))}
            />
          )
        ) : null}
      </Grafikflaeche>
    </div>
  );
}

function Grafikflaeche({
  titel,
  unterzeile,
  breit = false,
  zustand,
  children,
}: {
  titel: string;
  unterzeile: string;
  breit?: boolean;
  zustand: { isPending: boolean; isError: boolean; refetch: () => unknown };
  children: ReactNode;
}) {
  const titelId = useId();
  return (
    <section aria-labelledby={titelId} className={breit ? 'lg:col-span-2' : ''}>
      <Inhaltsflaeche className="h-full">
        <h2 id={titelId} className="text-ink text-liste font-semibold">
          {titel}
        </h2>
        <p className="text-ink-muted mb-3 text-sm">{unterzeile}</p>
        {zustand.isPending ? <LoadingState label="Wird geladen …" /> : null}
        {zustand.isError ? (
          <ErrorState
            title={`${titel}: konnte nicht geladen werden.`}
            onErneut={() => zustand.refetch()}
          />
        ) : null}
        {children}
      </Inhaltsflaeche>
    </section>
  );
}

/**
 * Der eigene Umsatz einer Person mit Umsatzbeteiligung (STA-006, ANN-156).
 * Der Server liefert ausschließlich ihre Zeilen.
 */
function MeinUmsatz({ zeitzone }: { zeitzone: string }) {
  const jePerson = useQuery({
    queryKey: [...JE_PERSON_KEY, 12],
    queryFn: () => fetchUmsatzJePerson(12),
    retry: false,
  });
  // Der Monat in der Zeitzone der Praxis, wie der Server rechnet.
  const monate = letzteMonate(todayInTimeZone(zeitzone), 12);
  const daten = jePerson.data ? personenReihen(jePerson.data, monate) : null;
  const summe = (jePerson.data ?? [])
    .filter((z) => z.month === monate.at(-1))
    .reduce((s, z) => s + z.revenue_cents, 0);

  return (
    <>
      <PageHeader
        title="Statistiken"
        description="Dein Umsatz der letzten 12 Monate nach Rechnungsstellung – die Grundlage deiner Umsatzbeteiligung. Nur du und die Praxisleitung sehen ihn."
      />
      <Grafikflaeche
        titel="Mein Umsatz"
        unterzeile={`Laufender Monat: ${formatEuro(summe)}`}
        zustand={jePerson}
      >
        {daten ? (
          jePerson.data!.length === 0 ? (
            <p className="text-ink-muted text-sm">In diesen Monaten ist nichts abgerechnet.</p>
          ) : (
            <Saeulendiagramm
              titel="Mein Umsatz der letzten 12 Monate"
              kategorien={daten.kategorien}
              reihen={daten.reihen.map((r) => ({ ...r, name: 'Umsatz' }))}
              format={formatEuro}
              achsenformat={euroKurz}
            />
          )
        ) : null}
      </Grafikflaeche>
    </>
  );
}
