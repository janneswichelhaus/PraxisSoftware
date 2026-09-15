import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { DetailList, DetailRow } from '@/components/ui/DetailList';
import { Field } from '@/components/ui/Field';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { Section } from '@/components/ui/Section';
import { formatDate } from '@/lib/datum';
import { telHref } from '@/lib/telefon';
import { todayInTimeZone } from '@/features/appointments/api';
import {
  canChangePatientStatus,
  canConcludePatientCare,
  type CurrentUser,
} from '@/features/session/types';
import { usePatientRecord } from './akte';
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
 * spart das Abtippen am Handy.
 */
function TelefonZeile({ label, nummer }: { label: string; nummer: string | null }) {
  if (!nummer) return <DetailRow label={label}>—</DetailRow>;
  return (
    <DetailRow label={label}>
      <a className="text-accent hover:underline" href={telHref(nummer)}>
        {nummer}
      </a>
    </DetailRow>
  );
}

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
          neuen Abschluss — sie läuft nicht weiter.
        </p>
      </Rueckfrage>
    );
  }

  return (
    <Rueckfrage
      ausloeser="Versorgung abschließen"
      bestaetigen="Versorgung abschließen"
      bestaetigenLaeuft="Wird gespeichert …"
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
        <Field
          label="Letzter Behandlungstag"
          type="date"
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
  const alter = ageInYears(patient.date_of_birth);
  const street = [patient.street, patient.house_number].filter(Boolean).join(' ');
  const address = [street, [patient.postal_code, patient.city].filter(Boolean).join(' ')]
    .filter(Boolean)
    .join(', ');
  const darfStatusWechseln = canChangePatientStatus(user.roles);
  // Denselben Rollenschnitt prueft app.can_conclude_patient_care(): der
  // Abschluss ist eine fachliche Aussage ueber den Versorgungsverlauf, kein
  // Verwaltungsvorgang (LOE-001b). Verbindlich ist der Server.
  const darfAbschliessen = canConcludePatientCare(user.roles);
  const hatVersorgungsangaben = Boolean(
    patient.home_visit_access_note ||
    patient.special_note ||
    patient.remark ||
    patient.primary_therapist_name,
  );

  return (
    <>
      {/* Zwei Spalten auf dem Desktop: Person und Kontakt sind kurze Listen und
          stünden untereinander als zwei schmale Streifen in einer leeren
          Fläche. Jeder Abschnitt steht in einem eigenen Rasterfeld - damit
          greift `first:mt-0` in jedem Feld und die Spalten beginnen auf
          derselben Höhe. */}
      <div className="grid gap-x-8 gap-y-8 lg:grid-cols-2">
        <div>
          <Section
            titel="Person"
            rahmen
            aktion={
              <ButtonLink to={`/patienten/${patient.id}/bearbeiten`} variant="secondary">
                Stammdaten bearbeiten
              </ButtonLink>
            }
          >
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
                  <a className="text-accent hover:underline" href={`mailto:${patient.email}`}>
                    {patient.email}
                  </a>
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
            unterwegs sucht. */}
        {hatVersorgungsangaben ? (
          <div>
            <Section titel="Hausbesuch und Versorgung" rahmen>
              <DetailList>
                {patient.home_visit_access_note ? (
                  <DetailRow label="Zugang">{patient.home_visit_access_note}</DetailRow>
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
                  ? `${formatDate(patient.care_concluded_on)} — Aufbewahrung bis ${jahrPlus(patient.care_concluded_on, 10)}`
                  : 'Laufende Versorgung'}
              </DetailRow>
            </DetailList>
          </Section>
        </div>
      </div>

      {darfStatusWechseln || darfAbschliessen ? (
        <Section
          titel="Verwaltung"
          hinweis="Vorgänge, die eine Akte aus dem laufenden Betrieb nehmen. Beide sind rücknehmbar."
        >
          <div className="flex flex-wrap items-start gap-3">
            {darfStatusWechseln ? <StatusAktion patient={patient} /> : null}
            {darfAbschliessen ? (
              <VersorgungAbschliessen patient={patient} zeitzone={user.organizationTimeZone} />
            ) : null}
          </div>
        </Section>
      ) : null}

      <p className="text-ink-subtle mt-8 text-xs leading-relaxed">
        Zugriffe auf Patientenakten werden protokolliert.
      </p>
    </>
  );
}
