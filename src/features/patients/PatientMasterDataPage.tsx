import { useEffect, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge } from '@/components/ui/Badge';
import { HausbesucheMitAlterAdresse } from '@/features/appointments/HausbesucheMitAlterAdresse';
import { useLocation } from 'react-router-dom';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { DetailList, DetailRow } from '@/components/ui/DetailList';
import { Field } from '@/components/ui/Field';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { Section } from '@/components/ui/Section';
import { Zusammenfuehrungsvermerke } from './Zusammenfuehrungsvermerke';
import { Textlink } from '@/components/ui/Textlink';
import { formatDate } from '@/lib/datum';
import { mitRueckweg } from '@/lib/rueckweg';
import { telHref } from '@/lib/telefon';
import { todayInTimeZone } from '@/features/appointments/api';
import { PlattformAbschnitt } from '@/features/platform-access/PlattformAbschnitt';
import {
  canChangePatientStatus,
  canConcludePatientCare,
  canManageInvoicing,
  canManageServiceCatalog,
  canReadPatientDirectory,
  isOwner,
  type CurrentUser,
} from '@/features/session/types';
import { ANMELDEBOGEN_ANKER, EINWILLIGUNGEN_ANKER, usePatientRecord } from './akte';
import { AnmeldebogenFoto, Datenschutz } from '@/features/datenschutz/Anmeldebogen';
import { empfaengerartLabels, fetchEmpfaenger } from '@/features/billing/api';
import { Honorarvereinbarung } from '@/features/billing/Honorarvereinbarung';
import { Nachsorgeabo } from '@/features/billing/Nachsorgeabo';
import { nachsorgeSchluessel } from '@/features/billing/nachsorge-api';
import { fetchIntakeChecklist } from '@/features/open-points/intake-api';
import { zugangMitStockwerk } from '@/features/today/stockwerk';
import {
  useAktuelleGrundlage,
  versicherungsart,
} from '@/features/treatment-bases/useAktuelleGrundlage';
import { BEGRIFFE } from '@/lib/begriffe';
import { AnmeldebogenDateien, SonstigeDateien } from '@/features/files/Aktendateien';
import { AdresseVerorten } from './AdresseVerorten';
import { Behandlungsliege } from './Behandlungsliege';
import { Mitnehmen } from './Mitnehmen';
import {
  concludePatientCare,
  jahrPlus,
  reopenPatientCare,
  setPatientStatus,
  type Patient,
} from './api';

/**
 * Stammdaten und Verwaltung (AKTE-005).
 *
 * Der Bereich, der am seltensten gebraucht wird und deshalb zuletzt steht:
 * Anschrift, Kontakt, Versorgungsdaten, seit AKTE-007 der Anmeldebogen und
 * die Dateien ohne eigenen Bereich - und die beiden Vorgänge, die eine
 * Akte aus dem laufenden Betrieb nehmen. Genau deshalb stehen sie hier unten
 * und nicht im Kopf: Ein versehentlicher Tap auf „Versorgung abschließen"
 * startet eine zehnjährige Aufbewahrung (ADR-008).
 */

/**
 * Telefonnummer als Aktion, nicht als Text (Oberflächen-Checkliste Punkt 8).
 *
 * Im Hausbesuch ist der Anruf der häufigste nächste Schritt; ein `tel:`-Link
 * spart das Abtippen am Handy. Als alleinstehender Textlink mit 44 px
 * Tippziel und Unterstreichung (PAT-11, RSP-05, UIK-15): Vorher war die
 * Nummer ein 20 px hoher Streifen, mit Handschuhen kaum zu treffen, und ohne
 * Unterstreichung neben schwarzem Text kaum als Link zu erkennen.
 */
function TelefonZeile({ label, nummer }: { label: string; nummer: string | null }) {
  // UX-005e: Ein leerer Wert bekommt keine Zeile - der Gedankenstrich sagte
  // nur, dass nichts da ist.
  if (!nummer) return null;
  return (
    <DetailRow label={label}>
      <Textlink href={telHref(nummer)} alleinstehend className={KONTAKT_IN_DER_ZEILE}>
        {nummer}
      </Textlink>
    </DetailRow>
  );
}

