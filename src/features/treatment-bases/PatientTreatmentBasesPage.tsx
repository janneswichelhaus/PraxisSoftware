import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/Badge';
import { DetailList, DetailRow } from '@/components/ui/DetailList';
import { Section } from '@/components/ui/Section';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/Feedback';
import {
  canManageAppointments,
  canReadClinicalPatientFiles,
  canWriteTreatmentBases,
  type CurrentUser,
} from '@/features/session/types';
import { formatDate } from '@/lib/datum';
import { Dateiliste } from '@/features/files/Dateiliste';
import { usePatientRecord } from '@/features/patients/akte';
import { todayInTimeZone } from '@/features/appointments/api';
import { Deckungszeichen } from '@/features/appointments/Deckungszeichen';
import { ZOOM_STANDARD, schreibeParameter } from '@/features/appointments/calendar';
import type { Patient } from '@/features/patients/api';
import {
  BerichteDerVerordnung,
  EmpfehlungAusBericht,
} from '@/features/therapy-reports/BerichteDerVerordnung';
import { useBerichteDerAkte } from '@/features/therapy-reports/useBerichteDerAkte';
import { empfehlungDerVerordnung, type Berichtszeile } from '@/features/therapy-reports/api';
import {
  nachJahr,
  grundlageBezeichnung,
  istVerordnung,
  type ClinicalTreatmentBasis,
  type TreatmentBasisKontingent,
} from './api';
import {
  deckungstext,
  useVerordnungenDerAkte,
  zustandLabels,
  type Verordnung,
  type VerordnungMitZahlen,
} from './grundlagen';

/**
 * Behandlungsgrundlagen in der Akte (VER-002, überarbeitet mit AKTE-002,
 * seit GRD-001 beide Bauarten).
 *
 * Der Bereich beantwortet zwei verschiedene Fragen, und deshalb steht er in
 * zwei Teilen da:
 *
 *   * **Was läuft gerade?** Die offenen Grundlagen, ausführlich, mit den
 *     Zahlen, die für die nächste Terminplanung zählen.
 *   * **Was war?** Die ausgeschöpften, kompakt in einer Zeile und auf Wunsch
 *     aufklappbar. Vorher standen sie gleichrangig zwischen den laufenden und
 *     schoben sie aus dem Bild.
 *
 * Welche Felder überhaupt ankommen, entscheidet die Datenbank über zwei
 * Serverfunktionen (ADR-004, ANN-011). Diese Datei blendet nichts aus.
 */

/**
 * Die Zahlen einer Grundlage — seit VER-EPIC-002 alle drei in **Terminen**.
 *
 * Vorher stand über zwei verschiedenen Größen dasselbe Wort „Kontingent", und
 * die obere Zahl war die Summe der Positionen: eine Verordnung über sechs
 * Termine mit drei Heilmitteln zeigte achtzehn. Jetzt zählt jede Zeile
 * Behandlungstermine — möglich, genutzt, verplant, noch planbar (ANN-064,
 * ANN-038). Die Leistungsmenge je Heilmittel steht getrennt darunter.
 */
function Kontingentzeilen({
  kontingent,
  terminlink,
}: {
  kontingent: TreatmentBasisKontingent | null;
  terminlink: string;
}) {
  if (!kontingent) return null;

  return (
    <>
      <DetailRow label="Mögliche Termine">
        {kontingent.prescribed}
        {/* „Genutzt" pflegt bis ABR-002 niemand mehr von Hand (ANN-064). Die
            Zeile steht deshalb nur da, wo tatsächlich etwas verbraucht ist -
            ein dauerhaftes „0 von 6 genutzt" wäre eine Zahl ohne Aussage. */}
        {kontingent.used > 0 ? ` · ${kontingent.used} genutzt` : ''}
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
      {/* CAL-022: Ueber das Kontingent hinaus zu planen ist zulaessig - still
          bleiben darf es nicht. Die Zeile steht nur da, wo etwas ungedeckt
          ist; ein „alles gedeckt" an jeder Grundlage waere Rauschen. */}
      {kontingent.uncovered > 0 ? (
        <DetailRow label="Deckung">
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>{deckungstext(kontingent)}</span>
            {/* Dasselbe Zeichen wie am einzelnen Termin - die Zahl steht schon
                im Satz daneben und wird hier nicht wiederholt. */}
            <Deckungszeichen gedeckt={false} />
          </span>
        </DetailRow>
      ) : null}
      {/* Die dritte Zahl ist keine der beiden ersten: Sie sagt, wie viele
          Termine sich noch anlegen lassen - möglich abzüglich des größeren
          Werts aus genutzt und verplant (ANN-038). Genau diese Zahl schlägt
          die Serienplanung vor. */}
      <DetailRow label="Noch planbar">
        {kontingent.remaining === 0
          ? 'Nichts mehr — jeder mögliche Termin ist genutzt oder verplant'
          : `${kontingent.remaining} ${kontingent.remaining === 1 ? 'Behandlung' : 'Behandlungen'}`}
      </DetailRow>
    </>
  );
}

