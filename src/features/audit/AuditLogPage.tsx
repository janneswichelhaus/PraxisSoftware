import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { Badge } from '@/components/ui/Badge';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Aufklappzeichen, Disclosure, Inhaltsflaeche } from '@/components/ui/Card';
import { aufklappKopfKlassen } from '@/components/ui/aufklappStile';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Field } from '@/components/ui/Field';
import { Select } from '@/components/ui/Select';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Listenfehler, NachladeHinweis } from '@/features/appointments/Rueckmeldungen';
import { SicherheitReiter } from './SicherheitReiter';
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
 * Eine Zeile des Auditlogs.
 *
 * **Spalten erst ab 1024 px (ORG-12).** Ab 640 px galten bis UXR-011 vier
 * feste Spalten mit 528 px samt Lücken; bei 700 bis 820 px blieben der
 * eigentlichen Aussage - was geschah - rund 150 px, „Behandlungsdokumentation"
 * passte nicht hinein, und die Seite scrollte quer. Darunter stehen die
 * Angaben jetzt untereinander wie am Telefon, und die Vorgangsspalte darf
 * schmaler werden als ihr längstes Wort.
 *
 * **Spaltenköpfe für Vorlesesoftware (UIK-24).** Die Zeile ist eine Liste,
 * keine Tabelle; welche Angabe was ist, erschloss sich bisher nur aus dem
 * Inhalt. Jede Angabe trägt deshalb ihre Bezeichnung, sichtbar nur für
 * Vorlesesoftware.
 *
 * Nur Darstellung: Gelesen wird unverändert über `list_audit_events`
 * (ADR-010), und was eine Zeile zeigt, bleibt Metadatum.
 */
function EventRow({ event }: { event: AuditEvent }) {
  return (
    <li className="py-3 lg:grid lg:grid-cols-[10rem_12rem_minmax(0,1fr)_7rem] lg:items-baseline lg:gap-4 lg:py-2.5">
      <span className="text-ink-muted block text-sm tabular-nums">
        <span className="sr-only">Zeitpunkt: </span>
        {formatTimestamp(event.occurred_at)}
      </span>
      <span className="text-ink text-liste mt-0.5 block truncate lg:mt-0">
        <span className="sr-only">Person: </span>
        {akteur(event)}
      </span>
      <span className="text-ink text-liste mt-0.5 block min-w-0 wrap-anywhere lg:mt-0">
        <span className="sr-only">Vorgang: </span>
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
      {/* BEF-065: Eine Abweisung ist das, wonach man sucht - sie steht als
          kritisches Abzeichen da, nicht in derselben grauen Zeile wie
          „Erfolgreich". */}
      <span className="text-ink-muted mt-0.5 block text-sm lg:mt-0 lg:text-right">
        <span className="sr-only">Ergebnis: </span>
        {event.outcome === 'denied' ? (
          <Badge ton="kritisch">{label(auditOutcomeLabels, event.outcome)}</Badge>
        ) : (
          label(auditOutcomeLabels, event.outcome)
        )}
      </span>
    </li>
  );
}

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
 *   * **Filter in der Adresse** (`?von=&bis=&person=&aktion=&seite=`): Ein
 *     Neuladen oder ein geteilter Link behält sie. Am Telefon stehen sie
 *     zugeklappt unter „Filter", ab 1024 px offen.
 *   * **Aktionen gruppiert** wie im Katalog (ADR-010 Punkt 16).
 *   * **Blättern auf einem festen Stand:** Ab der zweiten Seite liest die
 *     Seite nur Einträge bis zum jüngsten der ersten Seite. Was danach
 *     entsteht, schiebt nichts um; „Neu laden" holt es ausdrücklich. Die
 *     Serverfunktion ist dieselbe, nur `p_to` ist dann gesetzt.
 *   * Beim Blättern bleibt die alte Seite stehen, bis die neue da ist.
 *
 * Das Lesen des Protokolls wird nicht protokolliert (ADR-010 Fassung 3).
 */
