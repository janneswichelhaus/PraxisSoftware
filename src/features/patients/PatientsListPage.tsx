import { useMemo, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { Badge } from '@/components/ui/Badge';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { EmptyState } from '@/components/ui/Feedback';
import { Filterleiste } from '@/components/ui/Filterleiste';
import { ListRow, ListRows } from '@/components/ui/ListRow';
import { PageHeader } from '@/components/ui/PageHeader';
import { SearchField } from '@/components/ui/SearchField';
import { Select } from '@/components/ui/Select';
import { suchform } from '@/app/funktionen';
import { BEGRIFFE } from '@/lib/begriffe';
import { mitRueckweg } from '@/lib/rueckweg';
import { ageInYears, fetchPatients, type PatientListenzeile } from './api';

type StatusFilter = 'all' | 'active' | 'inactive';

/** Der Vorgang heißt hier wie in der Kopfsuche (PAT-21, ANN-111). */
const ANLEGEN = `${BEGRIFFE.patientIn} anlegen`;

function parseStatusFilter(value: string | null): StatusFilter {
  return value === 'active' || value === 'inactive' ? value : 'all';
}

/**
 * Baut den Query-String für Suche und Statusfilter neu auf, statt die
 * bestehenden Parameter zu ergänzen: die Seite kennt keine weiteren
 * Parameter, ein additiver Merge würde nur veraltete Werte mitschleppen.
 */
function toSearchParams(query: string, status: StatusFilter): URLSearchParams {
  const next = new URLSearchParams();
  if (query.trim()) next.set('q', query);
  if (status !== 'all') next.set('status', status);
  return next;
}

/**
 * Trifft die Zeile den Suchbegriff? (Design-Rollout B1, ANN-430)
 *
 * Bis dahin standen über der Liste zwei Suchfelder: „Patient:in suchen“
 * (serverseitig, `search_patients`, ab drei Zeichen) und „Liste filtern“ (über
 * die geladene Liste, auch Ort, Telefon und E-Mail). Beide sehen denselben
 * Bestand - die Liste lädt jede Akte, die die Person lesen darf, die Suche
 * prüft dasselbe Recht (ADR-004). Jetzt ist es ein Feld, und es kann, was
 * beide konnten:
 *
 *   * Name in **beiden Schreibrichtungen** („Max Mustermann“ wie „Mustermann
 *     Max“) und **ohne Umlautsorgen** („Muller“ findet „Müller“) - nach
 *     derselben Regel wie `app.suchform` (`suchform` aus `@/app/funktionen`);
 *   * Ort, Postleitzahl, Telefon und E-Mail wie bisher der Filter.
 */
function matches(patient: PatientListenzeile, query: string): boolean {
  const needle = suchform(query.trim());
  if (!needle) return true;
  const vorname = patient.given_name ?? '';
  const haystack = [
    `${vorname} ${patient.family_name}`,
    `${patient.family_name} ${vorname}`,
    patient.city,
    patient.postal_code,
    patient.phone,
    patient.email,
  ]
    .filter((value): value is string => Boolean(value))
    .map(suchform)
    .join('\n');
  return haystack.includes(needle);
}

function matchesStatus(patient: PatientListenzeile, status: StatusFilter): boolean {
  if (status === 'all') return true;
  return patient.status === status;
}

/**
 * Patientenliste (Seitentyp „Liste“, DESIGN.md): Kopf mit „Anlegen“, ein
 * Suchfeld, der Versorgungsfilter am Telefon hinter „Filter“, die Akten als
 * Zeilen.
 */
export function PatientsListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [query, setQuery] = useState(() => searchParams.get('q') ?? '');
  const [status, setStatus] = useState<StatusFilter>(() =>
    parseStatusFilter(searchParams.get('status')),
  );
  const abfrage = useQuery({
    queryKey: ['patients'],
    queryFn: fetchPatients,
    retry: false,
  });
  const { data } = abfrage;

  const visible = useMemo(
    () => (data ?? []).filter((p) => matchesStatus(p, status) && matches(p, query)),
    [data, query, status],
  );

  // Die Akte führt zurück in genau diese Ansicht - mit Suchbegriff und
  // Statusfilter (PAT-08, UX-012). Ohne Filter braucht es keinen: Die Akte
  // führt dann ohnehin hierher.
  const filter = searchParams.toString();
  const rueckweg = filter ? `/patienten?${filter}` : null;
  const zurAkte = (id: string) => mitRueckweg(`/patienten/${id}`, rueckweg);

  function updateQuery(value: string) {
    setQuery(value);
    setSearchParams(toSearchParams(value, status), { replace: true });
  }

  function updateStatus(value: StatusFilter) {
    setStatus(value);
    setSearchParams(toSearchParams(query, value), { replace: true });
  }

  /**
   * Die Eingabetaste (am Telefon „Suchen“) öffnet die Akte, wenn genau eine
   * übrig ist - der Sprung, den bis dahin die Trefferliste der Namenssuche
   * bot. Bei mehreren bleibt die Liste stehen.
   */
  function absenden(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const [einzige, ...weitere] = visible;
    if (query.trim() && einzige && weitere.length === 0) void navigate(zurAkte(einzige.id));
  }

  const eingeschraenkt = query.trim() !== '' || status !== 'all';

  return (
    <>
      <PageHeader
        title="Patient:innen"
        actions={<ButtonLink to="/patienten/neu">{ANLEGEN}</ButtonLink>}
      />

      <Filterleiste
        beschriftung="Patient:innen durchsuchen"
        suche={
          <form onSubmit={absenden} noValidate>
            <SearchField
              label="Patient:in suchen"
              placeholder="Name, Ort, Telefon, E-Mail"
              value={query}
              onChange={updateQuery}
            />
          </form>
        }
        gesetzt={status === 'all' ? 0 : 1}
        onZuruecksetzen={() => updateStatus('all')}
        ergebnis={
          data && data.length > 0 && eingeschraenkt
            ? `${visible.length} von ${data.length}`
            : undefined
        }
      >
        {/* BEF-067: „in Versorgung“ / „nicht in Versorgung“ wie in Suche,
            Kopf der Akte und Stammdaten; „abgeschlossen“ bleibt dem Abschluss. */}
        <Select
          label="Versorgung"
          value={status}
          onChange={(event) => updateStatus(event.target.value as StatusFilter)}
        >
          <option value="all">Alle</option>
          <option value="active">In Versorgung</option>
          <option value="inactive">Nicht in Versorgung</option>
        </Select>
      </Filterleiste>

      <Abfragezustand
        abfrage={abfrage}
        laden="Patientenliste wird geladen …"
        fehler="Die Patientenliste konnte nicht geladen werden."
        inKarte
        leer={{
          wenn: (liste) => liste.length === 0,
          titel: 'Noch keine Patient:innen',
          beschreibung: `Die erste Akte entsteht über „${ANLEGEN}“.`,
        }}
      >
        {() =>
          visible.length === 0 ? (
            <EmptyState inKarte title="Keine Treffer" description="Suche oder Filter anpassen." />
          ) : (
            <ListRows>
              {visible.map((patient) => {
                const age = ageInYears(patient.date_of_birth);
                return (
                  <ListRow
                    key={patient.id}
                    to={zurAkte(patient.id)}
                    // BEF-067: „Nachname, Vorname“ wie sortiert, der Nachname
                    // hervorgehoben; am Telefon bricht der Name um, statt
                    // zuerst den Nachnamen abzuschneiden.
                    titel={
                      <span className="wrap-anywhere">
                        {patient.family_name}
                        {patient.given_name ? (
                          <span className="font-normal">, {patient.given_name}</span>
                        ) : null}
                      </span>
                    }
                    meta={`${age !== null ? `${age} Jahre` : 'Geburtsdatum unbekannt'}${
                      patient.city ? ` · ${patient.city}` : ''
                    }`}
                    // Das Etikett des Systems, groß geschrieben wie der Filter
                    // (PAT-14, UIK-18, WRT-16); der Regelfall trägt keins.
                    status={
                      patient.status === 'inactive' ? <Badge>Nicht in Versorgung</Badge> : undefined
                    }
                  />
                );
              })}
            </ListRows>
          )
        }
      </Abfragezustand>
    </>
  );
}