function klinischeFelder(verordnung: Verordnung): ClinicalTreatmentBasis | null {
  return 'diagnosis' in verordnung ? verordnung : null;
}

/**
 * Die Überschrift einer Grundlage nennt ihre **Bauart** (ADR-020 Punkt 7).
 *
 * „Erstverordnung vom 5. Februar 2026" oder „Selbstzahler seit 3. September
 * 2026" - das Wort Behandlungsgrundlage steht nur über dem Bereich, wo beide
 * Bauarten zugleich gemeint sind. Die Zeile darunter bleibt beim Selbstzahler
 * leer statt zu behaupten, es gäbe eine Verordner:in.
 */
function Grundlagentitel({ verordnung }: { verordnung: Verordnung }) {
  const { bauart, praeposition } = grundlageBezeichnung(verordnung);
  return (
    <>
      {bauart} {praeposition} {formatDate(verordnung.issued_on)}
    </>
  );
}

function Verordnungskopf({ verordnung }: { verordnung: Verordnung }) {
  const verordner = [verordnung.prescriber_name, verordnung.prescriber_practice_name]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="min-w-0">
      <p className="text-ink text-[0.9375rem] font-medium">
        <Grundlagentitel verordnung={verordnung} />
      </p>
      {verordner ? <p className="text-ink-muted mt-0.5 text-sm">{verordner}</p> : null}
    </div>
  );
}

/**
 * Die Heilmittel als Wert einer Zeile, nicht als eigene Tabelle.
 *
 * Seit VER-EPIC-002 sagen sie etwas anderes als die Zahl darüber: Die
 * Terminzahl steht an der Grundlage, die **Leistungsmenge** an der Position
 * (ANN-064). Die Menge steht deshalb nur dort, wo sie von der Terminzahl
 * abweicht oder schon etwas verbraucht ist — sonst wiederholte sie die Zeile
 * darüber und sähe aus wie eine zweite, widersprechende Zahl.
 */
function Heilmittel({
  verordnung,
  moeglicheTermine,
}: {
  verordnung: Verordnung;
  moeglicheTermine: number | null;
}) {
  return (
    <ul>
      {verordnung.items.map((item) => {
        const abweichend =
          moeglicheTermine !== null && item.prescribed_quantity !== moeglicheTermine;
        let menge = '';
        if (item.used_quantity > 0) {
          menge = ` — ${item.used_quantity} von ${item.prescribed_quantity} genutzt`;
        } else if (abweichend) {
          menge = ` — ${item.prescribed_quantity} verordnet`;
        }
        return (
          <li key={item.id}>
            {item.remedy}
            {menge}
          </li>
        );
      })}
    </ul>
  );
}

/** Hat die Verordnung außer ihren Zahlen überhaupt etwas zu sagen? */
function hatWeitereAngaben(verordnung: Verordnung, berichte: readonly Berichtszeile[]): boolean {
  const klinisch = klinischeFelder(verordnung);
  return Boolean(
    empfehlungDerVerordnung(berichte, verordnung.id) ||
    verordnung.frequency_note ||
    verordnung.note ||
    klinisch?.diagnosis ||
    klinisch?.therapy_goal ||
    klinisch?.prescriber_note ||
    klinisch?.follow_up_recommendation,
  );
}

function KlinischeAngaben({
  verordnung,
  berichte,
}: {
  verordnung: Verordnung;
  berichte: readonly Berichtszeile[];
}) {
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
      {/* Zwei Bestandsfelder aus der Zeit vor VER-EPIC-002: Sie werden nicht
          mehr erfasst, aber weiter angezeigt, solange etwas darin steht.
          ANN-014 bleibt gültig — die Anwendung erzeugt keine Empfehlung. */}
      {klinisch?.prescriber_note ? (
        <DetailRow label="Hinweis der Verordner:in">{klinisch.prescriber_note}</DetailRow>
      ) : null}
      {klinisch?.follow_up_recommendation ? (
        <DetailRow label="Empfehlung der Therapeut:in zum Verordnungsende">
          {klinisch.follow_up_recommendation}
        </DetailRow>
      ) : null}
      {/* DOK-005: Die Empfehlung aus dem Therapiebericht, mit Quelle und Datum
          (ANN-014). Der Bestandstext darüber bleibt, wie er ist (ANN-065). */}
      <EmpfehlungAusBericht berichte={berichte} verordnungId={verordnung.id} />
      {verordnung.note ? <DetailRow label="Anmerkungen">{verordnung.note}</DetailRow> : null}
    </>
  );
}

