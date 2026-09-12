import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/ui/PageHeader';
import { Section } from '@/components/ui/Section';
import { Badge } from '@/components/ui/Badge';
import { Card, CardGrid, DataList, DataRow, Disclosure } from '@/components/ui/Card';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/Feedback';
import { ANKER_TEXTE, DATENKLASSEN, GRUNDLAGE_TEXTE, LOESCHWEG_TEXTE, fristText } from './klassen';
import {
  fetchDeletionRuns,
  fetchLegalHolds,
  fetchRetentionSchedule,
  formatZeitpunkt,
  type Datenklasse,
} from './api';

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
                {klasse.legal_reference ?? GRUNDLAGE_TEXTE[klasse.basis] ?? klasse.basis}
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

export function AufbewahrungPage() {
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
        titel="Löschjournal"
        hinweis="Der Nachweis der ausgeführten Löschungen. Er überlebt eine Wiederherstellung und wird danach erneut angewendet."
        rahmen
      >
        <Loeschjournal />
      </Section>
    </>
  );
}
