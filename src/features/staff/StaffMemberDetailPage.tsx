import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { PageHeader } from '@/components/ui/PageHeader';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { DetailList, DetailRow } from '@/components/ui/DetailList';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { Section } from '@/components/ui/Section';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Textlink } from '@/components/ui/Textlink';
import { Laengenzeichen } from '@/features/appointments/Laengenzeichen';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import {
  appointmentTypeHint,
  fetchAssignableTherapists,
  formatLocalDate,
  formatLocalTimeRange,
  todayInTimeZone,
} from '@/features/appointments/api';
import { Rueckmeldung } from '@/features/appointments/Rueckmeldungen';
import { BEGRIFFE } from '@/lib/begriffe';
import { formatDate } from '@/lib/datum';
import { telHref } from '@/lib/telefon';
import { fullName } from '@/features/patients/api';
import {
  canManageAppointments,
  canManageStaffAccounts,
  canManageStaffEmployment,
  canManageStaffMasterData,
  isOwner,
  type CurrentUser,
} from '@/features/session/types';
import { StaffAccountSection } from './StaffAccountSection';
import { StaffCalendarSection } from './StaffCalendarSection';
import { StaffCompensationSection } from './StaffCompensationSection';
import {
  fetchStaffFutureAppointments,
  fetchStaffMember,
  setStaffEmploymentStatus,
  sindTermineOffen,
  type StaffMember,
} from './api';

/**
 * Eine Kontaktangabe als Weg, nicht als Text (UX-012).
 *
 * Dieselbe Entscheidung wie in der Patientenakte (Oberflächen-Checkliste
 * Punkt 8): Wer im Mitarbeiterdatensatz nachsieht, will in aller Regel gleich
 * anrufen oder schreiben - und tippt die Nummer sonst am Handy ab.
 *
 * Als `Textlink` mit Tippziel von 44 px (RSP-05, UIK-15): Bis UXR-011 war die
 * Nummer ein 20 px hoher Link ohne Unterstreichung, von Text kaum zu
 * unterscheiden.
 */
function KontaktZeile({
  label,
  wert,
  schema,
}: {
  label: string;
  wert: string | null;
  schema: 'tel' | 'mailto';
}) {
  // Ohne Wert keine Zeile - „—" sagt nichts (UX-005i).
  if (!wert) return null;
  const ziel = schema === 'tel' ? telHref(wert) : `mailto:${wert}`;
  return (
    <DetailRow label={label}>
      <Textlink href={ziel} alleinstehend>
        {wert}
      </Textlink>
    </DetailRow>
  );
}

/**
 * Liste der Termine, die eine Deaktivierung offen ließe.
 *
 * Sie ist der Kern der Rückfrage: die Termine verschwinden nicht, sie werden
 * nicht abgesagt und nicht umgebucht - sie bleiben stehen und müssen von der
 * Praxis geregelt werden. Genau das muss vor der Bestätigung sichtbar sein.
 */
