import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/Feedback';
import { todayInTimeZone } from '@/features/appointments/api';
import type { CurrentUser } from '@/features/session/types';
import { mitarbeiterName, useVorschau } from '@/features/preview/vorschauContext';
import { OffeneEntscheidung, VorschauBanner } from '@/features/preview/ui';
import { formatDatum } from '@/features/preview/format';
import type { Stoppart, Tourstopp } from '@/features/preview/types';

/**
 * Besuchsfolge einer Person an einem Tag.
 *
 * Der Kalender beantwortet „wer behandelt wen wann", die Tour beantwortet
 * „wie kommt die Person dahin". Beide betrachten dieselben Besuche - es gibt
 * hier keine zweite Terminliste.
 *
 * Behandlungszeit und Wegzeit sind bewusst unterscheidbar dargestellt, und
 * jede Wegzeit trägt ihre Herkunft: Es gibt in dieser Anwendung keinen
 * Routingdienst. Ein geschätzter oder von Hand eingetragener Wert darf nicht
 * wie ein berechnetes Ergebnis aussehen (PROJECT_PRINCIPLES.md 9).
 */

const stoppLabels: Record<Stoppart, string> = {
  start: 'Start',
  besuch: 'Hausbesuch',
  pause: 'Pause',
  ende: 'Rückweg',
};

export function ToursPage({ user }: { user: CurrentUser }) {
  const { zustand } = useVorschau();
  const zeitzone = user.organizationTimeZone ?? 'Europe/Berlin';
  const heute = todayInTimeZone(zeitzone);

  const [mitarbeiterId, setMitarbeiterId] = useState(
    () => zustand.touren[0]?.mitarbeiterId ?? zustand.mitarbeitende[0]?.id ?? '',
  );

  const tour = zustand.touren.find((eintrag) => eintrag.mitarbeiterId === mitarbeiterId);
  const behandlungsminuten =
    tour?.stopps
      .filter((stopp) => stopp.art === 'besuch')
      .reduce((summe, stopp) => summe + stopp.dauerMinuten, 0) ?? 0;
  const wegminuten = tour?.stopps.reduce((summe, stopp) => summe + (stopp.wegMinuten ?? 0), 0) ?? 0;
  const ungeprueft = tour?.stopps.filter((stopp) => stopp.wegHerkunft === 'offen').length ?? 0;

  return (
    <>
      <PageHeader title="Touren" description="Besuchsfolge und Wege eines Arbeitstags." />

      <VorschauBanner
        bereich="Touren"
        beschreibung="Synthetische Besuchsfolge. Es ist kein Kartendienst angebunden und es werden keine Wege berechnet."
      />

      <div className="mb-5 flex flex-wrap items-end gap-4">
        <div className="max-w-xs flex-1 basis-56">
          <Select
            label="Person"
            value={mitarbeiterId}
            onChange={(event) => setMitarbeiterId(event.target.value)}
          >
            {zustand.mitarbeitende.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </Select>
        </div>
        <p className="text-ink-muted pb-3 text-sm">{formatDatum(heute)}</p>
      </div>

      {!tour ? (
        <EmptyState
          title="Für diese Person ist keine Tour hinterlegt"
          description="Im Vorschaustand gibt es nur für einzelne Personen eine Besuchsfolge."
        />
      ) : (
        <>
          <p className="text-ink-muted mb-4 text-sm">
            {mitarbeiterName(zustand, mitarbeiterId)} · Behandlungszeit {behandlungsminuten} min ·
            Wegzeit {wegminuten} min (geschätzt)
            {ungeprueft > 0 ? ` · ${ungeprueft} Weg${ungeprueft === 1 ? '' : 'e'} ungeprüft` : ''}
          </p>

          <ol className="border-line border-y">
            {tour.stopps.map((stopp) => (
              <li key={stopp.id} className="border-line border-b py-3 last:border-b-0">
                <Wegzeile stopp={stopp} />
                <div className="flex flex-wrap items-baseline gap-3">
                  <span className="text-ink w-16 shrink-0 text-sm font-medium tabular-nums">
                    {stopp.beginn}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="text-ink block text-[0.9375rem] font-medium">
                      {stopp.titel}
                    </span>
                    <span className="text-ink-muted mt-0.5 block text-sm">
                      {stoppLabels[stopp.art]}
                      {stopp.ort !== '–' ? ` · ${stopp.ort}` : ''}
                      {stopp.dauerMinuten > 0 ? ` · ${stopp.dauerMinuten} min` : ''}
                    </span>
                  </span>
                  {stopp.art === 'besuch' ? <Badge ton="akzent">Behandlung</Badge> : null}
                </div>
              </li>
            ))}
          </ol>

          <p className="text-ink-subtle mt-4 text-sm">
            Start und Ende liegen an einem Raddepot, nicht an einer Praxisadresse – die Praxis hat
            keine Behandlungsräume.{' '}
            <Link to="/kalender" className="text-accent hover:text-accent-hover underline">
              Dieselben Besuche im Kalender
            </Link>
          </p>
        </>
      )}

      <OffeneEntscheidung titel="Routing ist auch eine Datenschutzentscheidung">
        Ein Kartendienst ist ein Dienstleister mit Zugang zu Patientendaten: eine Adresse in
        Verbindung mit einem Behandlungstermin ist personenbezogen. Anbieter, Datenfluss,
        Vertragsgrundlage und Aufbewahrung müssen vor einer Integration geprüft werden
        (PROJECT_PRINCIPLES.md 3.5, 9; ADR-002, offener Punkt B7). Bis dahin gibt es keine
        Fahrzeitberechnung, keine Tourenoptimierung und keine dauerhafte Ortung von
        Mitarbeiter:innen (PROJECT_PRINCIPLES.md 20).
      </OffeneEntscheidung>
    </>
  );
}

/**
 * Der Weg zum vorigen Stopp.
 *
 * Steht bewusst zwischen den Stopps und nicht als Spalte daneben: Der Weg ist
 * ein eigener Zeitverbrauch und keine Eigenschaft des Besuchs.
 */
function Wegzeile({ stopp }: { stopp: Tourstopp }) {
  if (stopp.wegMinuten === null) return null;
  const geprueft = stopp.wegHerkunft === 'geschaetzt';

  return (
    <p
      className={`mb-2 inline-flex items-center gap-2 rounded-lg px-3 py-1 text-sm ${
        geprueft ? 'bg-surface-sunken text-ink-muted' : 'bg-warnung-soft text-warnung'
      }`}
    >
      Weg {stopp.wegMinuten} min
      <span className="text-xs">{geprueft ? 'von Hand geschätzt' : 'noch nicht geprüft'}</span>
    </p>
  );
}