/**
 * Ab 640 px stehen Beschriftung und Wert nebeneinander. Das 44-px-Tippziel
 * reicht dort in den Zeilenabstand hinein, statt die Zeile zu strecken - sonst
 * stünde die Nummer eine halbe Zeile tiefer als ihre Beschriftung. Innen
 * dieselbe Polsterung wie außen weggenommen: So beginnt auch eine E-Mail über
 * zwei Zeilen auf der Höhe der Beschriftung. Am Telefon steht der Wert unter
 * der Beschriftung, dort bleibt das Ziel, wie es ist.
 */
const KONTAKT_IN_DER_ZEILE = 'sm:-my-2.5 sm:py-2.5';

/**
 * Wechsel des Versorgungsstatus.
 *
 * Bewusst mit Rückfrage: der Wechsel nimmt einen Patienten aus dem laufenden
 * Betrieb, und ein versehentlicher Klick soll das nicht auslösen
 * (PROJECT_PRINCIPLES.md 13). Die Rückfrage ist Bedienkomfort - verbindlich
 * prüft `set_patient_status` die Berechtigung erneut.
 */
function StatusAktion({ patient }: { patient: Patient }) {
  const queryClient = useQueryClient();
  const zielStatus: Patient['status'] = patient.status === 'active' ? 'inactive' : 'active';

  const mutation = useMutation({
    mutationFn: () => setPatientStatus(patient.id, zielStatus),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['patients'] });
      await queryClient.invalidateQueries({ queryKey: ['patient', patient.id] });
    },
  });

  const beschriftung =
    zielStatus === 'inactive' ? 'Als inaktiv markieren' : 'Wieder als aktiv führen';

  return (
    <Rueckfrage
      ausloeser={beschriftung}
      bestaetigen={beschriftung}
      bestaetigenLaeuft="Wird geändert …"
      fehler={mutation.isError ? 'Der Versorgungsstatus konnte nicht geändert werden.' : undefined}
      laeuft={mutation.isPending}
      onBestaetigen={() => mutation.mutateAsync()}
    >
      {zielStatus === 'inactive'
        ? 'Diese Person wird als nicht in laufender Versorgung geführt. Die Akte bleibt vollständig erhalten.'
        : 'Diese Person wird wieder als in laufender Versorgung geführt.'}
    </Rueckfrage>
  );
}

/**
 * Abschluss der Versorgung festhalten oder zurücknehmen (LOE-001b).
 *
 * Der Vorgang startet die zehnjährige Aufbewahrung nach ADR-008 — deshalb die
 * Rückfrage und deshalb der ausdrückliche Satz darüber, was danach passiert.
 * Der Tag ist änderbar, weil der letzte Behandlungstag oft vor der
 * Entscheidung liegt. Verbindlich prüft `conclude_patient_care` Rolle, Datum
 * und Organisation erneut (ADR-004).
 */
