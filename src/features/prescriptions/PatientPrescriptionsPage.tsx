import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/Badge';
import { DetailList, DetailRow } from '@/components/ui/DetailList';
import { Section } from '@/components/ui/Section';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/Feedback';
import {
  canManageAppointments,
  canReadClinicalPatientFiles,
  canWritePrescriptions,
  type CurrentUser,
} from '@/features/session/types';
import { formatDate } from '@/lib/datum';
import { Dateiliste } from '@/features/files/Dateiliste';
import { usePatientRecord } from '@/features/patients/akte';
import { todayInTimeZone } from '@/features/appointments/api';
import { ZOOM_STANDARD, schreibeParameter } from '@/features/appointments/calendar';
import type { Patient } from '@/features/patients/api';
import {
  nachJahr,
  prescriptionKindLabels,
  type ClinicalPrescription,
  type PrescriptionKontingent,
} from './api';
import {
  useVerordnungenDerAkte,
  zustandLabels,
  type Verordnung,
  type VerordnungMitZahlen,
} from './verordnungen';

/**
 * Verordnungen in der Akte (VER-002, überarbeitet mit AKTE-002).
 *
 * Der Bereich beantwortet zwei verschiedene Fragen, und deshalb steht er in
 * zwei Teilen da:
 *
 *   * **Was läuft gerade?** Die offenen Verordnungen, ausführlich, mit den
 *     Zahlen, die für die nächste Terminplanung zählen.
 *   * **Was war?** Die ausgeschöpften, kompakt in einer Zeile und auf Wunsch
 *     aufklappbar. Vorher standen sie gleichrangig zwischen den laufenden und
 *     schoben sie aus dem Bild.
 *
 * Welche Felder überhaupt ankommen, entscheidet die Datenbank über zwei
 * Serverfunktionen (ADR-004, ANN-011). Diese Datei blendet nichts aus.
 */

/**
 * Die Zahlen einer Verordnung - **getrennt** nach Einheiten und Terminen.
 *
 * Vorher stand über beidem dasselbe Wort „Kontingent": die Akte zeigte „noch 3
 * von 10" aus den Positionen, die Serienseite unter demselben Namen die um die
 * verplanten Termine verminderte Zahl. Zwei Zahlen, ein Wort - und im Zweifel
 * ein Termin zu viel.
 *
 * Jetzt trägt jede Zeile ihre Einheit im Namen: Leistungseinheiten kommen von
 * den Positionen der Verordnung, Termine von den Terminen (ANN-012, ANN-038).
 */
function Kontingentzeilen({
  kontingent,
  terminlink,
}: {
  kontingent: PrescriptionKontingent | null;
  terminlink: string;
}) {
  if (!kontingent) return null;
  const offeneEinheiten = Math.max(kontingent.prescribed - kontingent.used, 0);

  return (
    <>
      <DetailRow label="Leistungseinheiten">
        {kontingent.used} von {kontingent.prescribed} genutzt
        {offeneEinheiten > 0 ? ` · ${offeneEinheiten} offen` : ''}
      </DetailRow>
      <DetailRow label="Termine">
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>
            {kontingent.planned === 0
              ? 'Noch kein Termin zugeordnet'
              : `${kontingent.planned} zugeordnet · ${kontingent.upcoming} bevorstehend`}
          </span>
          {kontingent.planned > 0 ? (
            <Link to={terminlink} className="text-accent text-sm hover:underline">
              Termine dieser Verordnung
            </Link>
          ) : null}
        </span>
      </DetailRow>
      {/* Die dritte Zahl ist keine der beiden ersten: Sie sagt, wie viele
          Termine sich noch anlegen lassen - verordnet abzüglich des größeren
          Werts aus genutzt und verplant (ANN-038). Genau diese Zahl schlägt
          die Serienplanung vor. */}
      <DetailRow label="Noch planbar">
        {kontingent.remaining === 0
          ? 'Nichts mehr — jede verordnete Einheit ist genutzt oder verplant'
          : `${kontingent.remaining} ${kontingent.remaining === 1 ? 'Behandlung' : 'Behandlungen'}`}
      </DetailRow>
    </>
  );
}

