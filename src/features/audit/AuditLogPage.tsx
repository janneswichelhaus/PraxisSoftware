import { useEffect, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { Badge } from '@/components/ui/Badge';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Disclosure } from '@/components/ui/Card';
import { Datenliste, type Datenspalte } from '@/components/ui/Datenliste';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Filterleiste } from '@/components/ui/Filterleiste';
import { VERBINDUNG_PRUEFEN } from '@/components/ui/abfrageTexte';
import { Field } from '@/components/ui/Field';
import { Select } from '@/components/ui/Select';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Listenfehler, NachladeHinweis } from '@/components/ui/Rueckmeldung';
import {
  AUDIT_ACTION_GROUPS,
  auditActionLabels,
  auditOperationLabels,
  auditOutcomeLabels,
  auditSubjectLabels,
} from './actions';
import {
  fetchAuditEvents,
  fetchOrganizationMembers,
  formatTimestamp,
  shortReference,
  type AuditEvent,
} from './api';
import { Kleingedrucktes } from '@/components/ui/Kleingedrucktes';

const PAGE_SIZE = 25;

function label(map: Record<string, string>, key: string): string {
  return map[key] ?? key;
}

/**
 * Anzeigename des Akteurs. Systemereignisse haben keinen Account (ANN-009).
 * Ein Plattformkonto hat kein Profil und damit keinen Namen in der Praxis;
 * es steht unterscheidbar als solches da (ADR-023 Punkt 14, POR-002), eine
 * Vertretung ebenso (POR-006).
 */
function akteur(event: AuditEvent): string {
  if (event.actor_kind === 'system') return 'System';
  if (event.actor_kind === 'platform') return 'Plattformkonto';
  // POR-006: Wer für eine Person handelt, steht unterscheidbar da (Punkt 14).
  if (event.actor_kind === 'representative') return 'Vertretung (Plattform)';
  return event.actor_display_name ?? 'Unbekannt';
}

/**
 * Die Spalten des Protokolls als `Datenliste` (Welle B, B7; DESIGN.md
 * „Tabellen“).
 *
 * **Spalten erst ab 1024 px (ORG-12).** Darunter steht jeder Eintrag als
 * Zeile: oben links der Zeitpunkt, oben rechts das Ergebnis, darunter Person
 * und Vorgang - drei Zeilen statt vier. Die Vorgangsspalte darf schmaler
 * werden als ihr längstes Wort.
 *
 * **Spaltenköpfe für Vorlesesoftware (UIK-24).** Jede Angabe trägt ihre
 * Bezeichnung, sichtbar nur für Vorlesesoftware; die `Datenliste` setzt sie
 * vor jeden Wert außer dem Kopf, der Zeitpunkt bringt sie selbst mit.
 *
 * Nur Darstellung: Gelesen wird unverändert über `list_audit_events`
 * (ADR-010), und was eine Zeile zeigt, bleibt Metadatum.
 */
const SPALTEN: readonly Datenspalte<AuditEvent>[] = [
  {
    titel: 'Zeitpunkt',
    breite: '10rem',
    telefon: 'kopf',
    inhalt: (event) => (
      <span className="text-ink-muted tabular-nums">
        <span className="sr-only">Zeitpunkt: </span>
        {formatTimestamp(event.occurred_at)}
      </span>
    ),
  },
  {
    titel: 'Person',
    breite: '12rem',
    inhalt: (event) => <span className="text-liste block truncate">{akteur(event)}</span>,
  },
  {
    titel: 'Vorgang',
    inhalt: (event) => (
      <span className="text-liste block min-w-0 wrap-anywhere">
        {label(auditActionLabels, event.action)}
        {event.denied_operation ? (
          <span className="text-ink-muted">
            {': '}
            {label(auditOperationLabels, event.denied_operation)}
            {(event.denied_count ?? 1) > 1 ? ` · ${event.denied_count}×` : ''}
          </span>
        ) : null}
        <span className="text-ink-muted">
          {' · '}
          {label(auditSubjectLabels, event.subject_type)}{' '}
          <span title={event.subject_id ?? undefined} className="tabular-nums">
            {shortReference(event.subject_id)}
          </span>
        </span>
      </span>
    ),
  },
  {
    titel: 'Ergebnis',
    breite: '7rem',
    telefon: 'ende',
    // BEF-065: Eine Abweisung ist das, wonach man sucht - sie steht als
    // kritisches Abzeichen da, nicht in derselben grauen Zeile wie
    // „Erfolgreich".
    inhalt: (event) =>
      event.outcome === 'denied' ? (
        <Badge ton="kritisch">{label(auditOutcomeLabels, event.outcome)}</Badge>
      ) : (
        <span className="text-ink-muted lg:block lg:text-right">
          {label(auditOutcomeLabels, event.outcome)}
        </span>
      ),
  },
];