function VersorgungAbschliessen({
  patient,
  zeitzone,
}: {
  patient: Patient;
  zeitzone: string | null;
}) {
  const queryClient = useQueryClient();
  // Vorbelegung in der Zeitzone der Praxis, nicht in der des Geräts: der
  // laufende Praxistag ist der Maßstab. Verbindlich prüft der Server erneut.
  const heute = zeitzone ? todayInTimeZone(zeitzone) : '';
  const [tag, setTag] = useState(heute);
  const abgeschlossen = patient.care_concluded_on !== null;

  const mutation = useMutation({
    mutationFn: () =>
      abgeschlossen ? reopenPatientCare(patient.id) : concludePatientCare(patient.id, tag),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['patients'] });
      await queryClient.invalidateQueries({ queryKey: ['patient', patient.id] });
      // ANG-001: Der Abschluss ist der früheste Beginn des Nachsorge-Abos (ANN-268).
      await queryClient.invalidateQueries({ queryKey: nachsorgeSchluessel(patient.id) });
    },
  });

  if (abgeschlossen) {
    return (
      <Rueckfrage
        ausloeser="Abschluss zurücknehmen"
        bestaetigen="Abschluss zurücknehmen"
        bestaetigenLaeuft="Wird zurückgenommen …"
        fehler={
          mutation.isError
            ? 'Der Abschluss der Versorgung konnte nicht zurückgenommen werden.'
            : undefined
        }
        laeuft={mutation.isPending}
        onBestaetigen={() => mutation.mutateAsync()}
      >
        <p>
          Die Versorgung gilt wieder als laufend. Die Aufbewahrungsfrist beginnt erst mit einem
          neuen Abschluss – sie läuft nicht weiter.
        </p>
      </Rueckfrage>
    );
  }

  return (
    <Rueckfrage
      ausloeser="Versorgung abschließen"
      bestaetigen="Versorgung abschließen"
      // Dasselbe Verb wie auf dem Knopf (WRT-10).
      bestaetigenLaeuft="Wird abgeschlossen …"
      fehler={
        mutation.isError
          ? 'Der Abschluss der Versorgung konnte nicht gespeichert werden. Prüfen Sie das Datum.'
          : undefined
      }
      laeuft={mutation.isPending}
      onBestaetigen={() => mutation.mutateAsync()}
      onAbbrechen={() => setTag(heute)}
    >
      <p>
        Die Behandlung dieser Person ist beendet. Ab diesem Tag läuft die gesetzliche Aufbewahrung
        von zehn Jahren; danach wird die Akte gelöscht. Kommt die Person zurück, lässt sich der
        Abschluss zurücknehmen.
      </p>
      <div className="mt-3 max-w-60">
        {/* Der Tag liegt zwischen Beginn der Versorgung und heute - dieselben
            Grenzen, die der Server prüft (PAT-15). Vorher bot der Wähler auch
            Tage vor dem Beginn an, und erst die Abweisung sagte „Prüfen Sie
            das Datum". */}
        <Field
          label="Letzter Behandlungstag"
          type="date"
          min={patient.care_started_on ?? undefined}
          max={heute || undefined}
          value={tag}
          onChange={(event) => setTag(event.target.value)}
        />
      </div>
    </Rueckfrage>
  );
}

/**
 * Eine Karte der Stammdaten (Akte entschlacken, 2026-10-03): Label in
 * Versalien, rechts ein leises „Bearbeiten" mit 44 px Tippziel ins Formular.
 */
function Karte({
  titel,
  bearbeiten,
  children,
}: {
  titel: string;
  /** Ziel von „Bearbeiten"; ohne steht kein Knopf. */
  bearbeiten?: string;
  children: ReactNode;
}) {
  return (
    <Section
      titel={titel}
      rahmen
      aktion={
        bearbeiten ? (
          <ButtonLink
            to={bearbeiten}
            variant="quiet"
            groesse="kompakt"
            aria-label={`${titel} bearbeiten`}
          >
            Bearbeiten
          </ButtonLink>
        ) : null
      }
    >
      {children}
    </Section>
  );
}

/**
 * Der Anmeldebogen als Karte (ANN-227): fehlt er, steht die Karte auf der
 * Warnfläche mit dem Knopf zum Foto; liegt er vor, nennt sie das und zeigt
 * die Blätter aufklappbar. Der Zustand ist derselbe Punkt der Erstaufnahme
 * wie im Kopf der Akte (`app.intake_checklist`, gleicher Abfrageschlüssel).
 */
function AnmeldebogenKarte({ patient, user }: { patient: Patient; user: CurrentUser }) {
  const punkte = useQuery({
    queryKey: ['open-points', 'intake', patient.id],
    queryFn: () => fetchIntakeChecklist(patient.id),
    retry: false,
  });
  const stand = punkte.data?.find((p) => p.item === 'registration_form')?.state;
  const fehlt = stand === 'open';

  return (
    <section aria-labelledby="anmeldebogen-karte">
      <div className="flex min-h-8 flex-wrap items-center justify-between gap-3">
        <h2
          id="anmeldebogen-karte"
          className="text-ink-muted tracking-label text-xs font-semibold uppercase"
        >
          {BEGRIFFE.anmeldebogen}
        </h2>
        {stand === 'open' ? <Badge ton="warnung">Fehlt</Badge> : null}
        {stand === 'done' ? <Badge ton="positiv">Liegt vor</Badge> : null}
      </div>
      <div
        className={`rounded-card mt-3 border px-4 py-3 sm:px-5 ${
          fehlt ? 'bg-warnung-soft border-transparent' : 'bg-surface border-line'
        }`}
      >
        <p className="text-ink text-sm">Enthält die Datenschutzerklärung.</p>
        <div className="mt-3">
          <AnmeldebogenFoto patientId={patient.id} />
        </div>
        {/* Die Trennlinie zieht der Aufklapper selbst. */}
        <div className="mt-3 empty:hidden">
          <AnmeldebogenDateien patientId={patient.id} user={user} />
        </div>
      </div>
    </section>
  );
}

