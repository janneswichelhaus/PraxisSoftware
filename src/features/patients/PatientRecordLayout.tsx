import { useEffect, useLayoutEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Link,
  Navigate,
  NavLink,
  Outlet,
  useLocation,
  useParams,
  useSearchParams,
} from 'react-router-dom';
import { Badge } from '@/components/ui/Badge';
import { Disclosure } from '@/components/ui/Card';
import { AnmeldebogenFoto } from '@/features/datenschutz/Anmeldebogen';
import { useOffeneErstaufnahme } from '@/features/open-points/useOffeneErstaufnahme';
import { type TreatmentBasis } from '@/features/treatment-bases/api';
import { useAktuelleGrundlage } from '@/features/treatment-bases/useAktuelleGrundlage';
import { kartenAktionKlassen } from '@/components/ui/buttonStile';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { roleLabel } from '@/components/ui/roleLabels';
import {
  canChangePatientStatus,
  canManageAppointments,
  canWriteTreatmentBases,
  type CurrentUser,
  type RoleKey,
} from '@/features/session/types';
import { BEGRIFFE } from '@/lib/begriffe';
import { formatDate } from '@/lib/datum';
import { istInternerPfad, mitRueckweg, RUECKWEG_PARAM } from '@/lib/rueckweg';
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
 * Wie weit der Nachbar des aktiven Bereichs noch ins Bild ragt, wenn die
 * Leiste ihn heranrollt: ein angeschnittenes Wort sagt „hier geht es weiter".
 * Derselbe Wert wie in der `SubNav`.
 */
const NACHBAR_PX = 24;

/**
 * Rollt die Leiste waagerecht, bis `eintrag` ganz zu sehen ist (PAT-01,
 * RSP-04) - nach dem Muster der `SubNav`: über `scrollLeft` der Liste und nicht
 * über `scrollIntoView`, das auch die Seite senkrecht rollte (UIK-10).
 *
 * Nur, wo die Leiste überhaupt scrollt: ab 640 px bricht sie um, dann ist
 * ohnehin alles zu sehen.
 */
