import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, NavLink, Outlet, useParams } from 'react-router-dom';
import { Badge } from '@/components/ui/Badge';
import { kartenAktionKlassen } from '@/components/ui/buttonStile';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import {
  canManageAppointments,
  canWritePrescriptions,
  type CurrentUser,
} from '@/features/session/types';
import { aktenBereiche, type PatientRecordContext } from './akte';
import {
  ageInYears,
  fetchPatient,
  formatDate,
  fullName,
  logPatientRecordView,
  type Patient,
} from './api';

/**
 * Rahmen der Patientenakte (AKTE-000).
 *
 * Die Akte war eine einzige, sehr lange Seite: Stammdaten, Kontakt,
 * Versorgung, Verwaltungsaktionen, dann erst Termine, Verordnungen und der
 * gesamte Behandlungsverlauf. Wer wissen wollte, wann die nächste Behandlung
 * ist, scrollte an allem vorbei, was sich seit der Aufnahme nicht mehr
 * geändert hat.
 *
 * Der Rahmen dreht das um: Oben steht, wer die Person ist und was man mit ihr
 * als Nächstes tut; darunter fünf Bereiche, die jeweils **eine** Frage
 * beantworten. Was selten gebraucht wird, ist einen Tap entfernt, statt sich
 * jedes Mal in den Weg zu stellen.
 *
 * Der Rahmen lädt die Patient:in **einmal** und reicht sie an den offenen
 * Bereich weiter; ein Bereichswechsel lädt sie nicht neu und erzeugt damit
 * auch keinen zweiten Auditeintrag (ADR-010).
 *
 * Die Formulare der Akte - Termin anlegen, Verordnung erfassen, Stammdaten
 * bearbeiten - liegen bewusst **außerhalb** dieses Rahmens: Wer tippt, soll
 * die Bereichsleiste nicht sehen und mit einem Tap darauf keine ungespeicherte
 * Eingabe verlieren. Aus einem Formular führt „Abbrechen" zurück, nicht die
 * Navigation (PROJECT_PRINCIPLES.md 13, UX-009).
 */

