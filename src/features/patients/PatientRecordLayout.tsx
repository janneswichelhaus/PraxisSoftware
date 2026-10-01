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
import { Card } from '@/components/ui/Card';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Textlink } from '@/components/ui/Textlink';
import { Tile, TileGrid } from '@/components/ui/Tile';
import { intakeItemTarget, openItemsText } from '@/features/open-points/intake-api';
import { useOffeneErstaufnahme } from '@/features/open-points/useOffeneErstaufnahme';
import { grundlageBezeichnung } from '@/features/treatment-bases/api';
import {
  kontingentSatz,
  useAktuelleGrundlage,
} from '@/features/treatment-bases/useAktuelleGrundlage';
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
import { formatDate } from '@/lib/datum';
import { istInternerPfad, mitRueckweg, RUECKWEG_PARAM } from '@/lib/rueckweg';
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
 * Die Hinweise, die vor der Tür zählen (PAT-005, `IDEA-PRX-001`), seit dem
 * Design-Handoff vom 2026-10-01 (Abschnitt 7) als Kachelreihe im Kopf:
 * **Liege**, **Zugangshinweis**, **Besonderheit** und **! Erstaufnahme
 * offen**. Sie ersetzt die Textzeilen darunter und die Zeile `IntakeHint`.
 *
 * Sie standen bis UI-002a auf der Übersicht der Akte. Mit ihr wären sie in die
 * Stammdaten gerutscht und damit hinter einen Bereichswechsel - „Klingel
 * defekt, bitte anrufen" nützt dort niemandem. Deshalb stehen sie im Kopf, und
 * nur, was hinterlegt ist: Ohne Angabe keine Kachel, ohne Kachel keine Reihe.
 *
 * Absätze bleiben stehen und lange Wörter brechen um, wie in den Stammdaten
 * (PAT-13): „2. OG", „Klingel Meier" und „Schlüssel beim Nachbarn" in drei
 * Zeilen liefen sonst zu einer zusammen.
 *
 * Für ein Patientenkonto liefert die Sicht die Felder gar nicht erst; die
 * Kacheln verschwinden dann von allein (ANN-010, ADR-004).
 *
 * Reihen von 150 statt der 160 px des Handoffs: In der Kopfkarte bleiben am
 * Telefon 311 px, und erst bei 150 stehen dort zwei Kacheln nebeneinander -
 * vier untereinander schöben die Bereichsleiste aus dem ersten Bildschirm.
 */
function KopfKacheln({
  patient,
  user,
  aktiv,
}: {
  patient: Patient;
  user: CurrentUser;
  aktiv: boolean;
}) {
  const ort = useLocation();
  const offen = useOffeneErstaufnahme(patient.id, aktiv, user);
  const liege = patient.treatment_table_required === true;
  if (!patient.home_visit_access_note && !patient.special_note && !liege && offen.length === 0) {
    return null;
  }
  const hier = `${ort.pathname}${ort.search}`;

  return (
    <div className="px-4 pb-3 sm:px-5 sm:pb-4">
      <TileGrid spalte="kachel">
        {/* UX-003a: Die Liege steht vor der Tür mit auf dem Zettel - gesetzt
            wird sie in den Stammdaten (ANN-116). */}
        {liege ? (
          <Tile label="Liege" ton="akzent">
            mitnehmen
          </Tile>
        ) : null}
        {patient.home_visit_access_note ? (
          <Tile label="Zugangshinweis">
            <span className="block whitespace-pre-line">{patient.home_visit_access_note}</span>
          </Tile>
        ) : null}
        {patient.special_note ? (
          <Tile label="Besonderheit">
            <span className="block whitespace-pre-line">{patient.special_note}</span>
          </Tile>
        ) : null}
        {/* PRX-013: was zur Erstaufnahme noch fehlt - nur, solange etwas
            fehlt. Der Weg führt zum ersten offenen Punkt. */}
        {offen.length > 0 ? (
          <Tile
            label="Erstaufnahme offen"
            ton="warnung"
            aktion={
              <Textlink
                alleinstehend
                className="gap-1"
                to={mitRueckweg(intakeItemTarget(patient.id, offen[0]!), hier)}
              >
                Erledigen
                <span aria-hidden="true">→</span>
              </Textlink>
            }
          >
            {openItemsText(offen)}
          </Tile>
        ) : null}
      </TileGrid>
    </div>
  );
}

/**
 * Die Kontextspalte der Akte ab 900 px Inhaltsbreite (Design-Handoff
 * 2026-10-01, Abschnitt 7): die jüngste Behandlungsgrundlage mit ihren Zahlen
 * und der Kontakt. Darunter steht sie unter dem offenen Bereich.
 *
 * Nur, was die Rolle ohnehin liest: Die Grundlage kommt aus den
 * organisatorischen Lesepfaden der Akte (`useAktuelleGrundlage`), der Kontakt
 * aus dem bereits geladenen Datensatz. Fehlt beides, gibt es keine Spalte.
 */