/**
 * Die Abrechnungszeilen im Block „Person" (Leitfaden schlank und klar, L2;
 * Jannes 2026-10-06). An der Person gibt es kein Feld für die Versicherung;
 * sie folgt der jüngsten Grundlage wie das Abzeichen im Kopf.
 *
 * „Rechnung an" steht **nur bei Abweichung**: wenn die Standard-Empfänger:in
 * aus den Rechnungsempfängern (ABR-003a) nicht die Person selbst ist - etwa
 * die Eltern eines Kindes oder eine Beihilfestelle -, dann mit ihrer Anschrift.
 * Geht die Rechnung an die Person, wiederholte die Zeile nur Name und Adresse
 * von oben. Empfänger lesen nur owner und office (`app.can_read_invoicing`);
 * gepflegt werden sie am Rechnungsentwurf, deshalb hier kein eigener Weg.
 */
function AbrechnungZeilen({ patient, user }: { patient: Patient; user: CurrentUser }) {
  const aktuell = useAktuelleGrundlage(patient.id, user);
  const darfEmpfaenger = canManageInvoicing(user.roles);
  const empfaenger = useQuery({
    queryKey: ['rechnungsempfaenger', patient.id],
    queryFn: () => fetchEmpfaenger(patient.id),
    enabled: darfEmpfaenger,
    retry: false,
  });
  // Eine gespeicherte Empfänger:in ist nie die Person selbst: `self` lässt
  // die Tabelle nicht zu (ABR-003a), es entsteht nur in Leseabfragen als
  // Ersatz. Jede Standard-Empfänger:in ist also eine Abweichung.
  const abweichend = empfaenger.data?.find((e) => e.is_default) ?? null;
  const anschrift = abweichend
    ? [
        [abweichend.street, abweichend.house_number].filter(Boolean).join(' '),
        [abweichend.postal_code, abweichend.city].filter(Boolean).join(' '),
      ]
        .filter(Boolean)
        .join(', ')
    : null;

  return (
    <>
      {aktuell ? (
        <DetailRow label="Versicherung">
          {versicherungsart(aktuell.grundlage.treatment_basis_kind)}
        </DetailRow>
      ) : null}
      {abweichend ? (
        <>
          <DetailRow label="Rechnung an">
            {`${abweichend.name} (${empfaengerartLabels[abweichend.recipient_kind] ?? abweichend.recipient_kind})`}
          </DetailRow>
          {anschrift ? <DetailRow label="Rechnungsanschrift">{anschrift}</DetailRow> : null}
        </>
      ) : null}
    </>
  );
}

export function PatientMasterDataPage() {
  const { patient, user } = usePatientRecord();
  return <Stammdaten patient={patient} user={user} />;
}