function klinischeFelder(verordnung: Verordnung): ClinicalPrescription | null {
  return 'diagnosis' in verordnung ? verordnung : null;
}

function Verordnungskopf({ verordnung }: { verordnung: Verordnung }) {
  return (
    <div className="min-w-0">
      <p className="text-ink text-[0.9375rem] font-medium">
        {prescriptionKindLabels[verordnung.prescription_kind]} vom{' '}
        {formatDate(verordnung.issued_on)}
      </p>
      <p className="text-ink-muted mt-0.5 text-sm">
        {[verordnung.prescriber_name, verordnung.prescriber_practice_name]
          .filter(Boolean)
          .join(' · ')}
      </p>
    </div>
  );
}

/**
 * Die Positionen als Wert einer Zeile, nicht als eigene Tabelle.
 *
 * Sie sagen dasselbe wie die Summe darüber, nur je Heilmittel. Als eigener
 * Block mit Rahmen wirkten sie wie eine zweite, widersprechende Zahl.
 */
function Positionen({ verordnung }: { verordnung: Verordnung }) {
  return (
    <ul>
      {verordnung.items.map((item) => (
        <li key={item.id}>
          {item.remedy}: {item.used_quantity} von {item.prescribed_quantity} genutzt
        </li>
      ))}
    </ul>
  );
}

/** Hat die Verordnung außer ihren Zahlen überhaupt etwas zu sagen? */
function hatWeitereAngaben(verordnung: Verordnung): boolean {
  const klinisch = klinischeFelder(verordnung);
  return Boolean(
    verordnung.frequency_note ||
    verordnung.note ||
    klinisch?.diagnosis ||
    klinisch?.therapy_goal ||
    klinisch?.prescriber_note ||
    klinisch?.follow_up_recommendation,
  );
}

function KlinischeAngaben({ verordnung }: { verordnung: Verordnung }) {
  const klinisch = klinischeFelder(verordnung);
  return (
    <>
      {verordnung.frequency_note ? (
        <DetailRow label="Frequenz">{verordnung.frequency_note}</DetailRow>
      ) : null}
      {klinisch?.diagnosis ? <DetailRow label="Diagnose">{klinisch.diagnosis}</DetailRow> : null}
      {klinisch?.therapy_goal ? (
        <DetailRow label="Therapieziel">{klinisch.therapy_goal}</DetailRow>
      ) : null}
      {klinisch?.prescriber_note ? (
        <DetailRow label="Hinweis der Verordner:in">{klinisch.prescriber_note}</DetailRow>
      ) : null}
      {klinisch?.follow_up_recommendation ? (
        <DetailRow label="Empfehlung der Therapeut:in zum Verordnungsende">
          {klinisch.follow_up_recommendation}
        </DetailRow>
      ) : null}
      {verordnung.note ? <DetailRow label="Bemerkung">{verordnung.note}</DetailRow> : null}
    </>
  );
}

/**
 * Die Aktionen einer Verordnung - passend zu ihrem Zustand.
 *
 * „Terminserie anlegen" steht nur dort, wo sich noch etwas planen lässt. An
 * einer ausgeschöpften Verordnung führte der Knopf bisher auf eine Seite, die
 * „0 Termine" vorschlug: ein Angebot, das keins war (PROJECT_PRINCIPLES.md 13).
 * Wer eine Verordnung schreiben darf, kann sie dagegen in jedem Zustand
 * korrigieren - auch ein Tippfehler in einer alten Verordnung gehört behoben.
 */
