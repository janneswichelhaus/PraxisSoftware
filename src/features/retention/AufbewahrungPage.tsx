import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Section } from '@/components/ui/Section';
import { Badge } from '@/components/ui/Badge';
import { Card, CardGrid, DataList, DataRow, Disclosure } from '@/components/ui/Card';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/Feedback';
import { paragraf } from '@/lib/begriffe';
import { ANKER_TEXTE, DATENKLASSEN, GRUNDLAGE_TEXTE, LOESCHWEG_TEXTE, fristText } from './klassen';
import {
  fetchDeletionRuns,
  fetchLegalHolds,
  fetchRetentionSchedule,
  formatZeitpunkt,
  type Datenklasse,
} from './api';
import { Link } from 'react-router-dom';
import {
  useDateiabgleich,
  useLoeschauftraege,
  useLoeschauftraegeAusfuehren,
  useVerwaisteVormerken,
} from '@/features/files/dateien';
import type { CurrentUser } from '@/features/session/types';

/**
 * Aufbewahrung und Löschung (LOE-002b).
 *
 * Die Seite beantwortet drei Fragen, die vor dem Produktivstart schriftlich
 * beantwortet sein müssen (ADR-007, Löschkonzept im DSFA-Paket): Was wird wie
 * lange aufbewahrt? Was ist gerade von der Löschung ausgenommen? Und was wurde
 * tatsächlich gelöscht?
 *
 * Sie ist eine reine Lesesicht. Eine Frist ändert sich über eine Migration,
 * nicht über einen Klick — nur so bleibt die Änderung nachvollziehbar
 * (ADR-008, ADR-013). Sichtbar ist sie nur für `owner`; die Rollenprüfung
 * steuert hier die Darstellung, verbindlich sind die Serverfunktionen
 * (ADR-004).
 */

function klasseTexte(key: string) {
  return DATENKLASSEN[key] ?? { label: key, beschreibung: '' };
}

function Aufbewahrungsplan() {
  const { data, isPending, isError } = useQuery({
    queryKey: ['retention', 'schedule'],
    queryFn: fetchRetentionSchedule,
  });

  if (isPending) return <LoadingState label="Aufbewahrungsplan wird geladen …" />;
  if (isError) return <ErrorState title="Der Aufbewahrungsplan konnte nicht geladen werden." />;

  return (
    <CardGrid>
      {data.map((klasse: Datenklasse) => {
        const texte = klasseTexte(klasse.key);
        const ohneFrist = klasse.retention_interval === null;

        return (
          <Card key={klasse.key}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-ink text-base font-semibold">{texte.label}</h3>
              {klasse.assumption_key ? <Badge ton="warnung">{klasse.assumption_key}</Badge> : null}
            </div>
            <p className="text-ink-muted mt-1 text-sm">{texte.beschreibung}</p>

            <DataList>
              <DataRow label="Frist">
                {ohneFrist ? 'Keine automatische Löschung' : fristText(klasse.retention_interval)}
              </DataRow>
              <DataRow label="Gerechnet">{ANKER_TEXTE[klasse.anchor] ?? klasse.anchor}</DataRow>
              <DataRow label="Grundlage">
                {paragraf(klasse.legal_reference) || GRUNDLAGE_TEXTE[klasse.basis] || klasse.basis}
              </DataRow>
            </DataList>

            {/* Für die Datenschutzprüfung: welche Tabellen diese Klasse trägt.
                Tabellennamen sind technische Bezeichner und stehen deshalb
                unübersetzt — übersetzt wäre die Zuordnung nicht mehr
                nachprüfbar. */}
            <Disclosure summary={`Betroffene Tabellen (${klasse.tabellen.length})`}>
              <ul className="text-ink-muted space-y-1 text-sm">
                {klasse.tabellen.map((tabelle) => (
                  <li key={tabelle.name}>
                    <code className="text-ink text-[0.8125rem]">{tabelle.name}</code>
                    {' — '}
                    {LOESCHWEG_TEXTE[tabelle.modus] ?? tabelle.modus}
                  </li>
                ))}
              </ul>
            </Disclosure>
          </Card>
        );
      })}
    </CardGrid>
  );
}

