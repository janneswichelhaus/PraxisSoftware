import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/Badge';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { DetailList, DetailRow } from '@/components/ui/DetailList';
import { Section } from '@/components/ui/Section';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/Feedback';
import {
  canReadPrescriptionClinical,
  canReadPrescriptions,
  canWritePrescriptions,
  type CurrentUser,
} from '@/features/session/types';
import type { Patient } from '@/features/patients/api';
import {
  fetchPatientPrescriptions,
  fetchPatientPrescriptionsClinical,
  formatDate,
  gesamtkontingent,
  nachJahr,
  prescriptionKindLabels,
  restkontingent,
  type ClinicalPrescription,
  type Prescription,
} from './api';

/**
 * Verordnungen in der Patientenakte (VER-002).
 *
 * Wie die Behandlungsdokumentation eine reine Rollenweiche: welche Felder
 * überhaupt ankommen, entscheidet die Datenbank über zwei verschiedene
 * Serverfunktionen (ADR-004, ANN-011). Diese Datei blendet nichts aus — sie
 * ruft die passende Funktion auf.
 */
export function PatientPrescriptions({ patient, user }: { patient: Patient; user: CurrentUser }) {
  if (canReadPrescriptionClinical(user.roles)) {
    return <VerordnungenKlinisch patient={patient} user={user} />;
  }
  if (canReadPrescriptions(user.roles)) {
    return <VerordnungenOrganisatorisch patient={patient} user={user} />;
  }
  return null;
}

function Rahmen({
  patient,
  user,
  children,
}: {
  patient: Patient;
  user: CurrentUser;
  children: React.ReactNode;
}) {
  return (
    <Section
      titel="Verordnungen"
      aktion={
        canWritePrescriptions(user.roles) ? (
          <ButtonLink to={`/patienten/${patient.id}/verordnungen/neu`} variant="secondary">
            Verordnung erfassen
          </ButtonLink>
        ) : null
      }
    >
      {children}
    </Section>
  );
}

/**
 * Restkontingent als Zahl und als Wort.
 *
 * ANN-014: eine Rechnung, keine Empfehlung. „Kontingent ausgeschöpft" ist ein
 * Sachsatz über die verbleibende Menge und ausdrücklich keine Aussage darüber,
 * ob eine weitere Behandlung angezeigt ist (ADR-006 Punkt 4). Die Farbe trägt
 * die Bedeutung nicht allein; sie steht als Text daneben.
 */
function Kontingent({ prescription }: { prescription: Prescription }) {
  const rest = restkontingent(prescription);
  const gesamt = gesamtkontingent(prescription);

  return (
    <span className="flex flex-wrap items-center gap-2">
      <span className="text-ink text-[0.9375rem]">
        noch {rest} von {gesamt}
      </span>
      {rest === 0 ? <Badge ton="neutral">Kontingent ausgeschöpft</Badge> : null}
    </span>
  );
}