function Verordnungsaktionen({
  eintrag,
  patient,
  user,
}: {
  eintrag: VerordnungMitZahlen;
  patient: Patient;
  user: CurrentUser;
}) {
  const { verordnung, zustand } = eintrag;
  const darfPlanen = canManageAppointments(user.roles);
  const darfSchreiben = canWritePrescriptions(user.roles);
  const planbar = zustand === 'offen' && patient.status === 'active';

  /**
   * Der Weg in den vollständigen Kalender, mit Patient:in und Verordnung als
   * Kontext (CAL-015c).
   *
   * Die Tagesansicht von heute ist der Ausgangspunkt; von dort wird
   * geblättert und gescrollt. Wer eine freie Stelle antippt, landet im
   * Terminformular dieser Person, und der Termin kennt seine Verordnung -
   * ohne dass jemand beides noch einmal sucht.
   */
  const kalenderZiel = `/kalender?${schreibeParameter({
    ansicht: 'tag',
    datum: user.organizationTimeZone ? todayInTimeZone(user.organizationTimeZone) : '',
    person: null,
    standort: null,
    status: 'active',
    patient: patient.id,
    verordnung: verordnung.id,
    zoom: ZOOM_STANDARD,
  })}`;

  if (!darfPlanen && !darfSchreiben) return null;

  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
      {/* Die Serie hängt an der Verordnung, weil dort das Kontingent steht
          (CAL-007). Wer Termine plant, sieht sie - das ist ein anderes Recht
          als das Schreiben der Verordnung (ADR-004). */}
      {darfPlanen && planbar ? (
        <Link
          to={`/patienten/${patient.id}/verordnungen/${verordnung.id}/serie`}
          className="text-accent inline-flex min-h-11 items-center text-sm hover:underline"
        >
          Terminserie anlegen
        </Link>
      ) : null}
      {/* Der zweite Weg neben der Serie: in den vollständigen Kalender wechseln,
          dort scrollen und eine freie Stelle antippen (CAL-015c). Patient:in
          und Verordnung reisen als Kontext mit - im Formular steht danach
          beides schon fest. Die Serie plant im Raster, dieser Weg sucht die
          Lücke. */}
      {darfPlanen && planbar ? (
        <Link
          to={kalenderZiel}
          className="text-accent inline-flex min-h-11 items-center text-sm hover:underline"
        >
          Im Kalender einen Platz suchen
        </Link>
      ) : null}
      {darfSchreiben ? (
        <Link
          to={`/patienten/${patient.id}/verordnungen/${verordnung.id}/bearbeiten`}
          className="text-accent inline-flex min-h-11 items-center text-sm hover:underline"
        >
          Bearbeiten
        </Link>
      ) : null}
    </div>
  );
}

function terminlink(patientId: string, verordnungId: string): string {
  return `/patienten/${patientId}/termine?verordnung=${verordnungId}`;
}

/**
 * Der Scan des Rezepts an seiner Verordnung (VER-004, ADR-017).
 *
 * Er steht hier und nicht im Bereich „Dateien", weil er zu genau diesem
 * Auftrag gehört: Ohne Bezugsdatensatz hätte er weder Berechtigung noch Frist
 * (ADR-017 Punkt 10). Im Bereich „Dateien" taucht er trotzdem auf — gelesen
 * wird derselbe Pfad.
 *
 * **Nur für die behandelnden Rollen.** Der Scan ist klinisch, obwohl `office`
 * die Verordnungsdaten organisatorisch sieht (ANN-011, Punkt 12): Ein Scan
 * zeigt das ganze Blatt samt Diagnose und lässt sich nicht projizieren. Der
 * Server liefert `office` die Zeile ohnehin nicht; der Block bleibt hier
 * trotzdem weg, damit dort keine leere Fläche steht, die eine Datei vermuten
 * lässt.
 */