function Aktenavigation({ patient, user }: { patient: Patient; user: CurrentUser }) {
  const bereiche = aktenBereiche(patient.id, user);

  return (
    // Eigene Form statt der SubNav des Arbeitsbereichs: Die Leiste des Gerüsts
    // sagt, wo in der Anwendung man ist; diese sagt, welcher Teil der Akte
    // offen ist. Zwei gleich aussehende Reihen übereinander wären ein Rätsel.
    //
    // Schmal scrollt die Reihe waagerecht, statt in zwei Zeilen umzubrechen -
    // fünf Ziele passen bei 375 px nicht nebeneinander.
    <nav aria-label="Bereiche der Akte" className="border-line border-t">
      <ul className="flex gap-1 overflow-x-auto px-2 py-1.5 sm:px-3">
        {bereiche.map((bereich) => (
          <li key={bereich.to} className="shrink-0">
            <NavLink
              to={bereich.to}
              end={bereich.end ?? false}
              className="text-ink-muted hover:bg-surface-sunken hover:text-ink rounded-pill aria-[current=page]:bg-accent-soft aria-[current=page]:text-accent flex min-h-11 items-center px-3 text-[0.9375rem] whitespace-nowrap transition-colors aria-[current=page]:font-medium"
            >
              {bereich.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * Kopf der Akte: wer die Person ist - und die beiden Wege, die täglich
 * gebraucht werden.
 *
 * Mehr steht hier nicht. Anschrift, Telefonnummern und Versorgungsdaten haben
 * ihren Platz in den Stammdaten; im Kopf wären sie vier Zeilen, die man bei
 * jedem Bereichswechsel erneut überspringt.
 */
function PatientKopf({ patient, user }: { patient: Patient; user: CurrentUser }) {
  const alter = ageInYears(patient.date_of_birth);
  const darfTerminePlanen = canManageAppointments(user.roles);
  const darfVerordnen = canWritePrescriptions(user.roles);

  return (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3 px-4 py-3 sm:px-5 sm:py-4">
      <div className="min-w-0">
        <h1 className="text-accent text-h4 font-bold">{fullName(patient)}</h1>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <p className="text-ink-muted text-sm">
            {patient.date_of_birth
              ? `geb. ${formatDate(patient.date_of_birth)}${alter !== null ? ` · ${alter} Jahre` : ''}`
              : 'Geburtsdatum nicht hinterlegt'}
          </p>
          {patient.status === 'active' ? (
            <Badge ton="positiv">In Versorgung</Badge>
          ) : (
            <Badge ton="warnung">Nicht in laufender Versorgung</Badge>
          )}
          {/* Der Abschluss ist etwas anderes als der Status und gehört in den
              Kopf: Er sagt, dass die Behandlung beendet ist und die
              Aufbewahrung läuft (LOE-001b, ADR-008). */}
          {patient.care_concluded_on ? (
            <Badge>Versorgung abgeschlossen am {formatDate(patient.care_concluded_on)}</Badge>
          ) : null}
        </div>
      </div>

      {/* Die beiden Vorgänge, die im Alltag aus der Akte heraus entstehen. Alles
          Weitere steht in dem Bereich, zu dem es gehört.

          In der kompakten Größe (44 px, 14 px Schrift): In voller Größe standen
          die beiden bei 375 px untereinander und kosteten den Kopf über hundert
          Pixel Höhe - genau das, was dieser Umbau abstellen soll. Das Tippziel
          bleibt bei 44 px (Oberflächen-Checkliste Punkt 1). */}
      <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
        {darfTerminePlanen && patient.status === 'active' ? (
          <Link
            to={`/patienten/${patient.id}/termine/neu`}
            className={kartenAktionKlassen('primary')}
          >
            Termin anlegen
          </Link>
        ) : null}
        {darfVerordnen ? (
          <Link
            to={`/patienten/${patient.id}/verordnungen/neu`}
            className={kartenAktionKlassen('secondary')}
          >
            Verordnung erfassen
          </Link>
        ) : null}
      </div>
    </div>
  );
}

export function PatientRecordLayout({ user }: { user: CurrentUser }) {
  const { patientId } = useParams<{ patientId: string }>();

  const { data, isPending, isError } = useQuery({
    queryKey: ['patient', patientId],
    queryFn: () => fetchPatient(patientId!),
    enabled: Boolean(patientId),
    retry: false,
  });

  // ADR-010: Das Öffnen einer Patientenakte ist auditpflichtig. Protokolliert
  // wird erst, wenn der Datensatz tatsächlich sichtbar war - nicht schon beim
  // Aufruf einer beliebigen ID. Der Rahmen bleibt beim Bereichswechsel stehen,
  // deshalb entsteht je geöffneter Akte genau ein Eintrag.
  useEffect(() => {
    if (data?.id) void logPatientRecordView(data.id);
  }, [data?.id]);

  return (
    <>
      <Link
        to="/patienten"
        className="text-ink-muted hover:text-ink mb-3 inline-flex min-h-11 items-center text-sm"
      >
        ← Zurück zur Liste
      </Link>

      {isPending ? <LoadingState label="Patientendaten werden geladen …" /> : null}
      {isError ? <ErrorState title="Die Patientendaten konnten nicht geladen werden." /> : null}
      {data === null ? (
        <ErrorState
          title="Nicht gefunden"
          description="Dieser Datensatz existiert nicht oder ist für Ihren Zugang nicht freigegeben."
        />
      ) : null}

      {data ? (
        <>
          <header className="border-line bg-surface rounded-card overflow-hidden border">
            <PatientKopf patient={data} user={user} />
            <Aktenavigation patient={data} user={user} />
          </header>

          <div className="mt-6">
            <Outlet context={{ patient: data, user } satisfies PatientRecordContext} />
          </div>
        </>
      ) : null}
    </>
  );
}
