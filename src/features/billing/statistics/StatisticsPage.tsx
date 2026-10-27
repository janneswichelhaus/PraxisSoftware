import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/ui/PageHeader';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Field } from '@/components/ui/Field';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { Disclosure, Inhaltsflaeche } from '@/components/ui/Card';
import { DetailList, DetailRow } from '@/components/ui/DetailList';
import { ErrorState } from '@/components/ui/Feedback';
import { Kleingedrucktes } from '@/components/ui/Kleingedrucktes';
import { Section } from '@/components/ui/Section';
import { Zwischentitel } from '@/components/ui/Zwischentitel';
import { formatEuro } from '@/lib/geld';
import { sichereAlsDatei } from '@/features/privacy/datenschutz/datei';
import { isOwner, type CurrentUser } from '@/features/core/session/types';
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
import { todayInTimeZone } from '@/lib/datum';

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
        description="Fünf Zahlen mit Ziel und nächstem Schritt."
        actions={
          k && ziele.data ? (
            <Button variant="secondary" onClick={() => sichereCsv(k, ziele.data)} type="button">
              Als CSV speichern
            </Button>
          ) : null
        }
      />

      {/* Laden, Fehler und veralteter Stand über den Baustein (DESIGN.md
          Regel 8, R2-neu4). Scheitert ein anderer Monat, führt ein Knopf
          zurück zum laufenden - die Auswahl steht dann nicht da. */}
      <Abfragezustand
        abfrage={kennzahlen}
        laden="Die Statistik wird geladen …"
        fehler="Die Statistik konnte nicht geladen werden."
        inKarte
      >
        {(daten) => (
          <>
            <div className="mb-6 sm:w-64">
              <Select
                label="Monat für Umsatz und Zahlungseingang"
                value={monat ?? daten.month}
                onChange={(e) => setMonat(e.target.value)}
              >
                {monatsauswahl(daten.today).map((wert) => (
                  <option key={wert} value={wert}>
                    {monatsname(wert)}
                  </option>
                ))}
              </Select>
            </div>

            {ziele.isError ? (
              <div className="mb-6">
                <ErrorState
                  title="Die Zielwerte konnten nicht geladen werden."
                  description="Die Zahlen stehen trotzdem da; der Vergleich mit dem Ziel fehlt."
                  onErneut={() => ziele.refetch()}
                />
              </div>
            ) : null}

            <Kennzahlliste k={daten} ziele={ziele.data} zieleGeladen={ziele.isSuccess} />

            <Verlauf monat={monat} heute={daten.today} />

            {/* Die Fußnote erklärt die Rechnung, nicht die Zahlen - zugeklappt (UX-005i). */}
            <div className="mt-8 max-w-prose">
              <Disclosure summary="Hinweise zur Berechnung">
                <p className="text-ink-muted text-sm">
                  Umsatz und Zahlungseingang sind zwei Grundlagen und werden nie verrechnet. Die
                  übrigen Zahlen gelten zum Stand {tagText(daten.today)}. Kein steuerlicher
                  Abschluss – die Aufteilung nach Steuerkennzeichen steht unter Abrechnung →
                  Auswertung.
                </p>
              </Disclosure>
            </div>
          </>
        )}
      </Abfragezustand>
      {kennzahlen.isError && monat !== null ? (
        <Button variant="quiet" type="button" onClick={() => setMonat(null)}>
          Zum laufenden Monat
        </Button>
      ) : null}
    </>
  );
}

function sichereCsv(k: Kennzahlen, ziele: Ziele) {
  // Ein BOM vorne, damit eine Tabellenkalkulation die Umlaute als UTF-8 liest.
  sichereAlsDatei(csvDateiname(k), `\uFEFF${alsCsv(k, ziele)}`, 'text/csv;charset=utf-8');
}

/**
 * Die fünf Kennzahlen als beschriftete Liste in **einer** Karte (ANN-494,
 * R2-O8): Name links (am Telefon darüber), daneben Wert, Zielstand,
 * Einzelheiten, Ziel und der nächste Schritt; Linien trennen die Kennzahlen
 * (DESIGN.md Regel 2). Fünf sind mehr als die vier Kacheln, die eine Seite
 * trägt (Prüfliste 5) - bis dahin standen fünf gleich gerahmte Kästen
 * untereinander.
 */
function Kennzahlliste({
  k,
  ziele,
  zieleGeladen,
}: {
  k: Kennzahlen;
  ziele: Ziele | undefined;
  zieleGeladen: boolean;
}) {
  return (
    <Section titel="Kennzahlen" rahmen>
      <DetailList>
        {KENNZAHLEN.map((kennzahl) => {
          const ziel = ziele?.[kennzahl.ziel] ?? null;
          return (
            <DetailRow key={kennzahl.ziel} label={kennzahl.titel}>
              <Kennzahlangabe kennzahl={kennzahl} k={k} ziel={ziel} zieleGeladen={zieleGeladen}>
                <Einzelheiten kennzahl={kennzahl} k={k} ziel={ziel} />
              </Kennzahlangabe>
            </DetailRow>
          );
        })}
      </DetailList>
    </Section>
  );
}