function Verordnungsscan({
  patientId,
  verordnungId,
  user,
}: {
  patientId: string;
  verordnungId: string;
  user: CurrentUser;
}) {
  if (!canReadClinicalPatientFiles(user.roles)) return null;

  return (
    <div className="border-line mt-3 border-t pt-3">
      <p className="text-ink text-sm font-medium">Scan des Rezepts</p>
      <Dateiliste
        patientId={patientId}
        user={user}
        prescriptionId={verordnungId}
        darfHinzufuegen={canWritePrescriptions(user.roles)}
        leerHinweis="Noch kein Scan. Ein Foto des Rezepts hält fest, was auf dem Blatt steht."
      />
    </div>
  );
}

/** Eine laufende Verordnung: ausführlich, weil an ihr gearbeitet wird. */
function LaufendeVerordnung({
  eintrag,
  patient,
  user,
}: {
  eintrag: VerordnungMitZahlen;
  patient: Patient;
  user: CurrentUser;
}) {
  const { verordnung, kontingent, zustand } = eintrag;
  const weitereAngaben = hatWeitereAngaben(verordnung);

  return (
    <li
      // Die Kennung macht die Verordnung aus der Terminliste anspringbar - der
      // Rückweg zu „aus welcher Verordnung stammt dieser Termin".
      id={`verordnung-${verordnung.id}`}
      className="border-line bg-surface rounded-card target:ring-accent border p-4 target:ring-2"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <Verordnungskopf verordnung={verordnung} />
        <Badge ton={zustand === 'offen' ? 'akzent' : 'neutral'}>{zustandLabels[zustand]}</Badge>
      </div>

      {/* Zwei Spalten, sobald es beides gibt: Zahlen links, Angaben rechts.
          In einer einzigen Spalte lief die Karte auf dem Desktop über die
          volle Breite, obwohl in jeder Zeile drei Wörter standen - und sie
          wurde so hoch, dass die zweite Verordnung aus dem Bild fiel. */}
      <div className={`grid gap-x-8 ${weitereAngaben ? 'lg:grid-cols-2' : ''}`}>
        <DetailList>
          <Kontingentzeilen
            kontingent={kontingent}
            terminlink={terminlink(patient.id, verordnung.id)}
          />
          {/* Mehr als eine Position ist der Regelfall bei Kombinationen; bei
              einer einzigen sagt die Positionsliste nichts, was oben nicht
              steht. */}
          {verordnung.items.length > 1 ? (
            <DetailRow label="Positionen">
              <Positionen verordnung={verordnung} />
            </DetailRow>
          ) : null}
        </DetailList>

        {weitereAngaben ? (
          <DetailList>
            <KlinischeAngaben verordnung={verordnung} />
          </DetailList>
        ) : null}
      </div>

      <Verordnungsaktionen eintrag={eintrag} patient={patient} user={user} />
      <Verordnungsscan patientId={patient.id} verordnungId={verordnung.id} user={user} />
    </li>
  );
}

/**
 * Eine ausgeschöpfte Verordnung: eine Zeile, aufklappbar.
 *
 * Sie gehört in die Akte - was behandelt wurde, bleibt nachvollziehbar -, aber
 * sie ist keine Arbeitsaufgabe mehr. Zugeklappt ist sie eine Zeile statt einer
 * halben Bildschirmhöhe.
 */
function AbgeschlosseneVerordnung({
  eintrag,
  patient,
  user,
}: {
  eintrag: VerordnungMitZahlen;
  patient: Patient;
  user: CurrentUser;
}) {
  const { verordnung, kontingent } = eintrag;

  return (
    <li id={`verordnung-${verordnung.id}`} className="border-line border-t">
      <details className="group">
        <summary className="hover:bg-surface-sunken flex min-h-11 cursor-pointer flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5">
          <span className="text-ink min-w-0 text-[0.9375rem]">
            {prescriptionKindLabels[verordnung.prescription_kind]} vom{' '}
            {formatDate(verordnung.issued_on)}
            <span className="text-ink-muted mt-0.5 block text-sm">
              {verordnung.prescriber_name}
              {kontingent
                ? ` · ${kontingent.used} von ${kontingent.prescribed} Einheiten genutzt · ${kontingent.planned} Termine`
                : ''}
            </span>
          </span>
          <span className="text-ink-subtle text-xs">Details</span>
        </summary>

        <div className="pb-3">
          <DetailList>
            <Kontingentzeilen
              kontingent={kontingent}
              terminlink={terminlink(patient.id, verordnung.id)}
            />
            {verordnung.items.length > 1 ? (
              <DetailRow label="Positionen">
                <Positionen verordnung={verordnung} />
              </DetailRow>
            ) : null}
            <KlinischeAngaben verordnung={verordnung} />
          </DetailList>
          <Verordnungsaktionen eintrag={eintrag} patient={patient} user={user} />
          <Verordnungsscan patientId={patient.id} verordnungId={verordnung.id} user={user} />
        </div>
      </details>
    </li>
  );
}

