import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { kartenAktionKlassen } from '@/components/ui/buttonStile';
import { Section } from '@/components/ui/Section';
import { Disclosure } from '@/components/ui/Card';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Tile, TileGrid } from '@/components/ui/Tile';
import { useAktuelleGrundlage } from '@/features/treatment-bases/useAktuelleGrundlage';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Textlink } from '@/components/ui/Textlink';
import { usePatientRecord } from '@/features/patients/akte';
import { WaitlistNotice } from '@/features/waitlist/WaitlistNotice';
import { HausbesucheMitAlterAdresse } from './HausbesucheMitAlterAdresse';
import { formatDate as formatIsoDate } from '@/lib/datum';
import { mitRueckweg } from '@/lib/rueckweg';
import type { Patient } from '@/features/patients/api';
import { canReadTreatmentBases, type CurrentUser } from '@/features/session/types';
import {
  bauartLabels,
  fetchPatientTreatmentBasisSlots,
  grundlageBezeichnung,
  kontingentJeGrundlage,
  type Bauart,
  type TreatmentBasisKontingent,
} from '@/features/treatment-bases/api';
import { deckungstext } from '@/features/treatment-bases/grundlagen';
import { Mitteilungszeichen } from './Mitteilungszeichen';
import { Deckungszeichen } from './Deckungszeichen';
import { Laengenzeichen } from './Laengenzeichen';
import {
  appointmentStatusLabels,
  appointmentStatusTon,
  appointmentTypeHint,
  dayKey,
  fetchPatientAppointments,
  formatLocalDate,
  formatLocalTimeRange,
  naechsteTerminSeite,
  staffName,
  todayInTimeZone,
  type PatientAppointment,
  type TerminCursor,
} from './api';
import { schreibeParameter, ZOOM_STANDARD } from './calendar';
import { NachladeHinweis, Rueckmeldung } from './Rueckmeldungen';
import { leseAngelegtenTermin, leseMeldung } from './terminformular';

/**
 * Der Terminbereich der Akte (AKTE-003, gruppiert seit AKTE-006).
 *
 * Die Akte zeigte bisher fünf künftige Termine und - versteckt im
 * Behandlungsverlauf - die vergangenen als Dokumentationssicht. Die Frage „wann
 * war sie zuletzt da, und was ist noch vereinbart?" ließ sich damit nur über
 * zwei Stellen beantworten, und der abgesagte Termin von vorletzter Woche kam
 * in keiner davon organisatorisch vor.
 *
 * Hier steht beides untereinander: was ansteht, und was war - beides mit allen
 * Zuständen, beides geblättert. Geschrieben wird weiterhin am Termin; diese
 * Liste ist der Weg dorthin.
 *
 * **Seit AKTE-006 steht jeder Termin unter der Überschrift seiner
 * Behandlungsgrundlage**, mit deren Deckung daneben (CAL-022). Termine ohne
 * Grundlage verschwinden dabei nicht: Sie bekommen einen eigenen, so
 * benannten Abschnitt am Ende.
 *
 * Gruppiert wird **innerhalb** der beiden Richtungen und nicht über sie hinweg
 * (**ANN-069**): „Was steht an" und „was war" sind zwei verschiedene Fragen,
 * und beide Listen blättern über einen eigenen Keyset-Cursor. Eine Gruppe je
 * Grundlage über beide Richtungen bräuchte je Grundlage zwei Cursor - und
 * zeigte in einer Akte über zehn Jahre zwanzig Abschnitte, von denen zwei
 * Arbeitsvorrat sind.
 */

/**
 * Wie die Überschrift einer Gruppe heißt (ADR-020 Punkt 7).
 *
 * Die Bauart kommt aus `list_patient_appointments` mit; ohne sie stünde über
 * einem Selbstzahlertermin „Verordnung vom …" — eine Auskunft, die es so nicht
 * gibt. Ohne Datum bleibt das neutrale Oberwort, denn dann ist auch die Bauart
 * keine verlässliche Angabe.
 */