export function AuditLogPage() {
  const [suche, setSuche] = useSearchParams();
  const from = suche.get('von') ?? '';
  const to = suche.get('bis') ?? '';
  const actorUserId = suche.get('person') ?? '';
  const action = suche.get('aktion') ?? '';
  const seite = Number.parseInt(suche.get('seite') ?? '1', 10);
  const page = Number.isFinite(seite) && seite > 1 ? seite - 1 : 0;

  // Die Grenze gilt für die Folgeseiten; die erste Seite ist immer der
  // jüngste Stand. `null`: noch nicht festgelegt.
  const [stand, setStand] = useState<{ grenze: string; zeit: number } | null>(null);

  const filter = {
    from: from || undefined,
    to: to || undefined,
    actorUserId: actorUserId || undefined,
    action: action || undefined,
    stand: page > 0 ? stand?.grenze : undefined,
    page,
    pageSize: PAGE_SIZE,
  };

  const { data, isPending, isError, isFetching, isPlaceholderData, dataUpdatedAt, refetch } =
    useQuery({
      queryKey: ['audit-events', filter],
      queryFn: () => fetchAuditEvents(filter),
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
      setStand(null);
      setze({ [schluessel]: wert, seite: null });
    };
  }

  function blaettere(ziel: number) {
    // Die Grenze entsteht beim ersten Schritt weg von Seite 1, aus dem
    // jüngsten Eintrag, den die Seite gerade zeigt.
    if (page === 0 && ziel > 0 && data && !stand) {
      const grenze = grenzeNach(data.events);
      if (grenze) setStand({ grenze, zeit: dataUpdatedAt });
    }
    setze({ seite: ziel > 0 ? String(ziel + 1) : null });
  }

  function neuLaden() {
    setStand(null);
    if (page === 0) void refetch();
    else setze({ seite: null });
  }

  return (
    <>
      {/* Der Titel ist das Wort des Reiters (ORG-07): bis UXR-011 öffnete
          „Sicherheit" eine Seite namens „Audit". Seit RAH-005 heißt der
          Menüpunkt „Sicherheit und Aufbewahrung" und führt hierher; die
          Aufbewahrung ist der zweite Reiter. */}
      <SicherheitReiter />
      <PageHeader
        title="Protokoll"
        description="Protokollierte Zugriffe und sicherheitsrelevante Vorgänge dieser Praxis."
      />

      {/* Die Filter sind die Bausteine `Field` und `Select` (RSP-01, UIK-19,
          TOK-13): 48 px hoch wie jedes Feld und immer so breit wie ihre
          Spalte. Bis UXR-011 waren es rohe Felder ohne volle Breite - das
          längste Wort der Aktionsliste setzte die Breite der Spalte, und die
          Seite lief bei 390 px 36 px über den Rand. Unter 640 px steht eine
          Spalte ausdrücklich da. Nur die Darstellung ist neu; welche Werte an
          den Server gehen, bleibt gleich. */}
      {/* BEF-065: Am Telefon standen alle vier Filter offen über der Liste
          (rund 330 px). Jetzt zugeklappt, ab 1024 px offen; mit einem
          gesetzten Filter offen, damit er nicht unsichtbar wirkt. */}
      <div className="mb-6">
        <Disclosure
          summary={aktiveFilter > 0 ? `Filter (${aktiveFilter} gesetzt)` : 'Filter'}
          offen={aktiveFilter > 0}
          offenAb="lg"
        >
          <form
            className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
            onSubmit={(event) => event.preventDefault()}
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
                onChange={(event) => filtere('person')(event.target.value)}
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
          </form>
        </Disclosure>
      </div>

      {isPending ? <LoadingState label="Auditeinträge werden geladen …" /> : null}
      {/* Wer diese Seite sieht, ist berechtigt: Die Route steht nur der
          Praxisinhaber:in offen. Ein Ladefehler ist deshalb ein Verbindungs-
          und kein Rechteproblem - bis UXR-011 las die Praxisinhaber:in hier,
          die Ansicht sei „ausschließlich für die Praxisleitung freigegeben"
          (ORG-15, WRT-01, ZST-12). */}
      {isError && !data ? (
        <ErrorState
          title="Die Auditeinträge konnten nicht geladen werden."
          description="Bitte die Verbindung prüfen und erneut versuchen."
          onErneut={() => void refetch()}
        />
      ) : null}
      {isError && data ? (
        <NachladeHinweis className="mb-4" laeuft={isFetching} onErneut={() => void refetch()} />
      ) : null}

      {data && data.events.length === 0 ? (
        <EmptyState
          title="Keine Einträge im gewählten Zeitraum"
          description="Filter anpassen oder Zeitraum erweitern."
        />
      ) : null}

      {data && data.events.length > 0 ? (
        <>
          {/* Die Liste ist Auskunft und steht deshalb auf Papier wie jede
              andere Liste der Anwendung (ORG-16). */}
          <Inhaltsflaeche>
            <ul
              className={`divide-line divide-y transition-opacity ${isPlaceholderData ? 'opacity-60' : ''}`}
              aria-busy={isPlaceholderData}
            >
              {data.events.map((event) => (
                <EventRow key={event.id} event={event} />
              ))}
            </ul>
          </Inhaltsflaeche>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <Statusmeldung className="tabular-nums">
                {first}–{last} von {total}
                {` · Stand ${standText(page > 0 && stand ? stand.zeit : dataUpdatedAt)}`}
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
      <details className="group border-line mt-10 max-w-prose border-t pt-2">
        <summary className={`${aufklappKopfKlassen} text-ink-muted hover:text-ink text-sm`}>
          <Aufklappzeichen />
          Was wird protokolliert?
        </summary>
        <Kleingedrucktes className="mt-2">
          Protokolliert wird nur, was die Daten selbst nicht zeigen: das Öffnen einer Akte (einmal
          am Tag je Person), Herunterladen und Herausgeben, Zugänge und abgewiesene Zugriffe.
          Angezeigt werden ausschließlich Metadaten; Inhalte der Patientenakte sind nicht
          Bestandteil des Protokolls. Das Protokoll dient Datenschutz und Sicherheit, nie der
          Kontrolle von Mitarbeitenden.
        </Kleingedrucktes>
      </details>
    </>
  );
}