export function PatientPrescriptionsPage() {
  const { patient, user } = usePatientRecord();
  return <Verordnungsbereich patient={patient} user={user} />;
}

export function Verordnungsbereich({ patient, user }: { patient: Patient; user: CurrentUser }) {
  const { aktuell, abgeschlossen, isPending, isError, verborgen } = useVerordnungenDerAkte(
    patient.id,
    user,
  );

  if (verborgen) return null;

  const darfSchreiben = canWritePrescriptions(user.roles);

  return (
    <>
      {/* Bewusst ohne eigene Schaltfläche „Verordnung erfassen": Sie steht im
          Kopf der Akte und ist dort aus jedem Bereich erreichbar. Zwei
          gleichnamige Wege auf einer Seite wären ein Rätsel, kein Angebot -
          derselbe Grund wie bei „Termin anlegen" (UX-006). */}
      <Section
        titel="Aktuelle Verordnungen"
        hinweis="Verordnungen, deren Leistungseinheiten noch nicht vollständig genutzt sind."
      >
        {isPending ? <LoadingState label="Verordnungen werden geladen …" /> : null}
        {isError ? (
          <ErrorState
            title="Die Verordnungen konnten nicht geladen werden."
            description="Bitte später erneut versuchen. Sind Sie noch angemeldet?"
          />
        ) : null}

        {!isPending && !isError && aktuell.length === 0 ? (
          <EmptyState
            title="Keine laufende Verordnung"
            description={
              darfSchreiben
                ? 'Die nächste Verordnung entsteht über „Verordnung erfassen".'
                : 'Verordnungen erfassen die therapeutischen Rollen.'
            }
          />
        ) : null}

        {aktuell.length > 0 ? (
          <ul className="flex flex-col gap-3">
            {aktuell.map((eintrag) => (
              <LaufendeVerordnung
                key={eintrag.verordnung.id}
                eintrag={eintrag}
                patient={patient}
                user={user}
              />
            ))}
          </ul>
        ) : null}
      </Section>

      {abgeschlossen.length > 0 ? (
        <Section
          titel="Ausgeschöpfte Verordnungen"
          hinweis="Nach Jahr, neueste zuerst. Eine Zeile je Verordnung — aufklappen zeigt alles."
        >
          {/* Nach Jahr gruppiert wie bisher (VER-002): Eine Akte über zehn
              Jahre ist sonst eine Liste ohne Anhaltspunkt; das Jahr ist das,
              wonach im Gespräch gesucht wird. */}
          {nachJahr(abgeschlossen.map((eintrag) => eintrag.verordnung)).map(
            ({ jahr, verordnungen }) => (
              <Section key={jahr} titel={jahr} ebene={3}>
                <ul className="border-line border-b">
                  {verordnungen.map((verordnung) => {
                    const eintrag = abgeschlossen.find((e) => e.verordnung.id === verordnung.id)!;
                    return (
                      <AbgeschlosseneVerordnung
                        key={verordnung.id}
                        eintrag={eintrag}
                        patient={patient}
                        user={user}
                      />
                    );
                  })}
                </ul>
              </Section>
            ),
          )}
        </Section>
      ) : null}
    </>
  );
}