function rolleInsBild(liste: HTMLElement, eintrag: HTMLElement): void {
  if (liste.scrollWidth <= liste.clientWidth) return;
  const rahmen = liste.getBoundingClientRect();
  const ziel = eintrag.getBoundingClientRect();
  const links = ziel.left - rahmen.left + liste.scrollLeft;
  const rechts = links + ziel.width;
  if (links - NACHBAR_PX < liste.scrollLeft) {
    liste.scrollLeft = Math.max(0, links - NACHBAR_PX);
  } else if (rechts + NACHBAR_PX > liste.scrollLeft + liste.clientWidth) {
    liste.scrollLeft = rechts + NACHBAR_PX - liste.clientWidth;
  }
}

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
  const { pathname } = useLocation();
  const liste = useRef<HTMLUListElement>(null);

  // Der offene Bereich steht im Bild (PAT-01, RSP-04). Bis dahin stand die
  // Leiste am Telefon immer am Anfang: Auf „Stammdaten" - dem letzten von
  // sieben Bereichen - war der markierte Eintrag nicht zu sehen, auch nicht
  // nach dem Speichern der Stammdaten. Vor dem Zeichnen, damit die Leiste
  // nicht erst am Anfang steht und dann springt.
  useLayoutEffect(() => {
    const aktiv = liste.current?.querySelector<HTMLElement>('[aria-current="page"]');
    if (liste.current && aktiv) rolleInsBild(liste.current, aktiv);
  }, [pathname]);

  return (
    // Eigene Form statt der SubNav des Arbeitsbereichs: Die Leiste des Gerüsts
    // sagt, wo in der Anwendung man ist; diese sagt, welcher Teil der Akte
    // offen ist. Zwei gleich aussehende Reihen übereinander wären ein Rätsel.
    //
    // Schmal scrollt die Reihe waagerecht, statt in zwei Zeilen umzubrechen -
    // die sieben Bereiche brauchen zusammen rund 800 px. Ab 640 px bricht sie
    // wie die SubNav um (PAT-01): Am Tablet fehlten sonst Datenschutz und
    // Stammdaten, und mit der Maus gibt es keine Wischgeste.
    <nav aria-label="Bereiche der Akte" className="border-line border-t">
      <ul
        ref={liste}
        className="flex gap-1 overflow-x-auto px-2 py-1.5 sm:flex-wrap sm:overflow-visible sm:px-3"
      >
        {bereiche.map((bereich) => (
          <li key={bereich.to} className="shrink-0">
            <NavLink
              to={`${bereich.to}${anhang}`}
              end={bereich.end ?? false}
              className="text-ink-muted hover:bg-surface-sunken hover:text-ink rounded-pill aria-[current=page]:bg-accent-soft aria-[current=page]:text-accent text-liste flex min-h-11 items-center px-3 whitespace-nowrap transition-colors aria-[current=page]:font-semibold"
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
 * „! Anmeldebogen fehlt" - eine Zeile im Kopf, solange der Anmeldebogen fehlt
 * (AKTE-007, ANN-224). Sie öffnet die Kamera für das Foto des Blatts (ANN-226).
 *
 * Bis AKTE-007 stand hier die Kachel „Erstaufnahme offen" mit allen offenen
 * Punkten. Jetzt zählt im Kopf nur der Anmeldebogen: Ein fehlendes
 * Verordnungsfoto steht weiter unter „Offene Punkte", löst diese Zeile aber
 * nicht aus - es ist Arbeit fürs Büro, kein Hinweis vor der Behandlung.
 */
function AnmeldebogenHinweis({ patient, user }: { patient: Patient; user: CurrentUser }) {
  const offen = useOffeneErstaufnahme(patient.id, patient.status === 'active', user);
  if (!offen.includes('registration_form')) return null;
  // ANN-226: Ein Tipp öffnet die Kamera, das Foto erledigt den Anmeldebogen -
  // ohne Umweg über die Stammdaten.
  return (
    <div className="bg-warnung-soft text-warnung rounded-card flex min-h-11 flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2 text-sm font-semibold">
      <p>
        <span aria-hidden="true">! </span>
        {BEGRIFFE.anmeldebogen} fehlt
      </p>
      <AnmeldebogenFoto patientId={patient.id} ausloeser="link" knopf="Fotografieren" />
    </div>
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
    <Disclosure
      inKarte
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

/** Hinweiszeile und Hinweise unter den Knöpfen; ohne beides kein Abstand. */
function KopfHinweise({ patient, user }: { patient: Patient; user: CurrentUser }) {
  return (
    <div className="flex flex-col gap-3 px-4 pb-3 empty:hidden sm:px-5 sm:pb-4">
      <AnmeldebogenHinweis patient={patient} user={user} />
      <HinweiseImKopf patient={patient} />
    </div>
  );
}

/**
 * Wie die Person abgerechnet wird, als Abzeichen im Kopf (AKTE-007).
 *
 * An der Person gibt es kein Feld für Kostenträger oder Abrechnungsart; die
 * Praxis rechnet privat ab (ADR-009). Was sich unterscheidet, ist die Bauart
 * der Grundlage (ADR-020): Verordnung oder Selbstzahler. Das Abzeichen folgt
 * deshalb der jüngsten Grundlage, über denselben organisatorischen Lesepfad
 * wie der Reiter Behandlungsgrundlagen (ANN-011). Ohne Grundlage kein Abzeichen.
 */
function versicherungsart(kind: TreatmentBasis['treatment_basis_kind']): string {
  return kind === 'self_pay' ? 'Selbstzahler' : 'Privat · mit Verordnung';
}

/**
 * Die Praxisrollen in der Reihenfolge, in der der Satz sie nennt. Wer davon
 * den Versorgungsstatus wechseln darf, sagt `canChangePatientStatus` - so
 * nennt der Kopf nie eine andere Rolle als die Verwaltung der Stammdaten.
 * Verbindlich prüft der Server (ADR-004).
 */
const PRAXISROLLEN: readonly RoleKey[] = ['office', 'team_lead', 'owner', 'therapist'];

function aufzaehlung(teile: string[]): string {
  if (teile.length < 2) return teile.join('');
  return `${teile.slice(0, -1).join(', ')} und ${teile.at(-1)}`;
}

/**
 * Warum „Termin anlegen" fehlt (PAT-05).
 *
 * Bei einer Person, die nicht in laufender Versorgung ist, verschwand der
 * Knopf bisher ohne ein Wort. Wer sie einplanen wollte, suchte ihn - und fand
 * keinen Weg. Der Satz nennt den Grund und den Weg zurück: für Rollen mit
 * Statusrecht den Ort, für alle anderen, wer es darf.
 */
function OhneNeueTermine({ user }: { user: CurrentUser }) {
  const weg = canChangePatientStatus(user.roles)
    ? 'Wieder als aktiv führen unter Stammdaten → Verwaltung.'
    : `Wieder als aktiv führen dürfen die Rollen ${aufzaehlung(
        PRAXISROLLEN.filter((rolle) => canChangePatientStatus([rolle])).map(roleLabel),
      )}.`;

  // UX-005e: Der Grund steht schon im Etikett daneben; der Satz nennt nur
  // noch die Folge und den Weg zurück.
  return <p className="text-ink-muted w-full text-sm">Keine neuen Termine. {weg}</p>;
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
  const darfVerordnen = canWriteTreatmentBases(user.roles);
  const aktiv = patient.status === 'active';
  const ort = useLocation();
  const aktuell = useAktuelleGrundlage(patient.id, user);

  // Die Formulare kehren dorthin zurück, wo sie geöffnet wurden - samt dem
  // Rückweg der Akte selbst, der in der Adresse mitreist (PAT-08, TER-03).
  // Ohne ihn fiel der Termin nach dem Anlegen auf „Zurück zur Patientenliste"
  // zurück, und wer aus dem Kalender kam, fand nicht mehr dorthin.
  const hier = `${ort.pathname}${ort.search}`;
  const zeigtTermin = darfTerminePlanen && aktiv;

  // Ein Knopf allein nutzt am Telefon die ganze Breite, zwei teilen sie sich;
  // ein zweizeiliger Text steht mittig (PAT-18, RSP-18).
  const knopf = 'flex-1 text-center sm:flex-none';

  return (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3 px-4 py-3 sm:px-5 sm:py-4">
      <div className="min-w-0">
        {/* Der Name als Seitentitel: 26 px am Telefon, 32 ab 640 px, in 800
            (Design-Handoff 2026-10-01, Abschnitt 7). */}
        <h1 className="text-accent text-h2-mobil sm:text-h2 tracking-display font-extrabold">
          {fullName(patient)}
        </h1>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <p className="text-ink-muted text-sm">
            {patient.date_of_birth
              ? `geb. ${formatDate(patient.date_of_birth)}${alter !== null ? ` · ${alter} Jahre` : ''}`
              : 'Geburtsdatum nicht hinterlegt'}
            {/* Der Ort sagt im Kopf, wohin es geht - die Anschrift steht im
                Kontakt (Design-Handoff 2026-10-01). */}
            {patient.city ? ` · ${patient.city}` : ''}
          </p>
          {/* UX-005e: Der Regelfall trägt kein Etikett - „In Versorgung" stand
              an jeder Akte und sagte nichts. Nur die Ausnahme ist markiert. */}
          {!aktiv ? <Badge ton="warnung">Nicht in laufender Versorgung</Badge> : null}
          {/* Der Abschluss ist etwas anderes als der Status und gehört in den
              Kopf: Er sagt, dass die Behandlung beendet ist und die
              Aufbewahrung läuft (LOE-001b, ADR-008). */}
          {patient.care_concluded_on ? (
            <Badge>Versorgung abgeschlossen am {formatDate(patient.care_concluded_on)}</Badge>
          ) : null}
        </div>
        {/* AKTE-007: Abrechnungsart und Liege als Abzeichen - die Liege steht
            vor der Tür mit auf dem Zettel (UX-003a), gesetzt wird sie in den
            Stammdaten (ANN-116). */}
        {aktuell || patient.treatment_table_required === true ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {aktuell ? (
              <Badge>{versicherungsart(aktuell.grundlage.treatment_basis_kind)}</Badge>
            ) : null}
            {patient.treatment_table_required === true ? (
              <Badge ton="akzent">Liege mitnehmen</Badge>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Die beiden Vorgänge, die im Alltag aus der Akte heraus entstehen. Alles
          Weitere steht in dem Bereich, zu dem es gehört.

          In der kompakten Größe (44 px, 14 px Schrift): In voller Größe standen
          die beiden bei 375 px untereinander und kosteten den Kopf über hundert
          Pixel Höhe - genau das, was dieser Umbau abstellen soll. Das Tippziel
          bleibt bei 44 px (Oberflächen-Checkliste Punkt 1). Ohne Knopf entfällt
          der Behälter samt seinem Abstand. */}
      {zeigtTermin || darfVerordnen ? (
        <div className="flex w-full gap-2 sm:w-auto">
          {zeigtTermin ? (
            <Link
              to={mitRueckweg(`/patienten/${patient.id}/termine/neu`, hier)}
              className={kartenAktionKlassen('primary', knopf)}
            >
              Termin anlegen
            </Link>
          ) : null}
          {darfVerordnen ? (
            <Link
              to={mitRueckweg(`/patienten/${patient.id}/verordnungen/neu`, hier)}
              className={kartenAktionKlassen('secondary', knopf)}
            >
              Grundlage erfassen
            </Link>
          ) : null}
        </div>
      ) : null}

      {darfTerminePlanen && !aktiv ? <OhneNeueTermine user={user} /> : null}
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
      <header className="border-line bg-surface rounded-card overflow-hidden border">
        <PatientKopf patient={patient} user={user} />
        <KopfHinweise patient={patient} user={user} />
        <Aktenavigation patient={patient} user={user} anhang={anhang} />
      </header>

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
          Wortschatz wie jeder andere Rückweg dorthin (PAT-08, NAV-16). */}
      <Rueckweg standard="/patienten" className="mb-3" />

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