function grundlagenBeschriftung(termin: {
  treatment_basis_kind: string | null;
  treatment_basis_issued_on: string | null;
}): string {
  if (!termin.treatment_basis_issued_on) return 'Zur Behandlungsgrundlage';
  const bauart = termin.treatment_basis_kind as Bauart | null;
  if (!bauart) return `Grundlage vom ${formatIsoDate(termin.treatment_basis_issued_on)}`;
  const { praeposition } = grundlageBezeichnung({ treatment_basis_kind: bauart });
  return `${bauartLabels[bauart]} ${praeposition} ${formatIsoDate(termin.treatment_basis_issued_on)}`;
}

/** Der Filter auf eine Grundlage reist in der Adresse (teilbar, neuladefest). */
const FILTER = 'verordnung';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function Terminzeile({
  termin,
  patientId,
  hervorgehoben,
}: {
  termin: PatientAppointment;
  patientId: string;
  /** Gerade angelegt - beim Zurückkommen aus dem Formular (TER-04). */
  hervorgehoben: boolean;
}) {
  const zone = termin.organization_time_zone;

  return (
    // Die Trennlinie steht zwischen den Zeilen, nicht ueber der ersten: Im
    // weissen Rahmen (UI-002c) waere sie dort eine zweite Kante neben dem
    // Rahmen selbst.
    <li className="border-line border-t first:border-t-0">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2">
        <Link
          to={mitRueckweg(`/termine/${termin.id}`, `/patienten/${patientId}/termine`)}
          // Der eben angelegte Termin trägt die Fläche der aktiven Auswahl;
          // die Bestätigung über der Liste sagt es in Worten (TER-04).
          className={`${hervorgehoben ? 'bg-accent-soft' : 'hover:bg-surface-sunken'} rounded-button -mx-2 flex min-h-11 min-w-48 flex-1 flex-col justify-center px-2 transition-colors`}
        >
          <span className="text-ink text-liste font-medium">
            {formatLocalDate(termin.starts_at, zone)}
          </span>
          <span className="text-ink-muted text-sm">
            {formatLocalTimeRange(termin.starts_at, termin.ends_at, zone)}
            {/* Nur eine abweichende Terminart steht dran (ANN-192). */}
            {appointmentTypeHint(termin.appointment_type)
              ? ` · ${appointmentTypeHint(termin.appointment_type)}`
              : ''}
            {` · ${staffName(termin)}`}
          </span>
        </Link>

        {/* Wege und Zustand beantworten dieselbe Frage: Ist an diesem Termin
            noch etwas zu tun? (CAL-012) */}
        {/* §8.1: weder 45 noch 60 Minuten - gekennzeichnet, nicht verboten
            (CAL-020). Die Akte führt nur Behandlungstermine. */}
        <Laengenzeichen termin={termin} />
        {/* CAL-022: Über dem Kontingent geplant — sichtbar an der Grundlage,
            am Termin und hier. Eine stille Überplanung wäre der
            Abrechnungsfehler, den §13 ausschließt. */}
        <Deckungszeichen gedeckt={termin.treatment_basis_covered} />
        <Mitteilungszeichen kanaele={termin.notification_channels} />
        {termin.status !== 'confirmed' ? (
          <Badge ton={appointmentStatusTon[termin.status]}>
            {appointmentStatusLabels[termin.status]}
          </Badge>
        ) : null}
      </div>
    </li>
  );
}

/**
 * Ein Abschnitt je Behandlungsgrundlage (AKTE-006).
 *
 * `grundlage === null` ist der eigene Abschnitt für alles ohne Klammer — ein
 * Termin, der zu keiner Verordnung und keinem Selbstzahler gehört, ist kein
 * Fehler und wird nicht weggelassen.
 */
interface Terminguppe {
  schluessel: string;
  titel: string;
  kontingent: TreatmentBasisKontingent | null;
  termine: PatientAppointment[];
}