function Loeschsperren() {
  const { data, isPending, isError } = useQuery({
    queryKey: ['retention', 'legal-holds'],
    queryFn: fetchLegalHolds,
  });

  if (isPending) return <LoadingState label="Löschsperren werden geladen …" />;
  if (isError) return <ErrorState title="Die Löschsperren konnten nicht geladen werden." />;

  if (data.length === 0) {
    return (
      <EmptyState
        title="Keine laufende Löschsperre"
        description="Eine Sperre hält eine Akte von der automatischen Löschung zurück, solange ein rechtlicher Vorgang läuft."
      />
    );
  }

  return (
    <CardGrid>
      {data.map((sperre) => (
        <Card key={sperre.id}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-ink text-base font-semibold">{sperre.subject_name ?? 'Akte'}</h3>
            <Badge ton="warnung">Gesperrt</Badge>
          </div>
          <p className="text-ink-muted mt-1 text-sm">{sperre.reason}</p>
          <DataList>
            <DataRow label="Seit">{formatZeitpunkt(sperre.placed_at)}</DataRow>
            <DataRow label="Gesetzt von">{sperre.placed_by_name ?? 'Unbekannt'}</DataRow>
          </DataList>
        </Card>
      ))}
    </CardGrid>
  );
}

function Loeschjournal() {
  const { data, isPending, isError } = useQuery({
    queryKey: ['retention', 'runs'],
    queryFn: fetchDeletionRuns,
  });

  if (isPending) return <LoadingState label="Löschjournal wird geladen …" />;
  if (isError) return <ErrorState title="Das Löschjournal konnte nicht geladen werden." />;

  if (data.length === 0) {
    return (
      <EmptyState
        title="Es wurde noch nichts gelöscht"
        description="Sobald eine Frist abläuft, hält der tägliche Löschlauf hier fest, was er gelöscht hat."
      />
    );
  }

  return (
    <ul className="divide-line divide-y">
      {data.map((lauf) => (
        <li
          key={`${lauf.run_id}-${lauf.retention_class}-${lauf.target_table}`}
          className="py-3 sm:grid sm:grid-cols-[11rem_1fr_6rem] sm:items-baseline sm:gap-4 sm:py-2.5"
        >
          <span className="text-ink-muted block text-sm tabular-nums">
            {formatZeitpunkt(lauf.deleted_at)}
          </span>
          <span className="text-ink mt-0.5 block text-[0.9375rem] sm:mt-0">
            {klasseTexte(lauf.retention_class).label}
            <span className="text-ink-subtle">
              {' · '}
              <code className="text-[0.8125rem]">{lauf.target_table}</code>
            </span>
          </span>
          <span className="text-ink-muted mt-0.5 block text-sm tabular-nums sm:mt-0 sm:text-right">
            {lauf.record_count} {lauf.record_count === 1 ? 'Datensatz' : 'Datensätze'}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Offene Löschaufträge für den Objektspeicher (DAT-002, ADR-017 Punkt 25).
 *
 * Der Gegenpol zum Löschjournal: Dort steht, welche Zeile weg ist, hier,
 * welches Objekt noch nicht. Ein Auftrag entsteht automatisch, sobald eine
 * Dateizeile fällt — durch den Löschlauf, durch eine gelöschte Verordnung
 * oder von Hand. Ausführen kann ihn nur ein angemeldeter Vorgang, weil eine
 * Datenbankfunktion kein Objekt löschen kann und eine Edge Function für
 * produktive Gesundheitsdaten nicht freigegeben ist (ADR-015 Punkt 20).
 *
 * **Die Quittung wird verdient, nicht behauptet.** Der Server prüft nach dem
 * Entfernen selbst, dass das Objekt weg ist; sonst bleibt der Auftrag offen.
 * Deshalb kann hier nichts als „erledigt" dastehen, was es nicht ist.
 */
function Loeschauftraege({ user }: { user: CurrentUser }) {
  const { auftraege, isPending, isError, verborgen } = useLoeschauftraege(user);
  const ausfuehren = useLoeschauftraegeAusfuehren();

  if (verborgen) return null;
  if (isPending) return <LoadingState label="Löschaufträge werden geladen …" />;
  if (isError)
    return <ErrorState title="Die offenen Löschaufträge konnten nicht geladen werden." />;

  if (auftraege.length === 0) {
    return (
      <EmptyState
        title="Nichts offen"
        description="Zu jeder gelöschten Datei ist auch die abgelegte Fassung entfernt und quittiert."
      />
    );
  }

  const ergebnis = ausfuehren.data;

  return (
    <>
      <Statusmeldung ton="warnung">
        {auftraege.length === 1
          ? 'Eine Datei ist aus der Akte entfernt, liegt aber noch in der Ablage.'
          : `${auftraege.length} Dateien sind aus der Akte entfernt, liegen aber noch in der Ablage.`}{' '}
        Erst das Ausführen schließt die Löschung ab.
      </Statusmeldung>

      <ul className="mt-3">
        {auftraege.map((auftrag) => (
          <li key={auftrag.id} className="border-line border-t py-2.5 first:border-t-0">
            <span className="text-ink text-[0.9375rem]">
              Ablage „{auftrag.bucket_id}“
              <span className="text-ink-muted mt-0.5 block text-sm">
                Beauftragt {formatZeitpunkt(auftrag.ordered_at)} ·{' '}
                {auftrag.object_present
                  ? 'Datei liegt noch in der Ablage'
                  : 'Datei ist bereits weg, nur die Quittung fehlt'}
              </span>
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button
          type="button"
          disabled={ausfuehren.isPending}
          onClick={() => ausfuehren.mutate(auftraege)}
        >
          {ausfuehren.isPending
            ? 'Wird ausgeführt …'
            : `Alle ${auftraege.length} ausführen und quittieren`}
        </Button>
      </div>

      {ergebnis && ergebnis.fehler.length > 0 ? (
        <Statusmeldung ton="fehler" className="mt-2">
          {ergebnis.erledigt} erledigt, {ergebnis.fehler.length} offen geblieben:{' '}
          {ergebnis.fehler[0]}
        </Statusmeldung>
      ) : null}
      {ergebnis && ergebnis.fehler.length === 0 && ergebnis.erledigt > 0 ? (
        <Statusmeldung className="mt-2">
          {ergebnis.erledigt} Löschung{ergebnis.erledigt === 1 ? '' : 'en'} abgeschlossen und
          quittiert.
        </Statusmeldung>
      ) : null}
      {ausfuehren.isError ? (
        <Statusmeldung ton="fehler" className="mt-2">
          {ausfuehren.error.message}
        </Statusmeldung>
      ) : null}
    </>
  );
}

/**
 * Abgleich zwischen Datenbank und Ablage (DAT-003, ADR-017 Punkt 27).
 *
 * Zwei Zustände, die es nicht geben darf, und beide sind hier keine Statistik,
 * sondern eine Arbeitsaufgabe:
 *
 *   * **Eine Datei ohne Objekt** ist ein Verlust. Sie steht mit Akte und Namen
 *     da, damit jemand nachsehen kann — eine Zahl allein wäre unbrauchbar.
 *     An der einzelnen Datei meldet die Akte denselben Befund (§13).
 *   * **Ein Objekt ohne Datei** ist Abfall. Es wird über denselben Löschweg
 *     entfernt wie alles andere, mit Auftrag und Quittung — nicht über eine
 *     zweite, stille Abkürzung.
 *
 * Der Abgleich läuft nicht von allein: Er wird gerechnet, wenn diese Seite
 * geöffnet wird. Die Anwendung verschickt nichts (CAL-013), und einen
 * Meldeweg zu bauen wäre ein eigener Auftrag. Deshalb gehört der Blick hierher
 * in den monatlichen Bericht (ADR-010 Punkt 6).
 */
function Dateiabgleich({ user }: { user: CurrentUser }) {
  const { fehlende, verwaiste, isPending, isError, verborgen } = useDateiabgleich(user);
  const vormerken = useVerwaisteVormerken();

  if (verborgen) return null;
  if (isPending) return <LoadingState label="Abgleich wird gerechnet …" />;
  if (isError) return <ErrorState title="Der Abgleich konnte nicht gerechnet werden." />;

  if (fehlende.length === 0 && verwaiste === 0) {
    return (
      <EmptyState
        title="Beide Speicher sind deckungsgleich"
        description="Zu jeder Datei in einer Akte liegt genau ein Objekt in der Ablage — und umgekehrt."
      />
    );
  }

  return (
    <>
      {fehlende.length > 0 ? (
        <>
          <Statusmeldung ton="fehler">
            {fehlende.length === 1
              ? 'Zu einer Datei in einer Akte fehlt die abgelegte Fassung.'
              : `Zu ${fehlende.length} Dateien in Akten fehlt die abgelegte Fassung.`}{' '}
            Das ist ein Verlust und kein Aufräumfall — bitte prüfen, ob eine Wiederherstellung nötig
            ist.
          </Statusmeldung>
          <ul className="mt-3">
            {fehlende.map((datei) => (
              <li key={datei.file_id} className="border-line border-t py-2.5 first:border-t-0">
                <span className="text-ink text-[0.9375rem]">
                  {datei.display_name}
                  <span className="text-ink-muted mt-0.5 block text-sm">
                    {datei.patient_name}
                    {datei.uploaded_at
                      ? ` · hinzugefügt ${formatZeitpunkt(datei.uploaded_at)}`
                      : ''}
                  </span>
                </span>
                <Link
                  to={`/patienten/${datei.patient_id}/dateien`}
                  className="text-accent inline-flex min-h-11 items-center text-sm hover:underline"
                >
                  Akte öffnen
                </Link>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {verwaiste > 0 ? (
        <div className={fehlende.length > 0 ? 'mt-6' : ''}>
          <Statusmeldung ton="warnung">
            {verwaiste === 1
              ? 'Ein Objekt in der Ablage gehört zu keiner Datei mehr.'
              : `${verwaiste} Objekte in der Ablage gehören zu keiner Datei mehr.`}{' '}
            Sie sind Abfall und werden über einen gewöhnlichen Löschauftrag entfernt.
          </Statusmeldung>
          <div className="mt-3">
            <Button type="button" disabled={vormerken.isPending} onClick={() => vormerken.mutate()}>
              {vormerken.isPending ? 'Wird vorgemerkt …' : 'Zur Löschung vormerken'}
            </Button>
          </div>
          {vormerken.isSuccess ? (
            <Statusmeldung className="mt-2">
              {vormerken.data} Löschauftr{vormerken.data === 1 ? 'ag' : 'äge'} angelegt — oben unter
              „Offene Löschaufträge" ausführen.
            </Statusmeldung>
          ) : null}
          {vormerken.isError ? (
            <Statusmeldung ton="fehler" className="mt-2">
              {vormerken.error.message}
            </Statusmeldung>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

export function AufbewahrungPage({ user }: { user: CurrentUser }) {
  return (
    <>
      <PageHeader
        title="Aufbewahrung und Löschung"
        description="Was wie lange bleibt, was gerade zurückgehalten wird und was gelöscht wurde. Fristen ändern sich über eine Migration, nicht hier."
      />

      <Section
        titel="Aufbewahrungsplan"
        hinweis="Eine Zeile je Datenklasse. Ein Kürzel ANN-NNN bedeutet: Die Frist ist eine begründete Annahme und wartet auf die Datenschutzprüfung."
        rahmen
      >
        <Aufbewahrungsplan />
      </Section>

      <Section
        titel="Löschsperren"
        hinweis="Eine gesperrte Akte wird nicht gelöscht, bleibt aber vollständig benutzbar."
        rahmen
      >
        <Loeschsperren />
      </Section>

      <Section
        titel="Offene Löschaufträge"
        hinweis="Dateien, die aus einer Akte entfernt sind, deren abgelegte Fassung aber noch existiert. Die Löschung ist erst mit der Quittung abgeschlossen (ADR-017)."
        rahmen
      >
        <Loeschauftraege user={user} />
      </Section>

      <Section
        titel="Abgleich der Dateiablage"
        hinweis="Datenbank und Objektspeicher können auseinanderlaufen. Hier steht, ob sie es tun — gerechnet beim Öffnen dieser Seite, nicht laufend überwacht."
        rahmen
      >
        <Dateiabgleich user={user} />
      </Section>

      <Section
        titel="Löschjournal"
        hinweis="Der Nachweis der ausgeführten Löschungen. Er überlebt eine Wiederherstellung und wird danach erneut angewendet."
        rahmen
      >
        <Loeschjournal />
      </Section>
    </>
  );
}