function Verordnungskarte({
  prescription,
  patient,
  user,
  klinisch,
}: {
  prescription: Prescription | ClinicalPrescription;
  patient: Patient;
  user: CurrentUser;
  klinisch: ClinicalPrescription | null;
}) {
  const darfSchreiben = canWritePrescriptions(user.roles);

  return (
    <li className="border-line bg-surface rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-ink text-[0.9375rem] font-medium">
            {prescriptionKindLabels[prescription.prescription_kind]} vom{' '}
            {formatDate(prescription.issued_on)}
          </p>
          <p className="text-ink-muted mt-0.5 text-sm">
            {[prescription.prescriber_name, prescription.prescriber_practice_name]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        {darfSchreiben ? (
          <Link
            to={`/patienten/${patient.id}/verordnungen/${prescription.id}/bearbeiten`}
            className="text-accent min-h-11 shrink-0 text-sm hover:underline"
          >
            Bearbeiten
          </Link>
        ) : null}
      </div>

      <ul className="divide-line border-line mt-3 divide-y border-t">
        {prescription.items.map((item) => (
          <li key={item.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
            <span className="text-ink text-[0.9375rem]">{item.remedy}</span>
            <span className="text-ink-muted text-sm">
              {item.used_quantity} von {item.prescribed_quantity} genutzt · noch{' '}
              {item.remaining_quantity}
            </span>
          </li>
        ))}
      </ul>

      <DetailList>
        <DetailRow label="Kontingent">
          <Kontingent prescription={prescription} />
        </DetailRow>
        {prescription.frequency_note ? (
          <DetailRow label="Frequenz">{prescription.frequency_note}</DetailRow>
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
        {prescription.note ? <DetailRow label="Bemerkung">{prescription.note}</DetailRow> : null}
      </DetailList>
    </li>
  );
}

function Jahresliste({
  prescriptions,
  patient,
  user,
  mitKlinik,
}: {
  prescriptions: (Prescription | ClinicalPrescription)[];
  patient: Patient;
  user: CurrentUser;
  mitKlinik: boolean;
}) {
  // VER-002: nach Jahr gruppiert. Eine Akte über zehn Jahre ist sonst eine
  // Liste ohne Anhaltspunkt; das Jahr ist das, wonach im Gespräch gesucht wird.
  return (
    <>
      {nachJahr(prescriptions).map(({ jahr, verordnungen }) => (
        <Section key={jahr} titel={jahr} ebene={3}>
          <ul className="flex flex-col gap-3">
            {verordnungen.map((verordnung) => (
              <Verordnungskarte
                key={verordnung.id}
                prescription={verordnung}
                patient={patient}
                user={user}
                klinisch={mitKlinik ? (verordnung as ClinicalPrescription) : null}
              />
            ))}
          </ul>
        </Section>
      ))}
    </>
  );
}

function Zustand({
  isPending,
  isError,
  leer,
  darfSchreiben,
}: {
  isPending: boolean;
  isError: boolean;
  leer: boolean;
  darfSchreiben: boolean;
}) {
  if (isPending) return <LoadingState label="Verordnungen werden geladen …" />;
  if (isError) {
    return (
      <ErrorState
        title="Die Verordnungen konnten nicht geladen werden."
        description="Bitte später erneut versuchen. Sind Sie noch angemeldet?"
      />
    );
  }
  if (leer) {
    return (
      <EmptyState
        title="Noch keine Verordnung erfasst"
        description={
          darfSchreiben
            ? 'Die erste Verordnung entsteht über „Verordnung erfassen".'
            : 'Verordnungen erfassen die therapeutischen Rollen.'
        }
      />
    );
  }
  return null;
}

function VerordnungenOrganisatorisch({ patient, user }: { patient: Patient; user: CurrentUser }) {
  const { data, isPending, isError } = useQuery({
    queryKey: ['patient-prescriptions', patient.id],
    queryFn: () => fetchPatientPrescriptions(patient.id),
    retry: false,
  });

  return (
    <Rahmen patient={patient} user={user}>
      <Zustand
        isPending={isPending}
        isError={isError}
        leer={data?.length === 0}
        darfSchreiben={canWritePrescriptions(user.roles)}
      />
      {data && data.length > 0 ? (
        <Jahresliste prescriptions={data} patient={patient} user={user} mitKlinik={false} />
      ) : null}
    </Rahmen>
  );
}

function VerordnungenKlinisch({ patient, user }: { patient: Patient; user: CurrentUser }) {
  const { data, isPending, isError } = useQuery({
    queryKey: ['patient-prescriptions-clinical', patient.id],
    queryFn: () => fetchPatientPrescriptionsClinical(patient.id),
    retry: false,
  });

  return (
    <Rahmen patient={patient} user={user}>
      <Zustand
        isPending={isPending}
        isError={isError}
        leer={data?.length === 0}
        darfSchreiben={canWritePrescriptions(user.roles)}
      />
      {data && data.length > 0 ? (
        <Jahresliste prescriptions={data} patient={patient} user={user} mitKlinik />
      ) : null}
    </Rahmen>
  );
}