/**
 * Gruppiert die geladenen Termine nach ihrer Grundlage.
 *
 * Die **Reihenfolge der Abschnitte** kommt aus den Kontingentzeilen und ist
 * damit dieselbe wie im Bereich „Behandlungsgrundlagen" (neueste zuerst). Eine
 * Grundlage, die dort fehlt — etwa weil die Zahlen noch laden —, hängt hinten
 * an; „ohne Grundlage" steht immer zuletzt.
 *
 * Gruppiert wird, **was geladen ist**. Die Deckung daneben kommt dagegen vom
 * Server und zählt immer alle Termine der Grundlage: Sie ändert sich deshalb
 * nicht, wenn jemand weiterblättert.
 */
function gruppiere(
  termine: readonly PatientAppointment[],
  kontingente: readonly TreatmentBasisKontingent[],
): Terminguppe[] {
  const reihenfolge = new Map(kontingente.map((zeile, i) => [zeile.treatment_basis_id, i]));
  const zahlen = kontingentJeGrundlage(kontingente);
  const gruppen = new Map<string, Terminguppe>();

  for (const termin of termine) {
    const schluessel = termin.treatment_basis_id ?? OHNE_GRUNDLAGE;
    let gruppe = gruppen.get(schluessel);
    if (!gruppe) {
      gruppe = {
        schluessel,
        titel:
          schluessel === OHNE_GRUNDLAGE
            ? 'Ohne Behandlungsgrundlage'
            : grundlagenBeschriftung(termin),
        kontingent: termin.treatment_basis_id
          ? (zahlen.get(termin.treatment_basis_id) ?? null)
          : null,
        termine: [],
      };
      gruppen.set(schluessel, gruppe);
    }
    gruppe.termine.push(termin);
  }

  const platz = (schluessel: string) =>
    schluessel === OHNE_GRUNDLAGE
      ? Number.MAX_SAFE_INTEGER
      : (reihenfolge.get(schluessel) ?? Number.MAX_SAFE_INTEGER - 1);

  return [...gruppen.values()].sort((a, b) => platz(a.schluessel) - platz(b.schluessel));
}

const OHNE_GRUNDLAGE = 'ohne';

function Gruppenkopf({ gruppe, patientId }: { gruppe: Terminguppe; patientId: string }) {
  const kontingent = gruppe.kontingent;
  const grundlageId = gruppe.schluessel === OHNE_GRUNDLAGE ? null : gruppe.schluessel;

  return (
    <div className="mb-1 flex flex-wrap items-center gap-x-3 gap-y-1">
      {/* Die Überschrift ist zugleich der Weg zur Grundlage — vor AKTE-006
          stand er an jeder einzelnen Zeile und sagte dort immer dasselbe.

          Eine Stufe unter dem Abschnitt (h3 unter h2, TER-16, UIK-20) und
          als Link erkennbar, nicht erst beim Überfahren - mit einem Ziel von
          44 px Höhe (RSP-06, UIK-15, TER-17). */}
      <h3 className="text-ink text-liste font-bold">
        {grundlageId ? (
          <Textlink
            alleinstehend
            to={`/patienten/${patientId}/verordnungen#verordnung-${grundlageId}`}
          >
            {gruppe.titel}
          </Textlink>
        ) : (
          gruppe.titel
        )}
      </h3>
      {/* Die Deckung ist eine Aussage über die Grundlage und steht deshalb an
          der Überschrift (CAL-022). Als Satz und nicht als Abzeichen: Welche
          Termine ungedeckt sind, zeigen die Zeichen in den Zeilen darunter —
          ein zweites Abzeichen hier sagte dasselbe noch einmal. */}
      {kontingent && kontingent.planned > 0 ? (
        <span className="text-ink-muted text-sm">{deckungstext(kontingent)}</span>
      ) : null}
    </div>
  );
}

