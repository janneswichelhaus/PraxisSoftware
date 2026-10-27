import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Navigate, Outlet, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { Badge } from '@/components/ui/Badge';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Disclosure } from '@/components/ui/Card';
import { Objektkopf, Warnzeile } from '@/components/ui/Objektkopf';
import { Reiterleiste } from '@/components/ui/Reiterleiste';
import { AnmeldebogenFoto } from '@/features/privacy/datenschutz/Anmeldebogen';
import { useOffeneErstaufnahme } from '@/features/patients/intake/useOffeneErstaufnahme';
import {
  useAktuelleGrundlage,
  versicherungsart,
} from '@/features/patients/treatment-bases/useAktuelleGrundlage';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckweg } from '@/components/ui/Rueckweg';
import {
  canManageAppointments,
  canWriteTreatmentBases,
  type CurrentUser,
} from '@/features/core/session/types';
import { BEGRIFFE } from '@/lib/begriffe';
import { formatDate } from '@/lib/datum';
import {
  istInternerPfad,
  leseRueckweg,
  mitRueckweg,
  RUECKWEG_PARAM,
  rueckwegBeschriftung,
} from '@/lib/rueckweg';
import {
  ALTE_AKTENBEREICHE,
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
 * Versorgung, Verwaltungsaktionen, dann erst Termine, Grundlagen und der
 * gesamte Behandlungsverlauf. Wer wissen wollte, wann die nächste Behandlung
 * ist, scrollte an allem vorbei, was sich seit der Aufnahme nicht mehr
 * geändert hat.
 *
 * Der Rahmen dreht das um: Oben steht, wer die Person ist und was man mit ihr
 * als Nächstes tut; darunter die Bereiche, die jeweils **eine** Frage
 * beantworten. Was selten gebraucht wird, ist einen Tap entfernt, statt sich
 * jedes Mal in den Weg zu stellen. (Seit UI-002a gibt es keinen Bereich
 * „Übersicht" mehr: Er war ein Auszug aus den anderen und stand jedem Aufruf
 * der Akte im Weg.)
 *
 * Der Rahmen lädt die Patient:in **einmal** und reicht sie an den offenen
 * Bereich weiter; ein Bereichswechsel lädt sie nicht neu und erzeugt damit
 * auch keinen zweiten Auditeintrag (ADR-010).
 *
 * Die Formulare der Akte - Termin anlegen, Grundlage erfassen, Stammdaten
 * bearbeiten - liegen bewusst **außerhalb** dieses Rahmens: Wer tippt, soll
 * die Bereichsleiste nicht sehen. Vor dem Verlust ungespeicherter Eingaben
 * schützt das allein nicht - Tableiste, Kopfsuche und Neuladen bleiben -,
 * deshalb fragen die Formulare selbst nach (`useTextverlustschutz`, PAT-02).
 * Aus einem Formular führt „Abbrechen" zurück, nicht die Navigation
 * (PROJECT_PRINCIPLES.md 13, UX-009).
 */

/**
 * Die Bereiche der Akte als Reiter (Design-Fundament: `Reiterleiste`). Der
 * Rückweg der Akte reist in jedem Ziel mit, damit er beim Bereichswechsel
 * nicht verloren geht.
 */
function Aktenavigation({
  patient,
  user,
  anhang,
}: {
  patient: Patient;
  user: CurrentUser;
  anhang: string;
}) {
  return (
    <Reiterleiste
      label="Bereiche der Akte"
      reiter={aktenBereiche(patient.id, user).map((bereich) => ({
        to: `${bereich.to}${anhang}`,
        label: bereich.label,
        end: bereich.end ?? false,
      }))}
    />
  );
}

/**
 * „! Anmeldebogen fehlt" - eine Zeile im Kopf, solange der Anmeldebogen fehlt
 * (AKTE-007, ANN-224). Sie öffnet die Kamera für das Foto des Blatts (ANN-227).
 *
 * Bis AKTE-007 stand hier die Kachel „Erstaufnahme offen" mit allen offenen
 * Punkten. Jetzt zählt im Kopf nur der Anmeldebogen: Ein fehlendes
 * Verordnungsfoto steht weiter unter „Offene Punkte", löst diese Zeile aber
 * nicht aus - es ist Arbeit fürs Büro, kein Hinweis vor der Behandlung.
 */
function AnmeldebogenHinweis({ patient, user }: { patient: Patient; user: CurrentUser }) {
  const offen = useOffeneErstaufnahme(patient.id, true, user);
  if (!offen.includes('registration_form')) return null;
  // ANN-227: Ein Tipp öffnet die Kamera, das Foto erledigt den Anmeldebogen -
  // ohne Umweg über die Stammdaten.
  return (
    <Warnzeile
      aktion={<AnmeldebogenFoto patientId={patient.id} ausloeser="link" knopf="Fotografieren" />}
    >
      {BEGRIFFE.anmeldebogen} fehlt
    </Warnzeile>
  );
}

/**
 * Zugangshinweis und Besonderheit (PAT-005, `IDEA-PRX-001`) - seit AKTE-007
 * gemeinsam hinter „Hinweise", standardmäßig zu. Die Zeile nennt, was
 * drinsteht („Zugang · Besonderheit"), damit niemand aufklappt, um ein leeres
 * Feld zu finden. Die Daten bleiben zwei Felder.
 *
 * Absätze bleiben stehen und lange Wörter brechen um, wie in den Stammdaten
 * (PAT-13): „2. OG", „Klingel Meier" und „Schlüssel beim Nachbarn" in drei
 * Zeilen liefen sonst zu einer zusammen.
 *
 * Für ein Patientenkonto liefert die Sicht die Felder gar nicht erst; der
 * Aufklapper verschwindet dann von allein (ANN-010, ADR-004).
 */
function HinweiseImKopf({ patient }: { patient: Patient }) {
  const teile = [
    patient.home_visit_access_note ? 'Zugang' : null,
    patient.special_note ? 'Besonderheit' : null,
  ].filter((teil): teil is string => teil !== null);
  if (teile.length === 0) return null;
  return (
    // Ohne eigene Karte: Der Kopf ist schon eine (Leitfaden L2) - eine Linie
    // trennt die Hinweise von den Knöpfen.
    <Disclosure
      kopf="label"
      summary={
        <span className="flex min-w-0 flex-wrap items-baseline gap-x-3">
          <span>Hinweise</span>
          <span className="text-ink-muted text-sm font-normal tracking-normal normal-case">
            {teile.join(' · ')}
          </span>
        </span>
      }
    >
      <dl className="flex flex-col gap-3 text-sm">
        {patient.home_visit_access_note ? (
          <div>
            <dt className="text-ink-muted">Zugangshinweis</dt>
            <dd className="text-ink wrap-anywhere">
              <span className="block whitespace-pre-line">{patient.home_visit_access_note}</span>
            </dd>
          </div>
        ) : null}
        {patient.special_note ? (
          <div>
            <dt className="text-ink-muted">Besonderheit</dt>
            <dd className="text-ink wrap-anywhere">
              <span className="block whitespace-pre-line">{patient.special_note}</span>
            </dd>
          </div>
        ) : null}
      </dl>
    </Disclosure>
  );
}

/**
 * Kopf der Akte: wer die Person ist - und die beiden Wege, die täglich
 * gebraucht werden (`Objektkopf`, Design-Fundament).
 *
 * Mehr steht hier nicht. Anschrift, Telefonnummern und Versorgungsdaten haben
 * ihren Platz in den Stammdaten; im Kopf wären sie vier Zeilen, die man bei
 * jedem Bereichswechsel erneut überspringt.
 */
function PatientKopf({
  patient,
  user,
  anhang,
}: {
  patient: Patient;
  user: CurrentUser;
  anhang: string;
}) {
  const alter = ageInYears(patient.date_of_birth);
  const darfTerminePlanen = canManageAppointments(user.roles);
  const darfVerordnen = canWriteTreatmentBases(user.roles);
  const ort = useLocation();
  const aktuell = useAktuelleGrundlage(patient.id, user);

  // Die Formulare kehren dorthin zurück, wo sie geöffnet wurden - samt dem
  // Rückweg der Akte selbst, der in der Adresse mitreist (PAT-08, TER-03).
  // Ohne ihn fiel der Termin nach dem Anlegen auf „Zurück zur Patientenliste"
  // zurück, und wer aus dem Kalender kam, fand nicht mehr dorthin.
  const hier = `${ort.pathname}${ort.search}`;
  // B1 (BEF-151): Jede Akte ist planbar - „Nicht in Versorgung“ ist entfallen.
  const zeigtTermin = darfTerminePlanen;

  // Der Rückweg unter 640 px als Pfeil vor dem Namen (Handoff Rahmen vom
  // 2026-10-05, Variante 4b, RAH-007): Die Zeile „← Zurück zu den
  // Patient:innen" über der Kopfkarte kostete am Telefon eine Zeile, bevor
  // der Name kam. Dasselbe Ziel wie die Zeile - der Rückweg aus der
  // Adresszeile gewinnt (UX-012) -, derselbe Wortlaut als Name und Tooltip.
  // Ab 640 px bleibt die Zeile, der Pfeil geht.
  const [suche] = useSearchParams();
  const rueckwegZiel = leseRueckweg(suche, '/patienten');

  return (
    <Objektkopf
      titel={fullName(patient)}
      rueckweg={{ to: rueckwegZiel, beschriftung: rueckwegBeschriftung(rueckwegZiel) }}
      meta={
        <>
          {patient.date_of_birth
            ? `geb. ${formatDate(patient.date_of_birth)}${alter !== null ? ` · ${alter} Jahre` : ''}`
            : 'Geburtsdatum nicht hinterlegt'}
          {/* Der Ort sagt im Kopf, wohin es geht - die Anschrift steht im
              Kontakt (Design-Handoff 2026-10-01). */}
          {patient.city ? ` · ${patient.city}` : ''}
        </>
      }
      // UX-005e: Der Regelfall trägt kein Etikett. Seit B1 (BEF-151) gibt es
      // „Nicht in Versorgung“ nicht mehr; der festgehaltene Abschluss bleibt
      // und gehört in den Kopf: Er sagt, dass die Behandlung beendet ist
      // (LOE-001b, ADR-008).
      status={
        patient.care_concluded_on ? (
          <Badge>Versorgung abgeschlossen am {formatDate(patient.care_concluded_on)}</Badge>
        ) : null
      }
      // AKTE-007: Abrechnungsart und Liege als Abzeichen - die Liege steht vor
      // der Tür mit auf dem Zettel (UX-003a), gesetzt wird sie in den
      // Stammdaten (ANN-116).
      abzeichen={
        aktuell || patient.treatment_table_required === true ? (
          <>
            {aktuell ? (
              <Badge>{versicherungsart(aktuell.grundlage.treatment_basis_kind)}</Badge>
            ) : null}
            {patient.treatment_table_required === true ? (
              <Badge ton="akzent">Liege mitnehmen</Badge>
            ) : null}
          </>
        ) : null
      }
      // Die beiden Vorgänge, die im Alltag aus der Akte heraus entstehen.
      // Alles Weitere steht in dem Bereich, zu dem es gehört.
      aktionen={
        zeigtTermin || darfVerordnen ? (
          <>
            {zeigtTermin ? (
              <ButtonLink to={mitRueckweg(`/patienten/${patient.id}/termine/neu`, hier)}>
                Termin anlegen
              </ButtonLink>
            ) : null}
            {darfVerordnen ? (
              <ButtonLink
                to={mitRueckweg(`/patienten/${patient.id}/verordnungen/neu`, hier)}
                variant="secondary"
              >
                Grundlage erfassen
              </ButtonLink>
            ) : null}
          </>
        ) : null
      }
      hinweise={
        <>
          <AnmeldebogenHinweis patient={patient} user={user} />
          <HinweiseImKopf patient={patient} />
        </>
      }
      reiter={<Aktenavigation patient={patient} user={user} anhang={anhang} />}
    />
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

/**
 * Eine abgelöste Adresse der Akte (AKTE-007): `/verlauf` und `/befund` führen
 * in die Doku, `/datenschutz` zum Anmeldebogen, `/dateien` in die Stammdaten.
 * Der Rückweg der Akte (`?zurueck=`) wandert mit; `replace`, damit „Zurück"
 * im Browser nicht auf der Weiterleitung landet.
 */
export function AlterAktenbereich({ alt }: { alt: keyof typeof ALTE_AKTENBEREICHE }) {
  const { patient } = usePatientRecord();
  const [suche] = useSearchParams();
  const [pfad, anker] = ALTE_AKTENBEREICHE[alt].split('#');
  const anhang = suche.toString();
  return (
    <Navigate
      to={{
        pathname: `/patienten/${patient.id}/${pfad}`,
        search: anhang ? `?${anhang}` : '',
        hash: anker ? `#${anker}` : '',
      }}
      replace
    />
  );
}

function Akte({ patient, user, anhang }: { patient: Patient; user: CurrentUser; anhang: string }) {
  // Keine Kontextspalte mehr (Akte entschlacken, 2026-10-03): Kontakt steht in
  // den Stammdaten, die Grundlage hat ihren eigenen Bereich.
  return (
    <>
      <PatientKopf patient={patient} user={user} anhang={anhang} />

      <div className="mt-6 min-w-0">
        <Outlet context={{ patient, user } satisfies PatientRecordContext} />
      </div>
    </>
  );
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

  const { data, isPending, isError, refetch } = useQuery({
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
          zurück - mit allem, was dort eingestellt war (UX-012). Ohne Rückweg
          führt er in die Liste; die Beschriftung kommt dann aus demselben
          Wortschatz wie jeder andere Rückweg dorthin (PAT-08, NAV-16).
          Unter 640 px steht derselbe Weg als Pfeil in der Kopfkarte
          (`PatientKopf`, RAH-007); die Zeile bleibt ab 640 px. */}
      <Rueckweg standard="/patienten" className="mb-3 max-sm:hidden" />

      {/* Solange der Kopf mit dem Namen fehlt, trägt die Seite ihre Gattung
          als Überschrift - im Laden wie im Fehler (UIK-16, PAT-22). */}
      {!data ? <PageHeader title="Patientenakte" /> : null}
      {/* Laden in einer Karte mit den Kacheln des Kopfs in Zielgröße
          (Design-Handoff 2026-10-01, Abschnitt 3). */}
      {isPending ? (
        <LoadingState label="Patientendaten werden geladen …" inKarte kacheln={4} />
      ) : null}
      {isError ? (
        <ErrorState
          title="Die Patientendaten konnten nicht geladen werden."
          description="Bitte die Verbindung prüfen und später erneut versuchen."
          onErneut={() => void refetch()}
        />
      ) : null}
      {data === null ? (
        <ErrorState
          title="Nicht gefunden"
          description="Diese Akte gibt es nicht oder sie ist für Ihren Zugang nicht freigegeben."
        />
      ) : null}

      {data ? <Akte patient={data} user={user} anhang={anhang} /> : null}
    </>
  );
}