export function Stammdaten({ patient, user }: { patient: Patient; user: CurrentUser }) {
  const ort = useLocation();
  const street = [patient.street, patient.house_number].filter(Boolean).join(' ');
  const address = [street, [patient.postal_code, patient.city].filter(Boolean).join(' ')]
    .filter(Boolean)
    .join(', ');
  const darfStatusWechseln = canChangePatientStatus(user.roles);
  const darfVerorten = canReadPatientDirectory(user.roles);
  // Die Rollenmenge von app.can_update_patient() ist die der Kartei.
  const darfLiegeSetzen = canReadPatientDirectory(user.roles);
  // Denselben Rollenschnitt prueft app.can_conclude_patient_care(): der
  // Abschluss ist eine fachliche Aussage ueber den Versorgungsverlauf, kein
  // Verwaltungsvorgang (LOE-001b). Verbindlich ist der Server.
  const darfAbschliessen = canConcludePatientCare(user.roles);
  // Die Auskunft buendelt in einer Antwort, was sonst ueber zwoelf Leserechte
  // verteilt liegt; wer sie erteilt, steht fuer sie gerade (OPS-006, G9).
  const darfAuskunftErteilen = isOwner(user.roles);
  // Zusammenführen ist ein Vorgang der Praxisleitung (PRX-018,
  // app.can_merge_patients).
  const darfZusammenfuehren = isOwner(user.roles);
  const hatVersorgungsangaben = Boolean(patient.remark || patient.primary_therapist_name);
  // UX-005e: Die Kartenposition ist eine Zeile, solange sie fehlt; verortet
  // steht sie nicht als Dauerzeile da (ANN-016).
  // UBK-006 (ANN-236): Nach dem Verorten bleibt die Zeile stehen, bis die
  // Rückfrage zu den künftigen Hausbesuchen beantwortet ist - sonst
  // verschwände sie mit der neuen Koordinate, bevor sie gefragt hat.
  const [ebenVerortet, setEbenVerortet] = useState(false);
  const kartenpositionOffen = darfVerorten && (!patient.geocode_precision || ebenVerortet);
  const zugang = zugangMitStockwerk(patient.home_visit_access_note);
  const hatKontaktdaten = Boolean(
    patient.phone_mobile || patient.phone || patient.phone_work || patient.email,
  );

  // Formulare und Auskunft kehren hierher zurück - samt dem Rückweg der Akte,
  // der in der Adresse mitreist (PAT-08). Sonst stand nach dem Speichern der
  // Stammdaten „Zurück zur Liste" da, auch wenn man aus dem Kalender kam.
  const hier = `${ort.pathname}${ort.search}`;
  const bearbeiten = mitRueckweg(`/patienten/${patient.id}/bearbeiten`, hier);

  // Wer über „Erledigen" oder die alte Adresse `/datenschutz` kommt, landet
  // beim Anmeldebogen (AKTE-007). Der Router rollt nicht von selbst zum Anker.
  // Ebenso „Zu den Einwilligungen" aus dem Fenster „Foto aufnehmen".
  useEffect(() => {
    const anker = ort.hash.slice(1);
    if (anker !== ANMELDEBOGEN_ANKER && anker !== EINWILLIGUNGEN_ANKER) return;
    document.getElementById(anker)?.scrollIntoView?.({ block: 'start' });
  }, [ort.hash]);

  return (
    <>
      {/* ABN-004: Nach einer Adressaenderung stehen hier die kuenftigen
          Hausbesuche, die noch die alte Anschrift tragen (ANN-003 Fassung 2). */}
      {/* Solange die Rückfrage am Verorten steht, nicht zweimal dieselbe Liste. */}
      {ebenVerortet ? null : <HausbesucheMitAlterAdresse patientId={patient.id} user={user} />}

      {/* Akte entschlacken (2026-10-03, Entwurf 5i/5j): Karten statt zweier
          langer Spalten. Jede Karte steht für sich, ab 340 px nebeneinander;
          ob eine zweite oder dritte Spalte passt, entscheidet die Breite des
          Inhalts, nicht die des Fensters. Jede Karte führt ins Formular -
          das Formular bearbeitet alle Angaben zugleich. */}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,340px),1fr))] items-start gap-4 [&>section]:mt-0">
        {/* AKTE-007, ANN-227: der Anmeldebogen zuerst - solange er fehlt, ist
            er die Aufgabe dieser Seite. */}
        {darfVerorten ? (
          <div id={ANMELDEBOGEN_ANKER} className="scroll-mt-4">
            <AnmeldebogenKarte patient={patient} user={user} />
          </div>
        ) : null}

        {/* Die Einwilligungen (Mail, Bericht, Fotos) neben dem Anmeldebogen,
            auf dem sie angekreuzt werden. Die Fotoeinwilligung schaltet
            serverseitig die Foto-Arbeitshilfe frei (ADR-017 Punkt 35). */}
        {darfVerorten ? (
          <div id={EINWILLIGUNGEN_ANKER} className="scroll-mt-4">
            <Datenschutz patient={patient} user={user} />
          </div>
        ) : null}

        {/* Leitfaden schlank und klar, L2 (Jannes 2026-10-06): Person,
            Kontakt, Adresse mit den Angaben für den Hausbesuch und die
            Versicherung stehen in EINEM Block mit einem „Bearbeiten" - das
            Formular bearbeitet sie ohnehin zusammen. Bis dahin waren es vier
            Karten mit je zwei bis vier Zeilen. UX-005e gilt weiter: Ein
            leerer Wert bekommt keine Zeile. */}
        <Karte titel="Person" bearbeiten={bearbeiten}>
          <DetailList schmal>
            <DetailRow label="Name">
              {patient.given_name} {patient.family_name}
            </DetailRow>
            <DetailRow label="Geboren">{formatDate(patient.date_of_birth)}</DetailRow>
            {patient.institution ? (
              <DetailRow label="Einrichtung">{patient.institution}</DetailRow>
            ) : null}
            {hatKontaktdaten ? (
              <>
                <TelefonZeile label="Mobil" nummer={patient.phone_mobile} />
                <TelefonZeile label="Telefon (privat)" nummer={patient.phone} />
                <TelefonZeile label="Telefon (geschäftlich)" nummer={patient.phone_work} />
                {patient.email ? (
                  <DetailRow label="E-Mail">
                    <Textlink
                      href={`mailto:${patient.email}`}
                      alleinstehend
                      className={KONTAKT_IN_DER_ZEILE}
                    >
                      {patient.email}
                    </Textlink>
                  </DetailRow>
                ) : null}
              </>
            ) : (
              // Fehlt jeder Kontaktweg, sagt das eine Zeile statt vier
              // Gedankenstriche (UX-005e).
              <DetailRow label="Kontakt">
                <span className="text-ink-muted">Keine Kontaktdaten hinterlegt</span>
              </DetailRow>
            )}
            {address ? <DetailRow label="Adresse">{address}</DetailRow> : null}
            {/* MAP-006a: Die Kartenposition ist Teil der Adresse (ANN-016).
                Verorten darf, wer die Stammdaten ändern darf; verbindlich
                prüft set_patient_address_coordinate (ADR-004). */}
            {kartenpositionOffen ? (
              <DetailRow label="Kartenposition">
                <AdresseVerorten
                  patient={patient}
                  user={user}
                  onVerortet={() => setEbenVerortet(true)}
                />
              </DetailRow>
            ) : null}
            {/* ANN-197: Die Etage ist der Anfang des Zugangshinweises, bis es
                ein eigenes Feld gibt - dieselbe Regel wie auf der Tageskarte. */}
            {zugang.stockwerk ? <DetailRow label="Etage">{zugang.stockwerk}</DetailRow> : null}
            {zugang.rest ? <DetailRow label="Zugang">{zugang.rest}</DetailRow> : null}
            {patient.special_note ? (
              <DetailRow label="Besonderheit">{patient.special_note}</DetailRow>
            ) : null}
            <AbrechnungZeilen patient={patient} user={user} />
          </DetailList>
        </Karte>

        {/* PAT-005: interne Angaben der Praxis. Für ein Patientenkonto liefert
            die Sicht sie gar nicht erst (ANN-010, ADR-004). UX-003a: Die
            Behandlungsliege steht hier für jede Praxisrolle - sonst gäbe es
            keinen Ort, sie zu setzen; verbindlich prüft
            set_treatment_table_required. */}
        {hatVersorgungsangaben || darfLiegeSetzen ? (
          <Karte titel="Praxis" bearbeiten={bearbeiten}>
            <DetailList schmal>
              {darfLiegeSetzen ? (
                <DetailRow label="Behandlungsliege">
                  <Behandlungsliege patient={patient} darfAendern={darfLiegeSetzen} />
                </DetailRow>
              ) : null}
              {/* PRX-007: Mitnehmen, von Hand gepflegt (ANN-138). */}
              {darfLiegeSetzen ? (
                <DetailRow label="Material">
                  <Mitnehmen patient={patient} darfAendern={darfLiegeSetzen} />
                </DetailRow>
              ) : null}
              {patient.primary_therapist_name ? (
                <DetailRow label="Feste Therapeut:in">{patient.primary_therapist_name}</DetailRow>
              ) : null}
              {patient.remark ? <DetailRow label="Bemerkung">{patient.remark}</DetailRow> : null}
            </DetailList>
          </Karte>
        ) : null}

        {/* Versorgung und ihre Vorgänge (Design-Handoff 2026-10-01,
            Abschnitt 7). UX-005e: Ohne erklärende Sätze - was ein Vorgang
            tut, sagt seine Rückfrage, bevor er ausgelöst wird. */}
        <Karte titel="Verwaltung">
          <DetailList schmal>
            <DetailRow label="Beginn">{formatDate(patient.care_started_on)}</DetailRow>
            {/* Der Abschluss ist der Anker der zehnjaehrigen Aufbewahrung
                (ADR-008, LOE-001b) und steht nur, wenn er gesetzt ist. */}
            {patient.care_concluded_on ? (
              <DetailRow label="Abschluss">
                {`${formatDate(patient.care_concluded_on)} – Aufbewahrung bis ${jahrPlus(patient.care_concluded_on, 10)}`}
              </DetailRow>
            ) : null}
          </DetailList>
          {darfStatusWechseln || darfAbschliessen ? (
            <div className="border-line mt-3 flex flex-wrap items-start gap-3 border-t pt-3">
              {darfStatusWechseln ? <StatusAktion patient={patient} /> : null}
              {darfAbschliessen ? (
                <VersorgungAbschliessen patient={patient} zeitzone={user.organizationTimeZone} />
              ) : null}
            </div>
          ) : null}
          <Zusammenfuehrungsvermerke patientId={patient.id} zeitzone={user.organizationTimeZone} />
          {/* ABR-030: Das Terminhonorar sehen dieselben Rollen wie die
              Rechnungsempfänger (owner, office); festlegen darf nur owner
              (ANN-231). Verbindlich prüft der Server. Seit SLK-003 in der
              Verwaltung, weil die Karte „Abrechnung" im Block „Person"
              aufgegangen ist. */}
          {canManageInvoicing(user.roles) ? (
            <Honorarvereinbarung
              patientId={patient.id}
              darfFestlegen={canManageServiceCatalog(user.roles)}
              heute={user.organizationTimeZone ? todayInTimeZone(user.organizationTimeZone) : null}
            />
          ) : null}
          {/* ANG-EPIC-001: Das Nachsorge-Abo nach der Behandlung (ADR-009
              Punkt 21) legen owner und office an - dieselben Rollen wie
              Leistungen und Rechnungen. Verbindlich prüft der Server. */}
          {canManageInvoicing(user.roles) ? <Nachsorgeabo patientId={patient.id} /> : null}
        </Karte>
      </div>

      <SonstigeDateien patientId={patient.id} user={user} />

      {/* POR-002: der eigene Zugang der Person zur Plattform (DSN-001
          Abschnitt 6). Dieselben Rollen wie die Kartei laden ein, sperren und
          entziehen (app.can_update_patient, ADR-023 Punkt 6); verbindlich
          prüft der Server. */}
      {darfVerorten && user.organizationTimeZone ? (
        <PlattformAbschnitt
          art="treatment"
          verhaeltnisId={patient.id}
          darfVerwalten={darfVerorten}
          zeitzone={user.organizationTimeZone}
          praxis={user.organizationName ?? 'der Praxis'}
        />
      ) : null}

      {/* PRX-018: Eine zweite Akte derselben Person hierher übernehmen. Nur
          `owner` - ausgeblendet ist keine Zugriffskontrolle, verbindlich
          prüft `merge_patients` (ADR-004). */}
      {darfZusammenfuehren ? (
        <Section titel="Dublette">
          <ButtonLink
            to={mitRueckweg(`/patienten/${patient.id}/dublette`, hier)}
            variant="secondary"
          >
            Dublette übernehmen
          </ButtonLink>
        </Section>
      ) : null}

      {/* Betroffenenrechte stehen unter der Verwaltung und nicht daneben: Sie
          beginnen mit einem Schreiben, nicht mit einem Klick (OPS-006). Der
          Zugang ist `owner` vorbehalten; ausgeblendet ist keine
          Zugriffskontrolle — verbindlich sind die Serverfunktionen
          (ADR-004). UX-005e: Die übrigen Rollen sehen den Abschnitt nicht -
          ein Satz darüber, wer etwas darf, ist kein Inhalt der Akte. Der
          Protokollhinweis entfällt ebenso; protokolliert wird weiter (ADR-010). */}
      {darfAuskunftErteilen ? (
        <Section titel="Betroffenenrechte">
          <ButtonLink
            to={mitRueckweg(`/patienten/${patient.id}/auskunft`, hier)}
            variant="secondary"
          >
            Auskunft und Löschverlangen
          </ButtonLink>
        </Section>
      ) : null}
    </>
  );
}