function Terminliste({
  patientId,
  kuenftig,
  verordnung,
  kontingente,
  leerText,
  weiterText,
  neuerTermin,
}: {
  patientId: string;
  kuenftig: boolean;
  verordnung: string | null;
  kontingente: readonly TreatmentBasisKontingent[];
  leerText: string;
  weiterText: string;
  /** Der gerade angelegte Termin, hervorgehoben (TER-04). */
  neuerTermin: string | null;
}) {
  const seiten = useInfiniteQuery({
    queryKey: ['patient-appointments', patientId, kuenftig, verordnung],
    queryFn: ({ pageParam }) =>
      fetchPatientAppointments(patientId, {
        kuenftig,
        cursor: pageParam,
        verordnung,
      }),
    initialPageParam: null as TerminCursor | null,
    getNextPageParam: (letzteSeite) => naechsteTerminSeite(letzteSeite),
    // Beim Öffnen immer der aktuelle Stand: Wer eben am Termin abgesagt oder
    // abgeschlossen hat, soll das hier sofort sehen.
    staleTime: 0,
    retry: false,
  });

  const termine = seiten.data?.pages.flat() ?? [];

  return (
    <>
      {seiten.isPending ? <LoadingState label="Termine werden geladen …" /> : null}
      {/* Mit dem nächsten Schritt statt einer Ratefrage, und mit dem Weg, es
          gleich noch einmal zu versuchen (WRT-01, UIK-16). Ein gescheitertes
          Weiterblättern meldet sich unten am Knopf. */}
      {seiten.isError && !seiten.data ? (
        <ErrorState
          title="Die Termine konnten nicht geladen werden."
          description="Bitte die Verbindung prüfen und erneut versuchen."
          onErneut={() => void seiten.refetch()}
        />
      ) : null}

      {/* Ein gescheitertes Nachladen nimmt die Liste nicht mit (ZST-03). */}
      {seiten.isRefetchError ? (
        <NachladeHinweis
          className="mb-3"
          laeuft={seiten.isFetching}
          onErneut={() => void seiten.refetch()}
        />
      ) : null}

      {/* Der Leerzustand aus dem Baustein statt eigenem Text (TER-16). */}
      {seiten.data && termine.length === 0 ? <EmptyState title={leerText} /> : null}

      {gruppiere(termine, kontingente).map((gruppe) => (
        <div
          key={gruppe.schluessel}
          // Eine Linie zwischen den Abschnitten, keine über dem ersten: Im
          // weißen Rahmen (UI-002c) wäre sie dort eine zweite Kante.
          className="border-line mt-5 border-t pt-4 first:mt-0 first:border-t-0 first:pt-0"
        >
          <Gruppenkopf gruppe={gruppe} patientId={patientId} />
          <ul>
            {gruppe.termine.map((termin) => (
              <Terminzeile
                key={termin.id}
                termin={termin}
                patientId={patientId}
                hervorgehoben={termin.id === neuerTermin}
              />
            ))}
          </ul>
        </div>
      ))}

      {seiten.hasNextPage ? (
        <div className="mt-3">
          <Button
            type="button"
            variant="secondary"
            disabled={seiten.isFetchingNextPage}
            onClick={() => void seiten.fetchNextPage()}
          >
            {seiten.isFetchingNextPage ? 'Wird geladen …' : weiterText}
          </Button>
          {seiten.isFetchNextPageError ? (
            <Statusmeldung ton="fehler" className="mt-2">
              Die weiteren Termine konnten nicht geladen werden. Bitte die Verbindung prüfen und
              erneut versuchen.
            </Statusmeldung>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

/**
 * Die beiden Kacheln über den Terminen (Design-Handoff 2026-10-01,
 * Abschnitt 7): der nächste Termin und die jüngste Grundlage mit ihren
 * Zahlen. Gelesen wird nichts Neues - der nächste Termin ist die Abfrage, die
 * schon den Weg in den Kalender trägt, die Grundlage dieselbe wie in der
 * Kontextspalte der Akte.
 *
 * Der Hausbesuch trägt kein Wort (ANN-192); eine abweichende Art steht dabei.
 */
function Terminkacheln({
  patient,
  user,
  naechster,
}: {
  patient: Patient;
  user: CurrentUser;
  naechster: PatientAppointment | null;
}) {
  const aktuell = useAktuelleGrundlage(patient.id, user);
  if (!naechster && !aktuell) return null;

  const zone = naechster?.organization_time_zone;
  const heute = zone ? todayInTimeZone(zone) : null;

  return (
    <div className="mb-6">
      <TileGrid spalte="kachel">
        {naechster && zone ? (
          <Tile
            label="Nächster Termin"
            ton="akzent"
            zusatz={[appointmentTypeHint(naechster.appointment_type), staffName(naechster)]
              .filter(Boolean)
              .join(' · ')}
            aktion={
              <Textlink
                alleinstehend
                className="gap-1"
                to={mitRueckweg(`/termine/${naechster.id}`, `/patienten/${patient.id}/termine`)}
              >
                Öffnen
                <span aria-hidden="true">→</span>
              </Textlink>
            }
          >
            {dayKey(naechster.starts_at, zone) === heute
              ? 'Heute'
              : formatLocalDate(naechster.starts_at, zone)}
            <span className="block tabular-nums">
              {formatLocalTimeRange(naechster.starts_at, naechster.ends_at, zone)}
            </span>
          </Tile>
        ) : null}
        {aktuell ? (
          <Tile
            label="Grundlage"
            zusatz={(() => {
              const { bauart, praeposition } = grundlageBezeichnung({
                treatment_basis_kind: aktuell.grundlage.treatment_basis_kind,
              });
              return `${bauart} ${praeposition} ${formatIsoDate(aktuell.grundlage.issued_on)}`;
            })()}
          >
            {aktuell.kontingent ? (
              <>
                {aktuell.kontingent.used} von {aktuell.kontingent.prescribed} verbraucht
                <ProgressBar wert={aktuell.kontingent.used} von={aktuell.kontingent.prescribed} />
              </>
            ) : (
              bauartLabels[aktuell.grundlage.treatment_basis_kind]
            )}
          </Tile>
        ) : null}
      </TileGrid>
    </div>
  );
}

export function PatientAppointmentsPage() {
  const { patient, user } = usePatientRecord();
  return <Terminbereich patient={patient} user={user} />;
}

export function Terminbereich({ patient, user }: { patient: Patient; user: CurrentUser }) {
  const [suche, setSuche] = useSearchParams();
  // Was ein Vorgang beim Hierherkommen mitgibt - „3 Termine angelegt." nach
  // der Serie (TER-04). Ungeprüft, bis `leseMeldung` es liest.
  const zustand: unknown = useLocation().state;
  const eingangsmeldung = leseMeldung(zustand);
  /** Der gerade angelegte Einzeltermin, wenn das Formular hierher zurückkam (TER-04). */
  const neuerTermin = leseAngelegtenTermin(suche);

  const roh = suche.get(FILTER);
  const verordnung = roh && UUID.test(roh) ? roh : null;

  // Der Kalender übernimmt den Patientenfilter und öffnet den Tag, an dem
  // etwas ansteht - ohne Termin den heutigen (AKTE-003). Ohne Praxiszeitzone
  // führt der Weg trotzdem in den Kalender; dort steht dann, warum er sich
  // nicht darstellen lässt.
  // Die Zahlen der Grundlagen tragen die Überschriften der Gruppen und ihre
  // Deckung (AKTE-006, CAL-022). Sie dürfen nachlaufen: Bis sie da sind,
  // stehen die Gruppen mit Bezeichnung und Datum, nur ohne Deckungssatz.
  const kontingente = useQuery({
    queryKey: ['patient-treatment-basis-slots', patient.id],
    queryFn: () => fetchPatientTreatmentBasisSlots(patient.id),
    enabled: canReadTreatmentBases(user.roles),
    retry: false,
  });

  const zone = user.organizationTimeZone;
  const naechster = useQuery({
    queryKey: ['patient-next-appointment', patient.id, verordnung],
    queryFn: () => fetchPatientAppointments(patient.id, { kuenftig: true, limit: 1, verordnung }),
    staleTime: 0,
    retry: false,
  });

  const ersterTermin = naechster.data?.[0] ?? null;
  const kalendertag =
    zone && ersterTermin
      ? dayKey(ersterTermin.starts_at, zone)
      : zone
        ? todayInTimeZone(zone)
        : null;

  const kalenderZiel = `/kalender?${schreibeParameter({
    ansicht: 'tag',
    datum: kalendertag ?? '',
    person: null,
    standort: null,
    status: 'active',
    patient: patient.id,
    // Der Verordnungsfilter reist mit in den Kalender: Wer dort eine freie
    // Stelle antippt, legt den Termin gleich zu dieser Verordnung an
    // (CAL-015c).
    verordnung,
    zoom: ZOOM_STANDARD,
  })}`;

  return (
    <>
      {/* Die Bestätigung steht über den Listen und nimmt den Fokus: Nach dem
          Anlegen sagt die Seite, dass es geklappt hat, statt die neuen
          Termine suchen zu lassen (TER-04). */}
      {eingangsmeldung ? (
        <Rueckmeldung className="mb-6">{eingangsmeldung}</Rueckmeldung>
      ) : neuerTermin ? (
        <Rueckmeldung className="mb-6">Termin angelegt.</Rueckmeldung>
      ) : null}

      {/* ABN-004: Kuenftige Hausbesuche mit alter Adresse, nur mit Auftrag zu
          aendern (ANN-003 Fassung 2). */}
      <HausbesucheMitAlterAdresse patientId={patient.id} user={user} />

      {verordnung ? (
        <div
          role="status"
          className="border-line-strong bg-surface-sunken rounded-card mb-6 flex flex-wrap items-center justify-between gap-3 border px-4 py-3"
        >
          <p className="text-ink text-sm">Nur die Termine einer Behandlungsgrundlage.</p>
          <div className="flex flex-wrap gap-2">
            <ButtonLink
              to={`/patienten/${patient.id}/verordnungen#verordnung-${verordnung}`}
              variant="secondary"
            >
              Zur Grundlage
            </ButtonLink>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                const naechsteSuche = new URLSearchParams(suche);
                naechsteSuche.delete(FILTER);
                setSuche(naechsteSuche, { replace: true });
              }}
            >
              Alle Termine zeigen
            </Button>
          </div>
        </div>
      ) : null}

      <Terminkacheln patient={patient} user={user} naechster={ersterTermin} />

      <Section
        titel="Kommende Termine"
        rahmen
        aktion={
          // Kompakte Größe: Zwei Schaltflächen in voller Höhe schoben den
          // ersten Termin bei 375 px um mehr als hundert Pixel nach unten.
          <div className="flex flex-wrap gap-2">
            <Link
              to={`/patienten/${patient.id}/terminzettel`}
              className={kartenAktionKlassen('secondary')}
            >
              Termine mitteilen
            </Link>
            <Link to={kalenderZiel} className={kartenAktionKlassen('secondary')}>
              Im Kalender zeigen
            </Link>
          </div>
        }
      >
        <Terminliste
          patientId={patient.id}
          kuenftig
          verordnung={verordnung}
          kontingente={kontingente.data ?? []}
          leerText="Kein weiterer Termin vereinbart."
          weiterText="Weitere Termine anzeigen"
          neuerTermin={neuerTermin}
        />
      </Section>

      {/* PRX-001: Wer keinen zeitnahen Termin bekommt, kommt auf die Liste. */}
      <div className="mt-4">
        <WaitlistNotice patientId={patient.id} />
      </div>

      {/* Was war, zugeklappt in einer Karte (Design-Handoff 2026-10-01,
          Abschnitt 7): Die Akte beantwortet zuerst, was ansteht. */}
      <div className="mt-8">
        <Disclosure inKarte kopf="label" summary={<h2>Vergangene Termine</h2>}>
          <p className="text-ink-muted mb-3 text-sm">
            Neueste zuerst, einschließlich abgesagter Termine.
          </p>
          <Terminliste
            patientId={patient.id}
            kuenftig={false}
            verordnung={verordnung}
            kontingente={kontingente.data ?? []}
            leerText="Für diese Person gibt es noch keinen vergangenen Termin."
            weiterText="Ältere Termine anzeigen"
            neuerTermin={neuerTermin}
          />
        </Disclosure>
      </div>
    </>
  );
}
