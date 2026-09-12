import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/Badge';
import { Section } from '@/components/ui/Section';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { canManageAppointments, type CurrentUser } from '@/features/session/types';
import type { Patient } from '@/features/patients/api';
import { formatDate, prescriptionKindLabels } from './api';
import { useVerordnungenDerAkte, zustandLabels, type VerordnungMitZahlen } from './verordnungen';

/**
 * Die laufenden Verordnungen auf der Übersicht der Akte (AKTE-002).
 *
 * Die Frage am Telefon und vor dem Hausbesuch ist immer dieselbe: „Wie viele
 * Behandlungen sind noch übrig, und ist dafür schon ein Termin da?" Genau die
 * beiden Zahlen stehen hier - getrennt benannt, weil sie verschiedene Dinge
 * zählen (ANN-038).
 *
 * Ausgeschöpfte Verordnungen kommen hier nicht vor; sie sind keine
 * Arbeitsaufgabe mehr und stehen im Verordnungsbereich.
 */

/** Wie viele laufende Verordnungen die Übersicht zeigt. */
const ANZAHL = 3;

function Verordnungszeile({
  eintrag,
  patient,
  user,
}: {
  eintrag: VerordnungMitZahlen;
  patient: Patient;
  user: CurrentUser;
}) {
  const { verordnung, kontingent, zustand } = eintrag;
  const offeneEinheiten = kontingent ? Math.max(kontingent.prescribed - kontingent.used, 0) : null;
  const planbar = zustand === 'offen' && patient.status === 'active';

  return (
    <li className="border-line border-t py-2.5 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <Link
          to={`/patienten/${patient.id}/verordnungen#verordnung-${verordnung.id}`}
          className="text-ink text-[0.9375rem] font-medium hover:underline"
        >
          {prescriptionKindLabels[verordnung.prescription_kind]} vom{' '}
          {formatDate(verordnung.issued_on)}
        </Link>
        <Badge ton={zustand === 'offen' ? 'akzent' : 'neutral'}>{zustandLabels[zustand]}</Badge>
      </div>

      {kontingent ? (
        // Zwei Zeilen statt einer Zahl: „noch 3 von 10" allein ließ offen,
        // wovon - Einheiten oder Terminen.
        <dl className="mt-1 flex flex-wrap gap-x-6 gap-y-0.5 text-sm">
          <div className="flex gap-1.5">
            <dt className="text-ink-muted">Leistungseinheiten</dt>
            <dd className="text-ink">
              {offeneEinheiten} von {kontingent.prescribed} offen
            </dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="text-ink-muted">Termine</dt>
            <dd className="text-ink">
              {kontingent.upcoming === 0
                ? 'keiner vereinbart'
                : `${kontingent.upcoming} bevorstehend`}
            </dd>
          </div>
        </dl>
      ) : null}

      {canManageAppointments(user.roles) && planbar ? (
        <Link
          to={`/patienten/${patient.id}/verordnungen/${verordnung.id}/serie`}
          className="text-accent inline-flex min-h-11 items-center text-sm hover:underline"
        >
          Terminserie anlegen
        </Link>
      ) : null}
    </li>
  );
}

export function AktuelleVerordnungen({ patient, user }: { patient: Patient; user: CurrentUser }) {
  const { aktuell, eintraege, isPending, isError, verborgen } = useVerordnungenDerAkte(
    patient.id,
    user,
  );

  if (verborgen) return null;

  const gezeigt = aktuell.slice(0, ANZAHL);

  return (
    <Section titel="Laufende Verordnungen">
      {isPending ? <LoadingState label="Verordnungen werden geladen …" /> : null}
      {isError ? <ErrorState title="Die Verordnungen konnten nicht geladen werden." /> : null}

      {!isPending && !isError && aktuell.length === 0 ? (
        <p className="text-ink-muted text-[0.9375rem]">
          {eintraege.length === 0
            ? 'Noch keine Verordnung erfasst.'
            : 'Keine laufende Verordnung — alle erfassten sind ausgeschöpft.'}
        </p>
      ) : null}

      {gezeigt.length > 0 ? (
        <ul>
          {gezeigt.map((eintrag) => (
            <Verordnungszeile
              key={eintrag.verordnung.id}
              eintrag={eintrag}
              patient={patient}
              user={user}
            />
          ))}
        </ul>
      ) : null}

      <Link
        to={`/patienten/${patient.id}/verordnungen`}
        className="text-accent mt-2 inline-flex min-h-11 items-center text-sm hover:underline"
      >
        {aktuell.length > gezeigt.length
          ? `Alle Verordnungen (${eintraege.length})`
          : 'Alle Verordnungen'}
      </Link>
    </Section>
  );
}