/** Uhrzeit für „Stand 14:03" in der Zeitzone des Geräts - der Stand ist ein Augenblick der Seite. */
function standText(zeitpunkt: number): string {
  return new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' }).format(
    new Date(zeitpunkt),
  );
}

/**
 * Die feste Grenze zum Blättern (BEF-065): eine Millisekunde nach dem
 * jüngsten Eintrag der ersten Seite. Gerechnet aus dem, was der Server
 * geliefert hat, nicht aus der Uhr des Geräts - geht die nach, fehlten sonst
 * die jüngsten Einträge.
 */
function grenzeNach(events: readonly AuditEvent[]): string | null {
  const juengster = events[0]?.occurred_at;
  if (!juengster) return null;
  const zeit = Date.parse(juengster);
  return Number.isNaN(zeit) ? null : new Date(zeit + 1).toISOString();
}

/**
 * Das Protokoll (ADR-010 Punkt 13), seit UX-009b für die Praxisleitung im
 * Alltag geschrieben (BEF-065, Entscheidung Jannes 2026-10-09):
 *
 *   * **Filter in der Adresse** (`?von=&bis=&aktion=&seite=&stand=`): Ein
 *     Neuladen oder ein geteilter Link behält sie. Am Telefon stehen sie
 *     zugeklappt unter „Filter", ab 1024 px offen. Die Person steht bewusst
 *     **nicht** in der Adresse: Ihre Kontokennung landete sonst in Verlauf,
 *     Lesezeichen und geteilten Links - ein Protokoll über eine bestimmte
 *     Beschäftigte gehört nicht in die Adresszeile (§20, Zweitreview B5).
 *   * **Aktionen gruppiert** wie im Katalog (ADR-010 Punkt 16).
 *   * **Blättern auf einem festen Stand:** Ab der zweiten Seite liest die
 *     Seite nur Einträge bis zum jüngsten der ersten Seite. Was danach
 *     entsteht, schiebt nichts um; „Neu laden" holt es ausdrücklich. Die
 *     Grenze steht als `stand` in der Adresse, damit auch ein Neuladen auf
 *     Seite 2 sie behält; eine Folgeseite ohne Grenze springt auf Seite 1.
 *     Die Serverfunktion ist dieselbe, nur `p_to` ist dann gesetzt.
 *   * Beim Blättern bleibt die alte Seite stehen, bis die neue da ist.
 *
 * Das Lesen des Protokolls wird nicht protokolliert (ADR-010 Fassung 3).
 */
