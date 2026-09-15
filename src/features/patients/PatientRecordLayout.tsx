import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, Navigate, NavLink, Outlet, useParams, useSearchParams } from 'react-router-dom';
import { Badge } from '@/components/ui/Badge';
import { kartenAktionKlassen } from '@/components/ui/buttonStile';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Rueckweg } from '@/components/ui/Rueckweg';
import {
  canManageAppointments,
  canWritePrescriptions,
  type CurrentUser,
} from '@/features/session/types';
import { formatDate } from '@/lib/datum';
import { istInternerPfad, RUECKWEG_PARAM } from '@/lib/rueckweg';
import {
  aktenBereiche,
  ersterAktenbereich,
  usePatientRecord,
  type PatientRecordContext,
} from './akte';
import { ageInYears, fetchPatient, fullName, logPatientRecordView, type Patient } from './api';

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
 * als Nächstes tut; darunter vier Bereiche, die jeweils **eine** Frage
 * beantworten. Was selten gebraucht wird, ist einen Tap entfernt, statt sich
 * jedes Mal in den Weg zu stellen. (Seit UI-002a sind es vier statt fünf: Der
 * Bereich „Übersicht" war ein Auszug aus den anderen und stand jedem Aufruf
 * der Akte im Weg.)
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

function Aktenavigation({
  patient,
  user,
  anhang,
}: {
  patient: Patient;
  user: CurrentUser;
  /** Der Rückweg der Akte, damit er beim Bereichswechsel nicht verloren geht. */
  anhang: string;
}) {
  const bereiche = aktenBereiche(patient.id, user);

  return (
    // Eigene Form statt der SubNav des Arbeitsbereichs: Die Leiste des Gerüsts
    // sagt, wo in der Anwendung man ist; diese sagt, welcher Teil der Akte
    // offen ist. Zwei gleich aussehende Reihen übereinander wären ein Rätsel.
    //
    // Schmal scrollt die Reihe waagerecht, statt in zwei Zeilen umzubrechen -
    // auch vier Ziele passen bei 375 px nicht nebeneinander.
    <nav aria-label="Bereiche der Akte" className="border-line border-t">
      <ul className="flex gap-1 overflow-x-auto px-2 py-1.5 sm:px-3">
        {bereiche.map((bereich) => (
          <li key={bereich.to} className="shrink-0">
            <NavLink
              to={`${bereich.to}${anhang}`}
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
 * Die Hinweise, die vor der Tür zählen (PAT-005, `IDEA-PRX-001`).
 *
 * Sie standen bis UI-002a auf der Übersicht der Akte. Mit ihr wären sie in die
 * Stammdaten gerutscht und damit hinter einen Bereichswechsel - „Klingel
 * defekt, bitte anrufen" nützt dort niemandem. Deshalb stehen sie jetzt im
 * Kopf, und nur dann, wenn etwas hinterlegt ist: Wer nichts eingetragen hat,
 * sieht auch keine leere Zeile.
 *
 * Für ein Patientenkonto liefert die Sicht die Felder gar nicht erst; die
 * Zeilen verschwinden dann von allein (ANN-010, ADR-004).
 */
function HausbesuchHinweise({ patient }: { patient: Patient }) {
  if (!patient.home_visit_access_note && !patient.special_note) return null;

  return (
    <dl className="mt-2 flex flex-col gap-0.5 text-sm">
      {patient.home_visit_access_note ? (
        <div className="flex gap-2">
          <dt className="text-ink-muted shrink-0">Zugang:</dt>
          <dd className="text-ink min-w-0">{patient.home_visit_access_note}</dd>
        </div>
      ) : null}
      {patient.special_note ? (
        <div className="flex gap-2">
          <dt className="text-ink-muted shrink-0">Besonderheit:</dt>
          <dd className="text-ink min-w-0">{patient.special_note}</dd>
        </div>
      ) : null}
    </dl>
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
        <HausbesuchHinweise patient={patient} />
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

/**
 * Der Einstieg in die Akte (UI-002a).
 *
 * `/patienten/:id` zeigt selbst nichts mehr, sondern führt weiter in den
 * ersten Bereich, den die Rolle sehen darf. `replace`, damit der Rückweg des
 * Browsers nicht auf einer Adresse landet, die sofort wieder weiterleitet.
 *
 * Die Suchparameter wandern vollständig mit: Darin steht der Rückweg der Akte
 * (`?zurueck=`), und der ginge sonst genau beim Öffnen verloren (UX-012).
 */
export function AkteEinstieg() {
  const { patient, user } = usePatientRecord();
  const [suche] = useSearchParams();
  const anhang = suche.toString();
  const ziel = ersterAktenbereich(patient.id, user);

  return <Navigate to={anhang ? `${ziel}?${anhang}` : ziel} replace />;
}

export function PatientRecordLayout({ user }: { user: CurrentUser }) {
  const { patientId } = useParams<{ patientId: string }>();
  const [suche] = useSearchParams();

  // Der Rückweg gehört der ganzen Akte, nicht einem ihrer Bereiche: Wer aus
  // dem Kalender kommt, im Behandlungsverlauf nachsieht und dann zurückgeht,
  // landet wieder im Kalender. Ohne das wäre der Rückweg beim ersten
  // Bereichswechsel weg.
  const rueckweg = suche.get(RUECKWEG_PARAM);
  const anhang = istInternerPfad(rueckweg)
    ? `?${RUECKWEG_PARAM}=${encodeURIComponent(rueckweg)}`
    : '';

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
      {/* Wer aus dem Kalender oder von einem Termin kommt, kommt dorthin
          zurück - mit allem, was dort eingestellt war (UX-012). */}
      <Rueckweg standard="/patienten" beschriftung="Zurück zur Liste" className="mb-3" />

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
            <Aktenavigation patient={data} user={user} anhang={anhang} />
          </header>

          <div className="mt-6">
            <Outlet context={{ patient: data, user } satisfies PatientRecordContext} />
          </div>
        </>
      ) : null}
    </>
  );
}