function Kennzahlangabe({
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
  const stand = zielstand(kennzahl.wert(k), ziel, kennzahl.richtung);

  // Eine Gruppe je Kennzahl, damit Vorlesesoftware sie als Bereich anspringt.
  return (
    <section aria-label={kennzahl.titel} className="flex flex-col gap-2 whitespace-normal">
      {/* Der Zielstand als Zeichen und Wort neben dem Wert (DESIGN.md
          Regel 5); ohne Ziel kein Abzeichen. */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <p className="text-ink text-2xl font-semibold tabular-nums">
          {formatiere(kennzahl.wert(k), kennzahl.einheit)}
        </p>
        {stand === 'erreicht' ? (
          <Badge ton="positiv">Ziel erreicht</Badge>
        ) : stand === 'verfehlt' ? (
          <Badge ton="warnung">Ziel verfehlt</Badge>
        ) : null}
      </div>

      <div className="text-ink-muted text-sm">{children}</div>

      {zieleGeladen ? <Zielzeile kennzahl={kennzahl} ziel={ziel} /> : null}

      <div className="pt-1">
        <ButtonLink to={kennzahl.handlung.to} variant="secondary" groesse="kompakt">
          {kennzahl.handlung.label}
        </ButtonLink>
      </div>
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
        >
          <Abfragezustand
            abfrage={monate}
            laden="Wird geladen …"
            fehler="Umsatz der letzten 12 Monate: konnte nicht geladen werden."
          >
            {(daten) => (
              <Saeulendiagramm
                titel="Umsatz und Zahlungseingang der letzten 12 Monate"
                {...umsatzReihen(daten)}
                format={formatEuro}
                achsenformat={euroKurz}
              />
            )}
          </Abfragezustand>
        </Grafikflaeche>

        <Grafikflaeche
          titel="Umsatz nach Therapeut:in"
          unterzeile="Letzte 6 Monate, nach Rechnungsstellung, der behandelnden Person zugeordnet"
        >
          {personenZeigen || jePerson.data ? (
            <Abfragezustand
              abfrage={jePerson}
              laden="Wird geladen …"
              fehler="Umsatz nach Therapeut:in: konnte nicht geladen werden."
              leer={{
                wenn: (daten) => daten.length === 0,
                titel: 'In diesen Monaten ist nichts abgerechnet.',
              }}
            >
              {(daten) => (
                <Saeulendiagramm
                  titel="Umsatz je Therapeut:in der letzten 6 Monate"
                  {...personenReihen(daten, letzteMonate(heute, 6))}
                  gestapelt
                  format={formatEuro}
                  achsenformat={euroKurz}
                />
              )}
            </Abfragezustand>
          ) : (
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
          )}
        </Grafikflaeche>

        <Grafikflaeche
          titel="Umsatzstärkste Leistungen"
          unterzeile={`${monatsname(gewaehlt)}, nach Rechnungsstellung`}
        >
          <Abfragezustand
            abfrage={leistungen}
            laden="Wird geladen …"
            fehler="Umsatzstärkste Leistungen: konnte nicht geladen werden."
            leer={{
              wenn: (daten) => daten.length === 0,
              titel: 'In diesem Monat ist nichts abgerechnet.',
            }}
          >
            {(daten) => (
              <Balkenliste
                titel="Umsatzstärkste Leistungen"
                format={formatEuro}
                zeilen={daten.map((l) => ({
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
            )}
          </Abfragezustand>
        </Grafikflaeche>
      </div>
    </Section>
  );
}

/** Die Fläche einer Grafik: Titel, eine Zeile darunter, der Inhalt. */
function Grafikflaeche({
  titel,
  unterzeile,
  breit = false,
  children,
}: {
  titel: string;
  unterzeile: string;
  breit?: boolean;
  children: ReactNode;
}) {
  const titelId = useId();
  return (
    <section aria-labelledby={titelId} className={breit ? 'lg:col-span-2' : ''}>
      <Inhaltsflaeche className="h-full">
        <Zwischentitel id={titelId}>{titel}</Zwischentitel>
        <p className="text-ink-muted -mt-2 mb-3 text-sm">{unterzeile}</p>
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
  const summe = (jePerson.data ?? [])
    .filter((z) => z.month === monate.at(-1))
    .reduce((s, z) => s + z.revenue_cents, 0);

  return (
    <>
      <PageHeader
        title="Statistiken"
        description="Dein Umsatz der letzten 12 Monate nach Rechnungsstellung."
      />
      <Section titel="Verlauf">
        <Grafikflaeche titel="Mein Umsatz" unterzeile={`Laufender Monat: ${formatEuro(summe)}`}>
          <Abfragezustand
            abfrage={jePerson}
            laden="Wird geladen …"
            fehler="Mein Umsatz: konnte nicht geladen werden."
            leer={{
              wenn: (zeilen) => zeilen.length === 0,
              titel: 'In diesen Monaten ist nichts abgerechnet.',
            }}
          >
            {(zeilen) => {
              const daten = personenReihen(zeilen, monate);
              return (
                <Saeulendiagramm
                  titel="Mein Umsatz der letzten 12 Monate"
                  kategorien={daten.kategorien}
                  reihen={daten.reihen.map((r) => ({ ...r, name: 'Umsatz' }))}
                  format={formatEuro}
                  achsenformat={euroKurz}
                />
              );
            }}
          </Abfragezustand>
          {/* Wofür die Zahl gilt und wer sie sieht (ANN-156): ein Satz mit
              Datenschutzfunktion, klein unter der Grafik statt im Kopf. */}
          <Kleingedrucktes className="mt-3">
            Die Grundlage deiner Umsatzbeteiligung. Nur du und die Praxisleitung sehen ihn.
          </Kleingedrucktes>
        </Grafikflaeche>
      </Section>
    </>
  );
}