export function AuditLogPage() {
  const [suche, setSuche] = useSearchParams();
  const from = suche.get('von') ?? '';
  const to = suche.get('bis') ?? '';
  const [actorUserId, setActorUserId] = useState('');
  const action = suche.get('aktion') ?? '';
  const seite = Number.parseInt(suche.get('seite') ?? '1', 10);
  const page = Number.isFinite(seite) && seite > 1 ? seite - 1 : 0;
  // Die Grenze gilt für die Folgeseiten; die erste Seite ist immer der
  // jüngste Stand. Nur ein lesbarer Zeitpunkt zählt.
  const standRoh = suche.get('stand');
  const grenze = standRoh && !Number.isNaN(Date.parse(standRoh)) ? standRoh : null;
  const ohneGrenze = page > 0 && grenze === null;

  // Eine Folgeseite ohne Grenze (alter Link, abgeschnittene Adresse) springt
  // auf Seite 1 - sonst blätterte sie doch auf einem wandernden Stand.
  useEffect(() => {
    if (ohneGrenze) {
      setSuche(
        (alt) => {
          const neu = new URLSearchParams(alt);
          neu.delete('seite');
          return neu;
        },
        { replace: true },
      );
    }
  }, [ohneGrenze, setSuche]);

  const filter = {
    from: from || undefined,
    to: to || undefined,
    actorUserId: actorUserId || undefined,
    action: action || undefined,
    stand: page > 0 ? (grenze ?? undefined) : undefined,
    page: ohneGrenze ? 0 : page,
    pageSize: PAGE_SIZE,
  };

  const { data, isPending, isError, isFetching, isPlaceholderData, dataUpdatedAt, refetch } =
    useQuery({
      queryKey: ['audit-events', filter],
      queryFn: () => fetchAuditEvents(filter),
      enabled: !ohneGrenze,
      retry: false,
      placeholderData: keepPreviousData,
    });

  const members = useQuery({
    queryKey: ['organization-members'],
    queryFn: fetchOrganizationMembers,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const total = data?.totalCount ?? 0;
  const first = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const last = Math.min((page + 1) * PAGE_SIZE, total);
  const hasNext = last < total;
  const aktiveFilter = [from, to, actorUserId, action].filter(Boolean).length;

  function filterZuruecksetzen() {
    setActorUserId('');
    setze({ von: null, bis: null, aktion: null, seite: null, stand: null });
  }

  /** Setzt einen Parameter der Adresse; leer heißt: weg. */
  function setze(werte: Record<string, string | null>) {
    setSuche(
      (alt) => {
        const neu = new URLSearchParams(alt);
        for (const [schluessel, wert] of Object.entries(werte)) {
          if (wert) neu.set(schluessel, wert);
          else neu.delete(schluessel);
        }
        return neu;
      },
      { replace: true },
    );
  }

  /** Ein Filter ändert die Liste: zurück auf Seite 1, neuer Stand. */
  function filtere(schluessel: string) {
    return (wert: string) => {
      setze({ [schluessel]: wert, seite: null, stand: null });
    };
  }

  function filterePerson(wert: string) {
    setActorUserId(wert);
    setze({ seite: null, stand: null });
  }

  function blaettere(ziel: number) {
    if (ziel <= 0) {
      // Seite 1 ist wieder der jüngste Stand; der nächste Schritt setzt eine
      // neue Grenze (Zweitreview B1).
      setze({ seite: null, stand: null });
      return;
    }
    // Die Grenze entsteht beim Schritt weg von Seite 1, aus dem jüngsten
    // Eintrag, den die Seite gerade zeigt; danach bleibt sie.
    const neueGrenze = page === 0 && data ? grenzeNach(data.events) : grenze;
    setze({ seite: String(ziel + 1), stand: neueGrenze });
  }

  function neuLaden() {
    if (page === 0) void refetch();
    setze({ seite: null, stand: null });
  }

  return (
    <>
      {/* Der Titel ist das Wort der Ansicht (ORG-07): Seit ORG-001 steht das
          Protokoll unter Praxis neben Einstellungen und Aufbewahrung; die
          Pillen zeichnet die Hülle (`Ansichtsleiste`). */}
      <PageHeader
        title="Protokoll"
        description="Protokollierte Zugriffe und sicherheitsrelevante Vorgänge dieser Praxis."
      />

      {/* Die Filter in der Filterleiste (Welle B, ANN-405): am Telefon
          zugeklappt hinter „Filter“, ab 640 px offen nebeneinander; mit einem
          gesetzten Filter offen, damit er nicht unsichtbar wirkt (BEF-065).
          Die Bausteine `Field` und `Select` sind 48 px hoch und so breit wie
          ihre Spalte (RSP-01, UIK-19, TOK-13). Nur die Darstellung ist neu;
          welche Werte an den Server gehen, bleibt gleich. */}
      <Filterleiste
        gesetzt={aktiveFilter}
        onZuruecksetzen={filterZuruecksetzen}
        beschriftung="Protokoll filtern"
      >
        <Field
          label="Von"
          feldId="audit-from"
          type="date"
          value={from}
          onChange={(event) => filtere('von')(event.target.value)}
        />
        <Field
          label="Bis"
          feldId="audit-to"
          type="date"
          value={to}
          onChange={(event) => filtere('bis')(event.target.value)}
        />
        <div className="flex min-w-0 flex-col gap-2">
          <Select
            label="Person"
            feldId="audit-user"
            value={actorUserId}
            onChange={(event) => filterePerson(event.target.value)}
          >
            <option value="">Alle</option>
            {(members.data ?? []).map((member) => (
              <option key={member.id} value={member.id}>
                {member.display_name}
              </option>
            ))}
          </Select>
          {/* Ohne Liste steht nur „Alle" zur Wahl - das sagt die Seite, statt
              es als vollständige Auswahl auszugeben (ORG-14). */}
          {members.isError ? (
            <Listenfehler
              text="Die Liste der Personen konnte nicht geladen werden."
              onErneut={() => void members.refetch()}
            />
          ) : null}
        </div>
        <Select
          label="Aktion"
          feldId="audit-action"
          value={action}
          onChange={(event) => filtere('aktion')(event.target.value)}
        >
          <option value="">Alle</option>
          {AUDIT_ACTION_GROUPS.map((gruppe) => (
            <optgroup key={gruppe.titel} label={gruppe.titel}>
              {gruppe.aktionen.map((key) => (
                <option key={key} value={key}>
                  {auditActionLabels[key]}
                </option>
              ))}
            </optgroup>
          ))}
        </Select>
      </Filterleiste>

      {isPending ? <LoadingState label="Auditeinträge werden geladen …" inKarte /> : null}
      {/* Wer diese Seite sieht, ist berechtigt: Die Route steht nur der
          Praxisinhaber:in offen. Ein Ladefehler ist deshalb ein Verbindungs-
          und kein Rechteproblem - bis UXR-011 las die Praxisinhaber:in hier,
          die Ansicht sei „ausschließlich für die Praxisleitung freigegeben"
          (ORG-15, WRT-01, ZST-12). */}
      {isError && !data ? (
        <ErrorState
          title="Die Auditeinträge konnten nicht geladen werden."
          description={VERBINDUNG_PRUEFEN}
          onErneut={() => void refetch()}
        />
      ) : null}
      {isError && data ? (
        <NachladeHinweis className="mb-4" laeuft={isFetching} onErneut={() => void refetch()} />
      ) : null}

      {data && data.events.length === 0 ? (
        <EmptyState
          inKarte
          title="Keine Einträge im gewählten Zeitraum"
          description="Filter anpassen oder Zeitraum erweitern."
        />
      ) : null}

      {data && data.events.length > 0 ? (
        <>
          {/* Die Liste ist Auskunft und steht deshalb auf Papier wie jede
              andere Liste der Anwendung (ORG-16) - als `Datenliste`. Beim
              Blättern bleibt die alte Seite blass stehen, bis die neue da ist. */}
          <div
            className={`transition-opacity ${isPlaceholderData ? 'opacity-60' : ''}`}
            aria-busy={isPlaceholderData}
          >
            <Datenliste
              spalten={SPALTEN}
              zeilen={data.events}
              schluessel={(event) => event.id}
              beschriftung="Protokolleinträge"
            />
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <Statusmeldung className="tabular-nums">
                {first}–{last} von {total}
                {` · Stand ${standText(page > 0 && grenze ? Date.parse(grenze) : dataUpdatedAt)}`}
              </Statusmeldung>
              <Button variant="quiet" groesse="kompakt" disabled={isFetching} onClick={neuLaden}>
                {isFetching ? 'Wird geladen …' : 'Neu laden'}
              </Button>
            </div>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                disabled={page === 0 || isPlaceholderData}
                onClick={() => blaettere(page - 1)}
              >
                Zurück
              </Button>
              <Button
                variant="secondary"
                disabled={!hasNext || isPlaceholderData}
                onClick={() => blaettere(page + 1)}
              >
                Weiter
              </Button>
            </div>
          </div>
        </>
      ) : null}

      {/* Die Fußnote erklärt das System, nicht die Einträge - zugeklappt (UX-005i). */}
      <div className="mt-10 max-w-prose">
        <Disclosure summary="Was wird protokolliert?">
          <Kleingedrucktes>
            Protokolliert wird nur, was die Daten selbst nicht zeigen: das Öffnen einer Akte (einmal
            am Tag je Person), Herunterladen und Herausgeben, Zugänge und abgewiesene Zugriffe.
            Angezeigt werden ausschließlich Metadaten; Inhalte der Patientenakte sind nicht
            Bestandteil des Protokolls. Das Protokoll dient Datenschutz und Sicherheit, nie der
            Kontrolle von Mitarbeitenden.
          </Kleingedrucktes>
        </Disclosure>
      </div>
    </>
  );
}
