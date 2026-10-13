import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/ui/PageHeader';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Field } from '@/components/ui/Field';
import { CardGrid, Disclosure, Inhaltsflaeche } from '@/components/ui/Card';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Kleingedrucktes } from '@/components/ui/Kleingedrucktes';
import { Section } from '@/components/ui/Section';
import { Zwischentitel } from '@/components/ui/Zwischentitel';
import { VERBINDUNG_PRUEFEN } from '@/components/ui/abfrageTexte';
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
        description="Fünf Zahlen für die Praxisführung, jede mit Ziel und nächstem Schritt."
        actions={
          k && ziele.data ? (
            <Button variant="secondary" onClick={() => sichereCsv(k, ziele.data)} type="button">
              Als CSV speichern
            </Button>
          ) : null
        }
      />

      {kennzahlen.isPending ? (
        <LoadingState label="Die Statistik wird geladen …" inKarte kacheln={4} />
      ) : null}
      {kennzahlen.isError ? (
        <>
          <ErrorState
            title="Die Statistik konnte nicht geladen werden."
            description={VERBINDUNG_PRUEFEN}
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

          <Section titel="Kennzahlen">
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
          </Section>

          <Verlauf monat={monat} heute={k.today} />

          {/* Die Fußnote erklärt die Rechnung, nicht die Zahlen - zugeklappt (UX-005i). */}
          <div className="mt-8 max-w-prose">
            <Disclosure summary="Hinweise zur Berechnung">
              <p className="text-ink-muted text-sm">
                Umsatz und Zahlungseingang sind zwei Grundlagen und werden nie verrechnet. Die
                übrigen Zahlen gelten zum Stand {tagText(k.today)}. Kein steuerlicher Abschluss –
                die Aufteilung nach Steuerkennzeichen steht unter Abrechnung → Auswertung.
              </p>
            </Disclosure>
          </div>
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
        {/* Der Zielstand als Zeichen und Wort neben dem Titel (DESIGN.md
            Regel 5); ohne Ziel kein Abzeichen. */}
        <Zwischentitel
          id={titelId}
          aktion={
            stand === 'erreicht' ? (
              <Badge ton="positiv">Ziel erreicht</Badge>
            ) : stand === 'verfehlt' ? (
              <Badge ton="warnung">Ziel verfehlt</Badge>
            ) : undefined
          }
        >
          {kennzahl.titel}
        </Zwischentitel>

        <p className="text-ink -mt-3 text-2xl font-semibold tabular-nums">
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
          <p className="text-ink mt-1">
            Zahlungseingang {formatEuro(k.payments_cents)} · {monatsname(k.previous_month)}:{' '}
            {formatEuro(k.payments_previous_cents)}
          </p>
          <Aufschluesselung>
            <Balkenliste
              titel="Umsatz nach Bereich"
              format={formatEuro}
              zeilen={[
                { schluessel: 'therapy', label: 'Behandlung', wert: k.revenue_therapy_cents },
                { schluessel: 'training', label: 'Training', wert: k.revenue_training_cents },
              ]}
            />
          </Aufschluesselung>
        </>
      );
    case 'open_items_cents':
      return (
        <>
          <p>
            {k.open_count} {k.open_count === 1 ? 'Rechnung' : 'Rechnungen'} offen, Stand{' '}
            {tagText(k.today)}
          </p>
          <Aufschluesselung>
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
          </Aufschluesselung>
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
          <Aufschluesselung>
            <Balkenliste
              titel="Ausfälle im Vergleich"
              format={(wert) => String(wert)}
              zeilen={[
                { schluessel: 'jetzt', label: 'letzte vier Wochen', wert: ausfaelle(k) },
                { schluessel: 'davor', label: 'vier Wochen davor', wert: k.absences_previous },
              ]}
            />
            <p className="mt-2">
              Ausfallhonorare davor: {formatEuro(k.absence_fee_previous_cents)}
            </p>
          </Aufschluesselung>
        </>
      );
  }
}

/**
 * Die Aufschlüsselung einer Kennzahl als Balken - am Telefon auf Abruf, ab
 * 1024 px offen (Design-Rollout B6): Die Karte zeigt die Zahl und den
 * nächsten Schritt; wie sie sich zusammensetzt, steht einen Tipp tiefer.
 */
function Aufschluesselung({ children }: { children: ReactNode }) {
  return (
    <Disclosure summary="Aufschlüsselung" offenAb="lg">
      {children}
    </Disclosure>
  );
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

  // Das Ziel steht selten zur Änderung an - der Aufklapper zeigt es und
  // öffnet das Feld auf Abruf (DESIGN.md „Disclosure“).
  return (
    <Disclosure
      summary={
        <>
          <span className="text-ink">
            Ziel:{' '}
            {ziel === null ? 'nicht gesetzt' : `${richtung} ${formatiere(ziel, kennzahl.einheit)}`}
          </span>
          <span className="text-accent ml-auto text-sm font-semibold">Ändern</span>
        </>
      }
    >
      <form onSubmit={absenden} className="flex flex-col gap-2" noValidate>
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
    </Disclosure>
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
    <Section titel="Verlauf">
      <div className="grid gap-3 lg:grid-cols-2">
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
              <Button
                type="button"
                variant="secondary"
                groesse="kompakt"
                onClick={() => setPersonenZeigen(true)}
              >
                Umsatz je Person anzeigen
              </Button>
              {/* Wer die Zahl sieht, und dass sie Beschäftigtendaten ist
                (ANN-156): ein Satz mit Datenschutzfunktion, deshalb klein
                und an der Stelle, an der sie geladen wird. */}
              <Kleingedrucktes className="mt-2">
                Umsatz je Person sind Beschäftigtendaten. Ihn sehen nur du und die Person selbst bei
                Umsatzbeteiligung.
              </Kleingedrucktes>
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
    </Section>
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
        <Zwischentitel id={titelId}>{titel}</Zwischentitel>
        <p className="text-ink-muted -mt-2 mb-3 text-sm">{unterzeile}</p>
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
      <Section titel="Verlauf">
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
      </Section>
    </>
  );
}