function OffeneTermine({ staffMemberId, timeZone }: { staffMemberId: string; timeZone: string }) {
  const { data, isPending, isError } = useQuery({
    queryKey: ['staff-future-appointments', staffMemberId],
    queryFn: () => fetchStaffFutureAppointments(staffMemberId),
    retry: false,
  });

  if (isPending) return <LoadingState label="Zukünftige Termine werden geladen …" />;
  if (isError) {
    return (
      <Statusmeldung ton="fehler" className="mt-2">
        Die zukünftigen Termine konnten nicht geladen werden. Bitte vor der Deaktivierung im
        Kalender prüfen.
      </Statusmeldung>
    );
  }
  if (data.length === 0) return null;

  return (
    <ul className="divide-line border-line mt-3 divide-y border-y text-sm">
      {data.map((termin) => (
        <li key={termin.id} className="py-2">
          <span className="text-ink block">
            {formatLocalDate(termin.starts_at, timeZone)} ·{' '}
            {formatLocalTimeRange(termin.starts_at, termin.ends_at, timeZone)}{' '}
            {/* §8.1: abweichende Länge gekennzeichnet (CAL-020). */}
            <Laengenzeichen termin={termin} />
          </span>
          <span className="text-ink-muted block">
            {/* Eine Fehlzeit des Praxisbetriebs steht mit seinem Titel da
                (CAL-015b) - es hängt an dieser Person genauso. Ein
                Trainingstermin steht nur als Belegung da: Der Kontext ist ein
                Metadatum, kein Inhalt (ADR-022 Punkt 11); Person und Grundlage
                gehören nicht in diese Liste und stehen auch nicht darin. */}
            {termin.kind === 'internal'
              ? (termin.title ?? BEGRIFFE.fehlzeit)
              : termin.kind === 'training'
                ? 'Trainingstermin'
                : `${termin.patient_given_name ?? ''} ${termin.patient_family_name ?? ''}`.trim()}
            {/* Nur eine abweichende Terminart steht dran (ANN-192). */}
            {appointmentTypeHint(termin.appointment_type)
              ? ` · ${appointmentTypeHint(termin.appointment_type)}`
              : ''}
            {termin.location_name ? ` · ${termin.location_name}` : ''}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Wechsel des Beschäftigungsstatus.
 *
 * Zweistufig, wie der Server es verlangt: Der erste Versuch läuft ohne
 * Bestätigung. Sind noch zukünftige Termine geplant, weist der Server ihn ab,
 * ohne irgendetwas zu schreiben. Erst danach zeigt die Oberfläche die
 * betroffenen Termine und bietet die ausdrückliche Bestätigung an.
 *
 * Die Rückfrage ist damit keine reine Bildschirmhöflichkeit - ohne sie kommt
 * der Vorgang serverseitig nicht durch (STAFF-001).
 *
 * Nach dem Wechsel steht eine Bestätigung an der Stelle des Knopfs und nimmt
 * den Fokus (ZST-16): Bis UXR-011 änderte sich nur der Seitenkopf, am Telefon
 * weit über dem Knopf.
 */
function StatusAktion({ staff, timeZone }: { staff: StaffMember; timeZone: string | null }) {
  const queryClient = useQueryClient();
  const zielStatus: StaffMember['employment_status'] =
    staff.employment_status === 'active' ? 'inactive' : 'active';
  const [meldung, setMeldung] = useState<{ text: string; nr: number } | null>(null);

  const mutation = useMutation({
    mutationFn: (bestaetigt: boolean) => setStaffEmploymentStatus(staff.id, zielStatus, bestaetigt),
    onSuccess: async () => {
      const text = zielStatus === 'inactive' ? 'Als inaktiv geführt.' : 'Wieder als aktiv geführt.';
      await queryClient.invalidateQueries({ queryKey: ['staff-members'] });
      await queryClient.invalidateQueries({ queryKey: ['staff-member', staff.id] });
      await queryClient.invalidateQueries({ queryKey: ['assignable-therapists'] });
      setMeldung((vorher) => ({ text, nr: (vorher?.nr ?? 0) + 1 }));
    },
  });

  const beschriftung = zielStatus === 'inactive' ? 'Als inaktiv führen' : 'Wieder als aktiv führen';
  const termineOffen = sindTermineOffen(mutation.error);

  return (
    <div className="flex w-full flex-col items-start gap-3">
      <Rueckfrage
        ausloeser={beschriftung}
        bezeichnung={`${beschriftung} – Rückfrage`}
        bestaetigen={termineOffen ? 'Trotz offener Termine deaktivieren' : beschriftung}
        bestaetigenLaeuft="Wird geändert …"
        fehler={
          mutation.isError && !termineOffen
            ? 'Der Beschäftigungsstatus konnte nicht geändert werden. Bitte die Verbindung prüfen und erneut versuchen.'
            : undefined
        }
        laeuft={mutation.isPending}
        onBestaetigen={() => mutation.mutateAsync(termineOffen)}
        onAbbrechen={() => {
          mutation.reset();
          setMeldung(null);
        }}
      >
        <p>
          {zielStatus === 'inactive'
            ? 'Diese Person wird nicht mehr für neue Terminzuweisungen angeboten. Bestehende Termine, Arbeitszeiten und alle bisherigen Zuordnungen bleiben vollständig erhalten. Der Zugang zur Anwendung wird dadurch nicht gesperrt.'
            : 'Diese Person wird wieder für Terminzuweisungen angeboten.'}
        </p>

        {/* Der zweite Anlauf ist kein Fehler, sondern eine bewusste Bestaetigung:
            die Termine bleiben stehen und muessen von der Praxis geregelt werden.
            Deshalb stehen sie hier, bevor bestaetigt wird. */}
        {termineOffen ? (
          <div role="alert" className="mt-3">
            <p className="text-danger text-sm font-medium">
              Für diese Person sind noch Termine in der Zukunft geplant.
            </p>
            <p className="text-ink-muted mt-1 text-sm">
              Sie werden weder abgesagt noch umgebucht. Nach der Deaktivierung müssen sie im
              Kalender einer aktiven Person zugeordnet oder abgesagt werden.
            </p>
            {timeZone ? <OffeneTermine staffMemberId={staff.id} timeZone={timeZone} /> : null}
          </div>
        ) : null}
      </Rueckfrage>
      {meldung ? <Rueckmeldung key={meldung.nr}>{meldung.text}</Rueckmeldung> : null}
    </div>
  );
}

function StaffDetail({ staff, user }: { staff: StaffMember; user: CurrentUser }) {
  /**
   * Kalender und Arbeitszeiten stehen nur zur Verfügung, wenn diese Person
   * überhaupt behandelt (UX-012).
   *
   * Beide Ziele arbeiten über `staff_member_id` und kennen nur zuordenbare
   * Personen. Für das Office führten sie auf eine leere Spalte und eine
   * Auswahl ohne passenden Eintrag - ein Angebot, das keins ist.
   */
  const therapeuten = useQuery({
    queryKey: ['assignable-therapists'],
    queryFn: fetchAssignableTherapists,
    retry: false,
    // Wie in der Liste (BEF-034): trainer fragt nicht, was die Datenbank
    // ihm ohnehin verweigert; Kalender und Arbeitszeiten sind ihm nicht offen.
    enabled: canManageAppointments(user.roles),
  });
  const behandelt = (therapeuten.data ?? []).some((t) => t.staff_member_id === staff.id);
  const zone = user.organizationTimeZone;
  // Zwei getrennte Rechte seit E10: Stammdaten pflegt auch das Office, den
  // Beschaeftigungsstatus wechselt nur die Praxisinhaber:in.
  const darfStammdaten = canManageStaffMasterData(user.roles);
  const darfBeschaeftigung = canManageStaffEmployment(user.roles);
  const darfZugang = canManageStaffAccounts(user.roles);
  const aktiv = staff.employment_status === 'active';
  const adresse = [staff.street, [staff.postal_code, staff.city].filter(Boolean).join(' ')]
    .filter(Boolean)
    .join(', ');
  // Privatangaben kommen für Rollen ohne Zugriff gar nicht erst an.
  const privatSichtbar =
    staff.date_of_birth !== null ||
    staff.private_email !== null ||
    staff.private_phone !== null ||
    adresse !== '';

  return (
    <>
      <PageHeader
        title={fullName(staff)}
        description={aktiv ? undefined : 'Inaktiv – wird nicht mehr für neue Termine angeboten.'}
        actions={
          darfStammdaten ? (
            // Ein Seitenwechsel im Knopfstil des Systems (ORG-16, TOK-11):
            // bis UXR-011 ein Nachbau in Tinte mit 15 px und 500.
            <ButtonLink to={`/praxis/team/${staff.id}/bearbeiten`} variant="secondary">
              Stammdaten bearbeiten
            </ButtonLink>
          ) : null
        }
      />

      <Section titel="Dienstlich" rahmen>
        <DetailList>
          <KontaktZeile label="Diensttelefon" wert={staff.work_phone} schema="tel" />
          <KontaktZeile label="Dienstliche E-Mail" wert={staff.work_email} schema="mailto" />
          {/* Keine Zeile „Beschäftigung": Aktiv ist der Regelfall, inaktiv
              steht im Seitenkopf. Leere Angaben nehmen keine Zeile (UX-005i). */}
          {staff.primary_location_name ? (
            <DetailRow label="Hauptstandort">{staff.primary_location_name}</DetailRow>
          ) : null}
          {/* Die beiden Fragen, die am Mitarbeiterdatensatz tatsächlich
              anschließen: „wann arbeitet die Person" und „was hat sie vor".
              Beide waren vorher nur über die Hauptnavigation und eine erneute
              Auswahl erreichbar (UX-012). */}
          {behandelt ? (
            <DetailRow label="Planung">
              <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <Textlink
                  to={`/kalender?ansicht=woche${zone ? `&datum=${todayInTimeZone(zone)}` : ''}&person=${staff.id}`}
                  alleinstehend
                  className="text-sm"
                >
                  Woche im Kalender
                </Textlink>
                <Textlink
                  to={`/praxis/planung?person=${staff.id}`}
                  alleinstehend
                  className="text-sm"
                >
                  {BEGRIFFE.arbeitszeiten}
                </Textlink>
              </span>
            </DetailRow>
          ) : null}
          {/* Warum eine aktive Person nicht im Kalender steht, sagte bis
              UXR-011 nur die Liste (ORG-25). Nur mit geladener Antwort - ohne
              sie keine Aussage (ORG-14). */}
          {aktiv && therapeuten.isSuccess && !behandelt ? (
            <DetailRow label="Planung">
              Nicht für Termine zuordenbar – dafür braucht die Person einen Zugang mit der Rolle
              Therapeut:in oder Teamleitung.
            </DetailRow>
          ) : null}
        </DetailList>
      </Section>

      {privatSichtbar ? (
        <Section titel="Privat" rahmen>
          <DetailList>
            {staff.date_of_birth ? (
              <DetailRow label="Geburtsdatum">{formatDate(staff.date_of_birth)}</DetailRow>
            ) : null}
            <KontaktZeile label="Privattelefon" wert={staff.private_phone} schema="tel" />
            <KontaktZeile label="Private E-Mail" wert={staff.private_email} schema="mailto" />
            {adresse ? <DetailRow label="Adresse">{adresse}</DetailRow> : null}
          </DetailList>
        </Section>
      ) : null}

      {/* AKTE-009: in den Kalender nehmen, ohne dass die Person ihren Zugang
          selbst einrichtet (ANN-226). Allein owner, wie der Zugang. */}
      {isOwner(user.roles) ? <StaffCalendarSection staff={staff} /> : null}

      {darfZugang ? <StaffAccountSection staff={staff} eigeneUserId={user.profile.id} /> : null}

      {/* Vergütungsmodell (STA-005): allein owner, wie Beschäftigungsstatus. */}
      {isOwner(user.roles) ? <StaffCompensationSection staff={staff} /> : null}

      {darfBeschaeftigung ? (
        <div className="mt-5 flex">
          <StatusAktion staff={staff} timeZone={user.organizationTimeZone} />
        </div>
      ) : null}
      {/* Keine Fußnote mehr: Was die Deaktivierung mit dem Zugang macht, sagt
          ihre Rückfrage; den Rest erklärte sie nur das System (UX-005i). */}
    </>
  );
}

export function StaffMemberDetailPage({ user }: { user: CurrentUser }) {
  const { staffMemberId } = useParams<{ staffMemberId: string }>();

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ['staff-member', staffMemberId],
    queryFn: () => fetchStaffMember(staffMemberId!),
    enabled: Boolean(staffMemberId),
    retry: false,
  });

  return (
    <>
      <Rueckweg standard="/praxis/team" beschriftung="Zurück zu den Mitarbeitenden" />

      {data ? (
        <StaffDetail staff={data} user={user} />
      ) : (
        <>
          {/* Auch ohne Daten trägt die Seite einen Titel (UIK-16). */}
          <PageHeader title="Mitarbeiter:in" />
          {isPending ? <LoadingState label="Mitarbeiterdaten werden geladen …" /> : null}
          {isError ? (
            <ErrorState
              title="Die Mitarbeiterdaten konnten nicht geladen werden."
              description="Bitte die Verbindung prüfen und später erneut versuchen."
              onErneut={() => void refetch()}
            />
          ) : null}
          {data === null ? (
            <ErrorState
              title="Nicht gefunden"
              description="Diese Person gibt es nicht oder sie ist für Ihren Zugang nicht freigegeben."
            />
          ) : null}
        </>
      )}
    </>
  );
}