function useKontext(patient: Patient, user: CurrentUser) {
  const aktuell = useAktuelleGrundlage(patient.id, user);
  const strasse = [patient.street, patient.house_number].filter(Boolean).join(' ');
  const ort = [patient.postal_code, patient.city].filter(Boolean).join(' ');
  // In den Stammdaten steht der Kontakt schon als eigener Abschnitt - dort
  // trägt die Spalte ihn nicht ein zweites Mal.
  const { pathname } = useLocation();
  const hatKontakt =
    !pathname.endsWith('/stammdaten') &&
    Boolean(patient.phone_mobile || patient.phone || patient.email || strasse || ort);
  return { aktuell, hatKontakt, strasse, ort };
}

function Kontextspalte({
  patient,
  kontext,
}: {
  patient: Patient;
  kontext: ReturnType<typeof useKontext>;
}) {
  const { aktuell, hatKontakt, strasse, ort } = kontext;
  return (
    <aside aria-label="Zur Person" className="flex min-w-0 flex-col gap-4">
      {aktuell ? (
        <Card>
          <h2 className="text-ink-muted tracking-label text-xs font-semibold uppercase">
            Behandlungsgrundlage
          </h2>
          <p className="text-ink text-liste mt-1 font-semibold">
            {(() => {
              const { bauart, praeposition } = grundlageBezeichnung({
                treatment_basis_kind: aktuell.grundlage.treatment_basis_kind,
              });
              return `${bauart} ${praeposition} ${formatDate(aktuell.grundlage.issued_on)}`;
            })()}
          </p>
          {aktuell.grundlage.prescriber_name ? (
            <p className="text-ink-muted text-sm">{aktuell.grundlage.prescriber_name}</p>
          ) : null}
          {aktuell.kontingent ? (
            <>
              <ProgressBar wert={aktuell.kontingent.used} von={aktuell.kontingent.prescribed} />
              <p className="text-ink-muted mt-1.5 text-sm">{kontingentSatz(aktuell.kontingent)}</p>
            </>
          ) : null}
          <Textlink
            alleinstehend
            className="gap-1 text-sm"
            to={`/patienten/${patient.id}/verordnungen`}
          >
            Zu den Grundlagen
            <span aria-hidden="true">→</span>
          </Textlink>
        </Card>
      ) : null}
      {hatKontakt ? (
        <Card>
          <h2 className="text-ink-muted tracking-label text-xs font-semibold uppercase">Kontakt</h2>
          <dl className="mt-1 flex flex-col gap-2 text-sm">
            {patient.phone_mobile || patient.phone ? (
              <div>
                <dt className="text-ink-muted">{patient.phone_mobile ? 'Mobil' : 'Telefon'}</dt>
                <dd>
                  <Textlink
                    alleinstehend
                    className="tabular-nums"
                    href={`tel:${(patient.phone_mobile ?? patient.phone ?? '').replace(/[^+\d]/g, '')}`}
                  >
                    {patient.phone_mobile ?? patient.phone}
                  </Textlink>
                </dd>
              </div>
            ) : null}
            {patient.email ? (
              <div>
                <dt className="text-ink-muted">E-Mail</dt>
                <dd className="wrap-anywhere">
                  <Textlink alleinstehend href={`mailto:${patient.email}`}>
                    {patient.email}
                  </Textlink>
                </dd>
              </div>
            ) : null}
            {strasse || ort ? (
              <div>
                <dt className="text-ink-muted">Anschrift</dt>
                <dd className="text-ink">
                  {strasse ? <span className="block">{strasse}</span> : null}
                  {ort ? <span className="block">{ort}</span> : null}
                </dd>
              </div>
            ) : null}
          </dl>
        </Card>
      ) : null}
    </aside>
  );
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

function Akte({ patient, user, anhang }: { patient: Patient; user: CurrentUser; anhang: string }) {
  const kontext = useKontext(patient, user);
  const mitSpalte = Boolean(kontext.aktuell) || kontext.hatKontakt;
  return (
    <>
      <header className="border-line bg-surface rounded-card overflow-hidden border">
        <PatientKopf patient={patient} user={user} />
        <KopfKacheln patient={patient} user={user} aktiv={patient.status === 'active'} />
        <Aktenavigation patient={patient} user={user} anhang={anhang} />
      </header>

      {/* Zwei Spalten ab 900 px Inhaltsbreite, wie auf Übersicht und Termin;
          darunter steht die Kontextspalte unter dem offenen Bereich. */}
      <div className="@container mt-6">
        <div
          className={
            mitSpalte
              ? '@zweispaltig:grid-cols-[minmax(0,1fr)_minmax(280px,340px)] @zweispaltig:gap-x-8 grid items-start gap-6'
              : ''
          }
        >
          <div className="min-w-0">
            <Outlet context={{ patient, user } satisfies PatientRecordContext} />
          </div>
          {mitSpalte ? <Kontextspalte patient={patient} kontext={kontext} /> : null}
        </div>
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
      {/* Laden in einer Karte (Design-Handoff 2026-10-01, Abschnitt 3). */}
      {isPending ? (
        <Card>
          <LoadingState label="Patientendaten werden geladen …" />
        </Card>
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
