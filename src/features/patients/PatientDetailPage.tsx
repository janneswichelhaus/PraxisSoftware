import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { DetailList, DetailRow } from '@/components/ui/DetailList';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { Section } from '@/components/ui/Section';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import {
  canChangePatientStatus,
  canManageAppointments,
  type CurrentUser,
} from '@/features/session/types';
import { PatientRecordDocumentation } from '@/features/documentation/PatientRecordDocumentation';
import { PatientPrescriptions } from '@/features/prescriptions/PatientPrescriptions';
import {
  ageInYears,
  fetchPatient,
  formatDate,
  fullName,
  logPatientRecordView,
  setPatientStatus,
  type Patient,
} from './api';

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
      <a className="text-accent hover:underline" href={`tel:${nummer.replace(/[^+\d]/g, '')}`}>
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

function PatientDetail({ patient, user }: { patient: Patient; user: CurrentUser }) {
  const age = ageInYears(patient.date_of_birth);
  const street = [patient.street, patient.house_number].filter(Boolean).join(' ');
  const address = [street, [patient.postal_code, patient.city].filter(Boolean).join(' ')]
    .filter(Boolean)
    .join(', ');
  const darfStatusWechseln = canChangePatientStatus(user.roles);
  const darfTerminePlanen = canManageAppointments(user.roles);
  const hatVersorgungsangaben = Boolean(
    patient.home_visit_access_note ||
    patient.special_note ||
    patient.remark ||
    patient.primary_therapist_name,
  );

  return (
    <>
      <PageHeader
        title={fullName(patient)}
        description={patient.status === 'inactive' ? 'Nicht in laufender Versorgung' : undefined}
        actions={
          <div className="flex flex-wrap gap-3">
            <ButtonLink to={`/patienten/${patient.id}/bearbeiten`} variant="secondary">
              Stammdaten bearbeiten
            </ButtonLink>
            {darfTerminePlanen && patient.status === 'active' ? (
              <ButtonLink to={`/patienten/${patient.id}/termine/neu`}>Termin anlegen</ButtonLink>
            ) : null}
          </div>
        }
      />

      <Section titel="Person">
        <DetailList>
          <DetailRow label="Geburtsdatum">
            {patient.date_of_birth
              ? `${formatDate(patient.date_of_birth)}${age !== null ? ` (${age} Jahre)` : ''}`
              : '—'}
          </DetailRow>
          {patient.institution ? (
            <DetailRow label="Einrichtung">{patient.institution}</DetailRow>
          ) : null}
          <DetailRow label="Adresse">{address || '—'}</DetailRow>
        </DetailList>
      </Section>

      <Section titel="Kontakt">
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

      {/* PAT-005: interne Angaben der Praxis. Für ein Patientenkonto liefert die
          Sicht sie gar nicht erst; der Abschnitt bleibt dann leer und
          verschwindet (ANN-010, ADR-004). */}
      {hatVersorgungsangaben ? (
        <Section titel="Hausbesuch und Versorgung">
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
      ) : null}

      <Section titel="Versorgung">
        <DetailList>
          <DetailRow label="Beginn">{formatDate(patient.care_started_on)}</DetailRow>
          <DetailRow label="Status">{patient.status === 'active' ? 'Aktiv' : 'Inaktiv'}</DetailRow>
        </DetailList>
      </Section>

      {darfStatusWechseln ? (
        <div className="mt-5 flex">
          <StatusAktion patient={patient} />
        </div>
      ) : null}

      {/* Verordnung und Dokumentation kommen ueber eigene, rollenabhaengig
          projizierte Lesepfade - nie aus den Stammdaten (VER-002, DOK-003,
          ADR-004). Die Verordnung steht davor: sie ist der Auftrag, auf dem
          die Behandlungen beruhen. */}
      <PatientPrescriptions patient={patient} user={user} />

      <PatientRecordDocumentation patient={patient} user={user} />

      <p className="text-ink-subtle mt-10 text-xs leading-relaxed">
        Zugriffe auf Patientenakten werden protokolliert.
      </p>
    </>
  );
}

export function PatientDetailPage({ user }: { user: CurrentUser }) {
  const { patientId } = useParams<{ patientId: string }>();

  const { data, isPending, isError } = useQuery({
    queryKey: ['patient', patientId],
    queryFn: () => fetchPatient(patientId!),
    enabled: Boolean(patientId),
    retry: false,
  });

  // ADR-010: Das Öffnen einer Patientenakte in der Detailansicht ist
  // auditpflichtig. Protokolliert wird erst, wenn der Datensatz tatsächlich
  // sichtbar war - nicht schon beim Aufruf einer beliebigen ID.
  useEffect(() => {
    if (data?.id) void logPatientRecordView(data.id);
  }, [data?.id]);

  return (
    <>
      <Link
        to="/patienten"
        className="text-ink-muted hover:text-ink mb-4 inline-flex min-h-11 items-center text-sm"
      >
        ← Zurück zur Liste
      </Link>

      {isPending ? <LoadingState label="Patientendaten werden geladen …" /> : null}
      {isError ? <ErrorState title="Die Patientendaten konnten nicht geladen werden." /> : null}
      {data === null ? (
        <ErrorState
          title="Nicht gefunden"
          description="Dieser Datensatz existiert nicht oder ist für Ihren Zugang nicht freigegeben."
        />
      ) : null}
      {data ? <PatientDetail patient={data} user={user} /> : null}
    </>
  );
}
