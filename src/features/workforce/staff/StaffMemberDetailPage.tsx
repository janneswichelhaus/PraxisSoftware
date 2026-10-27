import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useParams, useSearchParams } from 'react-router-dom';
import { Badge } from '@/components/ui/Badge';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Inhaltsflaeche } from '@/components/ui/Card';
import { DetailList, DetailRow } from '@/components/ui/DetailList';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Objektkopf } from '@/components/ui/Objektkopf';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { Rueckmeldung } from '@/components/ui/Rueckmeldung';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Textlink } from '@/components/ui/Textlink';
import { Zwischentitel } from '@/components/ui/Zwischentitel';
import { VERBINDUNG_PRUEFEN } from '@/components/ui/abfrageTexte';
import { BEGRIFFE } from '@/lib/begriffe';
import { formatDate, formatLocalDate, formatLocalTimeRange, todayInTimeZone } from '@/lib/datum';
import { leseRueckweg, rueckwegBeschriftung } from '@/lib/rueckweg';
import { telHref } from '@/lib/telefon';
import { fullName } from '@/features/patients';
import {
  canManageAppointments,
  canManageStaffAccounts,
  canManageStaffEmployment,
  canManageStaffMasterData,
  isOwner,
  type CurrentUser,
} from '@/features/core';
import { StaffAccountSection } from './StaffAccountSection';
import { StaffEinsatz } from './StaffEinsatz';
import { Suchreiterleiste } from '@/components/ui/Reiterleiste';
import { useOffenerReiter, type Suchreiter } from '@/components/ui/offenerReiter';
import {
  fetchStaffFutureAppointments,
  fetchStaffMember,
  setStaffEmploymentStatus,
  sindTermineOffen,
  type StaffMember,
  fetchAssignableTherapists,
} from './api';
import { leseMeldung } from '@/lib/meldung';
import { appointmentTypeHint } from '@/lib/termin';
import { Laengenzeichen } from '@/components/ui/Laengenzeichen';

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
    // Zeilen mit Linie dazwischen, wie die Zeilen einer Liste - in der
    // Rückfrage ohne eigene Karte (Leitfaden L2).
    <ul className="border-line mt-3 border-y text-sm">
      {data.map((termin) => (
        <li key={termin.id} className="border-line border-t py-2 first:border-t-0">
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
        // Leise am Ende des Reiters (DESIGN.md, Zerstörendes): Der Wechsel
        // ist selten und hat Folgen; die Rückfrage sagt welche.
        ausloeserVariante="quiet"
        bezeichnung={`${beschriftung} – Rückfrage`}
        bestaetigen={termineOffen ? 'Trotz offener Termine deaktivieren' : beschriftung}
        bestaetigenLaeuft="Wird geändert …"
        fehler={
          mutation.isError && !termineOffen
            ? `Der Beschäftigungsstatus konnte nicht geändert werden. ${VERBINDUNG_PRUEFEN}`
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

/** Die Reiter der Mitarbeiter:in: Einsatz, Zugang, Kontakt (DESIGN.md „Objekt“). */
type Bereich = 'kontakt' | 'einsatz' | 'zugang';

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
  const [suche] = useSearchParams();
  // Ein Vorgang auf einer anderen Seite kommt mit seinem Satz hierher -
  // „Nina Neu ist eingerichtet.“ (Überholung 6, G5).
  const verlaufszustand: unknown = useLocation().state;
  const [meldung] = useState(() => leseMeldung(verlaufszustand));
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

  // Welle B (B7): Objektkopf und Reiter statt acht Abschnitten untereinander.
  // Kontakt für alle Rollen; Einsatz (Kalender, Vergütung, Beschäftigung) und
  // Zugang nur, wer sie verwalten darf - ohne sie keine Reiterleiste.
  // Reiterfolge nach DESIGN.md „Objekt“ (R2-O6): die Arbeit (Einsatz) zuerst
  // und offen, die Stammdaten (Kontakt) zuletzt.
  const bereiche: Suchreiter<Bereich>[] = [
    ...(isOwner(user.roles) || darfBeschaeftigung
      ? [{ wert: 'einsatz' as const, label: 'Einsatz' }]
      : []),
    ...(darfZugang ? [{ wert: 'zugang' as const, label: 'Zugang' }] : []),
    { wert: 'kontakt', label: 'Kontakt' },
  ];
  const offen = useOffenerReiter(
    BEREICH_PARAM,
    bereiche.map((bereich) => bereich.wert),
  );
  const rueckwegZiel = leseRueckweg(suche, '/praxis/team');

  return (
    <>
      <Objektkopf
        titel={fullName(staff)}
        rueckweg={{
          to: rueckwegZiel,
          beschriftung:
            rueckwegZiel === '/praxis/team'
              ? 'Zurück zu den Mitarbeitenden'
              : rueckwegBeschriftung(rueckwegZiel),
        }}
        meta={staff.primary_location_name ?? 'Ohne festen Standort'}
        // Aktiv ist der Regelfall und trägt kein Abzeichen (UX-005i).
        status={aktiv ? null : <Badge>Inaktiv</Badge>}
        aktionen={
          darfStammdaten ? (
            // Ein Seitenwechsel im Knopfstil des Systems (ORG-16, TOK-11).
            <ButtonLink to={`/praxis/team/${staff.id}/bearbeiten`} variant="secondary">
              Stammdaten bearbeiten
            </ButtonLink>
          ) : null
        }
        fuss={aktiv ? null : 'Inaktiv – wird nicht mehr für neue Termine angeboten.'}
        reiter={
          bereiche.length > 1 ? (
            <Suchreiterleiste
              reiter={bereiche}
              param={BEREICH_PARAM}
              label="Bereiche der Mitarbeiter:in"
            />
          ) : null
        }
      />

      {meldung ? <Rueckmeldung className="mt-4">{meldung}</Rueckmeldung> : null}

      <div className="mt-6 min-w-0">
        {offen === 'kontakt' ? (
          <Inhaltsflaeche className="lg:max-w-spalte">
            <Zwischentitel>Dienstlich</Zwischentitel>
            <DetailList>
              <KontaktZeile label="Diensttelefon" wert={staff.work_phone} schema="tel" />
              <KontaktZeile label="Dienstliche E-Mail" wert={staff.work_email} schema="mailto" />
              {/* Keine Zeile „Beschäftigung" und keine zum Hauptstandort: Beides
                  steht im Kopf. Leere Angaben nehmen keine Zeile (UX-005i). */}
              {/* Die beiden Fragen, die am Mitarbeiterdatensatz tatsächlich
                  anschließen: „wann arbeitet die Person" und „was hat sie vor"
                  (UX-012). */}
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
                      to={`/betrieb/arbeitszeit?person=${staff.id}`}
                      alleinstehend
                      className="text-sm"
                    >
                      Arbeitszeit
                    </Textlink>
                  </span>
                </DetailRow>
              ) : null}
              {/* Warum eine aktive Person nicht im Kalender steht (ORG-25). Nur
                  mit geladener Antwort - ohne sie keine Aussage (ORG-14). */}
              {aktiv && therapeuten.isSuccess && !behandelt ? (
                <DetailRow label="Planung">
                  Nicht für Termine zuordenbar – dafür braucht die Person einen Zugang mit der Rolle
                  Therapeut:in oder Teamleitung.
                </DetailRow>
              ) : null}
            </DetailList>

            {/* Eine Karte für beides (Leitfaden L2): Privat ist eine Gruppe mit
                Zwischentitel, kein zweiter Kasten. */}
            {privatSichtbar ? (
              <>
                <Zwischentitel>Privat</Zwischentitel>
                <DetailList>
                  {staff.date_of_birth ? (
                    <DetailRow label="Geburtsdatum">{formatDate(staff.date_of_birth)}</DetailRow>
                  ) : null}
                  <KontaktZeile label="Privattelefon" wert={staff.private_phone} schema="tel" />
                  <KontaktZeile label="Private E-Mail" wert={staff.private_email} schema="mailto" />
                  {adresse ? <DetailRow label="Adresse">{adresse}</DetailRow> : null}
                </DetailList>
              </>
            ) : null}
          </Inhaltsflaeche>
        ) : null}

        {offen === 'einsatz' ? (
          <>
            {/* AKTE-009 und STA-005: ein Formular, ein Speichern. Allein owner,
                wie der Zugang (ANN-226, ANN-157). */}
            {isOwner(user.roles) ? <StaffEinsatz staff={staff} /> : null}
            {/* Der Statuswechsel leise am Ende des Reiters, mit Rückfrage
                (DESIGN.md, Zerstörendes). */}
            {darfBeschaeftigung ? (
              <div className="border-line max-w-formular mt-8 flex border-t pt-6">
                <StatusAktion staff={staff} timeZone={user.organizationTimeZone} />
              </div>
            ) : null}
          </>
        ) : null}

        {offen === 'zugang' && darfZugang ? (
          <StaffAccountSection staff={staff} eigeneUserId={user.profile.id} />
        ) : null}
      </div>
    </>
  );
}

/** Der Suchparameter des offenen Reiters (`?bereich=einsatz`). */
const BEREICH_PARAM = 'bereich';

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
      {/* Ab 640 px als Zeile über dem Kopf; darunter steht derselbe Weg als
          Pfeil vor dem Namen (Objektkopf, RAH-007). Ohne Datensatz bleibt die
          Zeile auch am Telefon - es gibt keinen Kopf mit Pfeil. */}
      <Rueckweg
        standard="/praxis/team"
        beschriftung="Zurück zu den Mitarbeitenden"
        className={data ? 'mb-3 max-sm:hidden' : ''}
      />

      {data ? (
        <StaffDetail staff={data} user={user} />
      ) : (
        <>
          {/* Auch ohne Daten trägt die Seite einen Titel (UIK-16). */}
          <PageHeader title="Mitarbeiter:in" />
          {isPending ? <LoadingState label="Mitarbeiterdaten werden geladen …" inKarte /> : null}
          {isError ? (
            <ErrorState
              title="Die Mitarbeiterdaten konnten nicht geladen werden."
              description={VERBINDUNG_PRUEFEN}
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