/**
 * Die Aktionen einer Verordnung - passend zu ihrem Zustand.
 *
 * „Terminserie anlegen" stand bis CAL-022 nur an einer Grundlage, an der sich
 * noch etwas planen ließ: An einer ausgeschöpften führte der Knopf auf eine
 * Seite, die „0 Termine" vorschlug — ein Angebot, das keins war
 * (PROJECT_PRINCIPLES.md 13). Seit CAL-022 **ist** es eines: Über das
 * Kontingent hinaus zu planen ist zulässig, die Serienseite sagt, was dabei
 * ungedeckt bleibt. Der Knopf steht deshalb an jeder Grundlage einer aktiven
 * Patient:in.
 *
 * Dazu der Weg zur Übertragung — mit zwei Beschriftungen für denselben
 * Vorgang, weil er von zwei Seiten aus gedacht wird (CAL-022): Die überplante
 * Grundlage gibt ab („Termine übertragen"), die andere nimmt auf („Termine
 * übernehmen"). Wer eine Verordnung schreiben darf, kann sie unverändert in
 * jedem Zustand korrigieren.
 */
function Verordnungsaktionen({
  eintrag,
  patient,
  user,
  ungedecktInDerAkte,
}: {
  eintrag: VerordnungMitZahlen;
  patient: Patient;
  user: CurrentUser;
  /** Ungedeckte Termine der ganzen Akte - sonst führte „übernehmen" ins Leere. */
  ungedecktInDerAkte: number;
}) {
  const { verordnung, kontingent } = eintrag;
  const darfPlanen = canManageAppointments(user.roles);
  const darfSchreiben = canWriteTreatmentBases(user.roles);
  const planbar = patient.status === 'active';
  const ungedeckt = kontingent?.uncovered ?? 0;
  // Übernehmen lohnt nur, wenn anderswo etwas ungedeckt steht. Die eigene Zahl
  // zählt dabei nicht mit: Sie wandert nicht auf sich selbst.
  const uebernehmbar = ungedecktInDerAkte - ungedeckt > 0;
  const uebertragen = `/patienten/${patient.id}/termine-uebertragen`;

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
      {/* Derselbe Vorgang, zwei Richtungen (CAL-022). Ohne Ziel in der Adresse
          fragt die Seite danach; mit Ziel steht diese Grundlage schon da. */}
      {darfPlanen && ungedeckt > 0 ? (
        <Link
          to={uebertragen}
          className="text-accent inline-flex min-h-11 items-center text-sm hover:underline"
        >
          Termine übertragen
        </Link>
      ) : null}
      {darfPlanen && planbar && ungedeckt === 0 && uebernehmbar ? (
        <Link
          to={`${uebertragen}?ziel=${verordnung.id}`}
          className="text-accent inline-flex min-h-11 items-center text-sm hover:underline"
        >
          Termine übernehmen
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
 * **Für alle vier Praxisrollen sichtbar** (E15, ROL-002). Der Scan zeigt das
 * ganze Blatt samt Diagnose - und die liest `office` seit ADR-004 Fassung 2
 * ebenso wie die behandelnden Rollen. Hinzufügen und löschen dürfen ihn nur
 * die Rollen mit Schreibrecht an der Verordnung (ADR-017 Punkt 13, ANN-011).
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
        grundlageId={verordnungId}
        darfHinzufuegen={canWriteTreatmentBases(user.roles)}
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
  ungedecktInDerAkte,
  berichte,
}: {
  eintrag: VerordnungMitZahlen;
  patient: Patient;
  user: CurrentUser;
  ungedecktInDerAkte: number;
  berichte: readonly Berichtszeile[];
}) {
  const { verordnung, kontingent, zustand } = eintrag;
  const weitereAngaben = hatWeitereAngaben(verordnung, berichte);

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
          {/* Seit VER-EPIC-002 immer: Welche Heilmittel die Grundlage trägt,
              steht in keiner Zahl darüber - auch nicht bei einem einzigen. */}
          {verordnung.items.length > 0 ? (
            <DetailRow label="Heilmittel">
              <Heilmittel
                verordnung={verordnung}
                moeglicheTermine={kontingent?.prescribed ?? null}
              />
            </DetailRow>
          ) : null}
        </DetailList>

        {weitereAngaben ? (
          <DetailList>
            <KlinischeAngaben verordnung={verordnung} berichte={berichte} />
          </DetailList>
        ) : null}
      </div>

      <Verordnungsaktionen
        eintrag={eintrag}
        patient={patient}
        user={user}
        ungedecktInDerAkte={ungedecktInDerAkte}
      />
      {istVerordnung(verordnung.treatment_basis_kind) ? (
        <>
          <BerichteDerVerordnung
            patientId={patient.id}
            verordnungId={verordnung.id}
            berichte={berichte}
            user={user}
          />
          <Verordnungsscan patientId={patient.id} verordnungId={verordnung.id} user={user} />
        </>
      ) : null}
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
  ungedecktInDerAkte,
  berichte,
}: {
  eintrag: VerordnungMitZahlen;
  patient: Patient;
  user: CurrentUser;
  ungedecktInDerAkte: number;
  berichte: readonly Berichtszeile[];
}) {
  const { verordnung, kontingent } = eintrag;

  return (
    <li id={`verordnung-${verordnung.id}`} className="border-line border-t">
      <details className="group">
        <summary className="hover:bg-surface-sunken flex min-h-11 cursor-pointer flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5">
          <span className="text-ink min-w-0 text-[0.9375rem]">
            <Grundlagentitel verordnung={verordnung} />
            <span className="text-ink-muted mt-0.5 block text-sm">
              {[
                verordnung.prescriber_name,
                kontingent
                  ? `${kontingent.used} von ${kontingent.prescribed} Terminen genutzt`
                  : null,
                kontingent ? `${kontingent.planned} geplant` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
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
            {verordnung.items.length > 0 ? (
              <DetailRow label="Heilmittel">
                <Heilmittel
                  verordnung={verordnung}
                  moeglicheTermine={kontingent?.prescribed ?? null}
                />
              </DetailRow>
            ) : null}
            <KlinischeAngaben verordnung={verordnung} berichte={berichte} />
          </DetailList>
          <Verordnungsaktionen
            eintrag={eintrag}
            patient={patient}
            user={user}
            ungedecktInDerAkte={ungedecktInDerAkte}
          />
          {istVerordnung(verordnung.treatment_basis_kind) ? (
            <>
              <BerichteDerVerordnung
                patientId={patient.id}
                verordnungId={verordnung.id}
                berichte={berichte}
                user={user}
              />
              <Verordnungsscan patientId={patient.id} verordnungId={verordnung.id} user={user} />
            </>
          ) : null}
        </div>
      </details>
    </li>
  );
}

export function PatientTreatmentBasesPage() {
  const { patient, user } = usePatientRecord();
  return <Verordnungsbereich patient={patient} user={user} />;
}

export function Verordnungsbereich({ patient, user }: { patient: Patient; user: CurrentUser }) {
  const { eintraege, aktuell, abgeschlossen, isPending, isError, verborgen } =
    useVerordnungenDerAkte(patient.id, user);
  const berichte = useBerichteDerAkte(patient.id, user).data ?? [];

  if (verborgen) return null;

  const darfSchreiben = canWriteTreatmentBases(user.roles);
  // Über die ganze Akte, nicht je Karte: „Termine übernehmen" führt sonst auf
  // eine Seite ohne Angebot (CAL-022).
  const ungedecktInDerAkte = eintraege.reduce(
    (summe, eintrag) => summe + (eintrag.kontingent?.uncovered ?? 0),
    0,
  );

  return (
    <>
      {/* Bewusst ohne eigene Schaltfläche „Grundlage erfassen": Sie steht im
          Kopf der Akte und ist dort aus jedem Bereich erreichbar. Zwei
          gleichnamige Wege auf einer Seite wären ein Rätsel, kein Angebot -
          derselbe Grund wie bei „Termin anlegen" (UX-006). */}
      <Section
        titel="Aktuelle Behandlungsgrundlagen"
        hinweis="Verordnungen und Selbstzahler, deren mögliche Termine noch nicht vollständig genutzt sind."
      >
        {isPending ? <LoadingState label="Behandlungsgrundlagen werden geladen …" /> : null}
        {isError ? (
          <ErrorState
            title="Die Behandlungsgrundlagen konnten nicht geladen werden."
            description="Bitte später erneut versuchen. Sind Sie noch angemeldet?"
          />
        ) : null}

        {!isPending && !isError && aktuell.length === 0 ? (
          <EmptyState
            title="Keine laufende Behandlungsgrundlage"
            description={
              darfSchreiben
                ? 'Die nächste entsteht über „Grundlage erfassen" — als Verordnung oder als Selbstzahler.'
                : 'Behandlungsgrundlagen erfassen die therapeutischen Rollen.'
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
                ungedecktInDerAkte={ungedecktInDerAkte}
                berichte={berichte}
              />
            ))}
          </ul>
        ) : null}
      </Section>

      {abgeschlossen.length > 0 ? (
        <Section
          titel="Ausgeschöpfte Behandlungsgrundlagen"
          hinweis="Nach Jahr, neueste zuerst. Eine Zeile je Grundlage — aufklappen zeigt alles."
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
                        ungedecktInDerAkte={ungedecktInDerAkte}
                        berichte={berichte}
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
