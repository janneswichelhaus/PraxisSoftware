import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { DetailList, DetailRow } from '@/components/ui/DetailList';
import { Field } from '@/components/ui/Field';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { roleLabel } from '@/components/ui/roleLabels';
import { Section } from '@/components/ui/Section';
import { Textlink } from '@/components/ui/Textlink';
import { formatDate } from '@/lib/datum';
import { mitRueckweg } from '@/lib/rueckweg';
import { telHref } from '@/lib/telefon';
import { todayInTimeZone } from '@/features/appointments/api';
import { PlattformAbschnitt } from '@/features/platform-access/PlattformAbschnitt';
import {
  canChangePatientStatus,
  canConcludePatientCare,
  canReadPatientDirectory,
  isOwner,
  type CurrentUser,
} from '@/features/session/types';
import { usePatientRecord } from './akte';
import { AdresseVerorten } from './AdresseVerorten';
import { Behandlungsliege } from './Behandlungsliege';
import { Mitnehmen } from './Mitnehmen';
import {
  ageInYears,
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
 * Anschrift, Kontakt, Versorgungsdaten - und die beiden Vorgänge, die eine
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
  if (!nummer) return <DetailRow label={label}>—</DetailRow>;
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

export function PatientMasterDataPage() {
  const { patient, user } = usePatientRecord();
  return <Stammdaten patient={patient} user={user} />;
}

export function Stammdaten({ patient, user }: { patient: Patient; user: CurrentUser }) {
  const ort = useLocation();
  const alter = ageInYears(patient.date_of_birth);
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
  const hatVersorgungsangaben = Boolean(
    patient.home_visit_access_note ||
    patient.special_note ||
    patient.remark ||
    patient.primary_therapist_name,
  );

  // Formulare und Auskunft kehren hierher zurück - samt dem Rückweg der Akte,
  // der in der Adresse mitreist (PAT-08). Sonst stand nach dem Speichern der
  // Stammdaten „Zurück zur Liste" da, auch wenn man aus dem Kalender kam.
  const hier = `${ort.pathname}${ort.search}`;

  return (
    <>
      {/* Der Weg ins Formular steht über den Abschnitten und nicht im Kopf von
          „Person": Er bearbeitet alle Abschnitte, und nebeneinander stehen die
          Köpfe der beiden Spalten so auf derselben Höhe (PAT-B01). */}
      <div className="mb-6">
        <ButtonLink
          to={mitRueckweg(`/patienten/${patient.id}/bearbeiten`, hier)}
          variant="secondary"
        >
          Stammdaten bearbeiten
        </ButtonLink>
      </div>

      {/* Zwei Spalten erst ab 1280 px: Person und Kontakt sind kurze Listen und
          stünden untereinander als zwei schmale Streifen in einer leeren
          Fläche. Darunter blieben der Wertspalte neben der 176-px-Beschriftung
          knapp 100 px - Adresse und Zugangshinweis standen zu ein, zwei Wörtern
          je Zeile, und die Seite lief seitlich über (PAT-B01). Jeder Abschnitt
          steht in einem eigenen Rasterfeld - damit greift `first:mt-0` in
          jedem Feld und die Spalten beginnen auf derselben Höhe. */}
      <div className="grid gap-x-8 gap-y-8 xl:grid-cols-2">
        <div>
          <Section titel="Person" rahmen>
            <DetailList>
              <DetailRow label="Geburtsdatum">
                {patient.date_of_birth
                  ? `${formatDate(patient.date_of_birth)}${alter !== null ? ` (${alter} Jahre)` : ''}`
                  : '—'}
              </DetailRow>
              {patient.institution ? (
                <DetailRow label="Einrichtung">{patient.institution}</DetailRow>
              ) : null}
              <DetailRow label="Adresse">{address || '—'}</DetailRow>
              {/* MAP-006a: Die Kartenposition ist Teil der Adresse (ANN-016).
                Verorten darf, wer die Stammdaten ändern darf; verbindlich
                prüft set_patient_address_coordinate (ADR-004). */}
              {darfVerorten ? (
                <DetailRow label="Kartenposition">
                  <AdresseVerorten patient={patient} />
                </DetailRow>
              ) : null}
            </DetailList>
          </Section>
        </div>

        <div>
          <Section titel="Kontakt" rahmen>
            <DetailList>
              <TelefonZeile label="Mobil" nummer={patient.phone_mobile} />
              <TelefonZeile label="Telefon (privat)" nummer={patient.phone} />
              {patient.phone_work ? (
                <TelefonZeile label="Telefon (geschäftlich)" nummer={patient.phone_work} />
              ) : null}
              {patient.fax ? <DetailRow label="Telefax">{patient.fax}</DetailRow> : null}
              <DetailRow label="E-Mail">
                {patient.email ? (
                  <Textlink
                    href={`mailto:${patient.email}`}
                    alleinstehend
                    className={KONTAKT_IN_DER_ZEILE}
                  >
                    {patient.email}
                  </Textlink>
                ) : (
                  '—'
                )}
              </DetailRow>
            </DetailList>
          </Section>
        </div>

        {/* PAT-005: interne Angaben der Praxis. Für ein Patientenkonto liefert die
            Sicht sie gar nicht erst; der Abschnitt bleibt dann leer und
            verschwindet (ANN-010, ADR-004). Der Zugangshinweis steht zusätzlich
            auf der Übersicht - vor einem Hausbesuch ist er die Angabe, die man
            unterwegs sucht. Der Abschnitt heißt wie im Formular (PAT-07). */}
        {/* UX-003a: Die Behandlungsliege steht hier für jede Praxisrolle, auch
            wenn sonst nichts hinterlegt ist - sonst gäbe es keinen Ort, sie
            zu setzen. Dieselbe Rollenmenge wie update_patient; verbindlich
            prüft set_treatment_table_required (ADR-004). */}
        {hatVersorgungsangaben || darfLiegeSetzen ? (
          <div>
            <Section titel="Hausbesuch und Praxisangaben" rahmen>
              <DetailList>
                {darfLiegeSetzen ? (
                  <DetailRow label="Behandlungsliege">
                    <Behandlungsliege patient={patient} darfAendern={darfLiegeSetzen} />
                  </DetailRow>
                ) : null}
                {/* PRX-007: Mitnehmen, von Hand gepflegt (ANN-138). Dieselbe
                    Rollenmenge wie die Liege; verbindlich prüft
                    set_take_along_items. */}
                {darfLiegeSetzen ? (
                  <DetailRow label="Material">
                    <Mitnehmen patient={patient} darfAendern={darfLiegeSetzen} />
                  </DetailRow>
                ) : null}
                {patient.home_visit_access_note ? (
                  <DetailRow label="Zugangshinweis">{patient.home_visit_access_note}</DetailRow>
                ) : null}
                {patient.special_note ? (
                  <DetailRow label="Besonderheit">{patient.special_note}</DetailRow>
                ) : null}
                {patient.primary_therapist_name ? (
                  <DetailRow label="Feste Therapeut:in">{patient.primary_therapist_name}</DetailRow>
                ) : null}
                {patient.remark ? <DetailRow label="Bemerkung">{patient.remark}</DetailRow> : null}
              </DetailList>
            </Section>
          </div>
        ) : null}

        <div>
          <Section titel="Versorgung" rahmen>
            <DetailList>
              <DetailRow label="Beginn">{formatDate(patient.care_started_on)}</DetailRow>
              <DetailRow label="Status">
                {patient.status === 'active' ? 'Aktiv' : 'Inaktiv'}
              </DetailRow>
              {/* Der Abschluss ist der Anker der zehnjaehrigen Aufbewahrung
                (ADR-008, LOE-001b) und etwas anderes als der Status: „inaktiv"
                sagt etwas ueber den Kalender, „abgeschlossen" ueber die
                Behandlung. */}
              <DetailRow label="Abschluss">
                {patient.care_concluded_on
                  ? `${formatDate(patient.care_concluded_on)} – Aufbewahrung bis ${jahrPlus(patient.care_concluded_on, 10)}`
                  : 'Laufende Versorgung'}
              </DetailRow>
            </DetailList>
          </Section>
        </div>
      </div>

      {darfStatusWechseln || darfAbschliessen ? (
        <Section
          titel="Verwaltung"
          // Der Satz zählt, was die Rolle hier tatsächlich sieht (PAT-05):
          // Therapeut:innen sehen nur den Abschluss, das Praxismanagement nur
          // den Status - „beide" stimmte für sie nicht.
          hinweis={
            darfStatusWechseln && darfAbschliessen
              ? 'Vorgänge, die eine Akte aus dem laufenden Betrieb nehmen. Beide sind rücknehmbar.'
              : 'Ein Vorgang, der eine Akte aus dem laufenden Betrieb nimmt. Er ist rücknehmbar.'
          }
        >
          <div className="flex flex-wrap items-start gap-3">
            {darfStatusWechseln ? <StatusAktion patient={patient} /> : null}
            {darfAbschliessen ? (
              <VersorgungAbschliessen patient={patient} zeitzone={user.organizationTimeZone} />
            ) : null}
          </div>
        </Section>
      ) : null}

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
        />
      ) : null}

      {/* PRX-018: Eine zweite Akte derselben Person hierher übernehmen. Nur
          `owner` - ausgeblendet ist keine Zugriffskontrolle, verbindlich
          prüft `merge_patients` (ADR-004). */}
      {darfZusammenfuehren ? (
        <Section
          titel="Dublette"
          hinweis="Gibt es für diese Person eine zweite Akte, lässt sie sich hierher übernehmen. Diese Akte bleibt."
        >
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
          (ADR-004). Die übrigen Praxisrollen erfahren, wer eine Anfrage
          bearbeitet, statt vor einer Lücke zu stehen (PAT-05). */}
      {darfAuskunftErteilen ? (
        <Section
          titel="Betroffenenrechte"
          hinweis="Auskunft nach Art. 15 DSGVO und die Antwort auf ein Löschverlangen. Jede Auskunft wird protokolliert."
        >
          <ButtonLink
            to={mitRueckweg(`/patienten/${patient.id}/auskunft`, hier)}
            variant="secondary"
          >
            Auskunft und Löschverlangen
          </ButtonLink>
        </Section>
      ) : canReadPatientDirectory(user.roles) ? (
        <Section titel="Betroffenenrechte">
          <p className="text-ink-muted max-w-prose text-sm">
            Auskunft nach Art. 15 DSGVO und Löschverlangen sind der Rolle „{roleLabel('owner')}“
            vorbehalten.
          </p>
        </Section>
      ) : null}

      <p className="text-ink-muted mt-8 text-xs leading-relaxed">
        Zugriffe auf Patientenakten werden protokolliert.
      </p>
    </>
  );
}
