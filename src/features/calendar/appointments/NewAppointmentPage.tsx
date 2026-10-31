import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { ErrorState } from '@/components/ui/Feedback';
import { Rueckweg } from '@/components/ui/Rueckweg';
import {
  fetchPatient,
  fullName,
  fetchPatientTreatmentBases,
  grundlageBezeichnung,
} from '@/features/patients';
import { canReadTreatmentBases, type CurrentUser } from '@/features/core';
import { formatDate, todayInTimeZone } from '@/lib/datum';
import { istInternerPfad, leseRueckweg, mitRueckweg, RUECKWEG_PARAM } from '@/lib/rueckweg';
import { AppointmentForm, type AppointmentFormState } from './AppointmentForm';
import { UebernommeneAdresse } from './AppointmentFormFields';
import { TerritoryHint } from '@/features/calendar/territories/TerritoryHint';
import { NachladeHinweis } from '@/components/ui/Rueckmeldung';
import { createAppointment, fensterEnde, leererTermin, type AppointmentFormField } from './api';
import { tageslageNeuLaden } from './tageslage';
import { nachDemAnlegen } from './terminformular';
import { useAppointmentFormLists } from './useAppointmentFormLists';
import {
  kalenderZumTermin,
  leseTerminVorbelegung,
  schreibeTerminVorbelegung,
  TERMINFENSTER_MINUTEN,
  type AppointmentType,
  type TerminVorbelegung,
  DAUER_PARAM,
  leseDauer,
  mitAngelegtemTermin,
} from '@/lib/termin';

/** Kennungen in der Adresszeile werden geprüft, bevor sie weiterreisen. */
const VERORDNUNG_KENNUNG = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Einen Termin für die Patient:in der Akte anlegen. Sie ist Kontext und nicht wechselbar: Ein
 * Wechsel wäre eine andere Aufgabe und erhöhte die Verwechslungsgefahr.
 */
export function NewAppointmentPage({ user }: { user: CurrentUser }) {
  const { patientId } = useParams<{ patientId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const listen = useAppointmentFormLists('therapy');

  const [suche] = useSearchParams();
  // Einmalig: Die Vorbelegung aus der Adresszeile überschreibt spätere Eingaben nicht.
  const [vorbelegung] = useState(() => leseTerminVorbelegung(suche));
  // Vom Weg über die Verordnung: aus welchem Kontingent geplant wird; der Server prüft die Zugehörigkeit.
  const verordnungId = (() => {
    const roh = suche.get('verordnung');
    return roh && VERORDNUNG_KENNUNG.test(roh) ? roh : null;
  })();
  // Den Eintrag der Warteliste schließt der Server in derselben Transaktion wie das Anlegen.
  const wartelisteId = (() => {
    const roh = suche.get('warteliste');
    return roh && VERORDNUNG_KENNUNG.test(roh) ? roh : null;
  })();

  const akte = `/patienten/${patientId ?? ''}`;
  const heute = user.organizationTimeZone ? todayInTimeZone(user.organizationTimeZone) : '';
  // 60 Minuten nach §8.1; nur der Abstecher in die Stammdaten bringt eine gewählte Länge zurück.
  const [anfangsMinuten] = useState(() => leseDauer(suche) ?? TERMINFENSTER_MINUTEN);
  const [startwerte] = useState<Record<AppointmentFormField, string>>(() => ({
    ...leererTermin,
    // „Hausbesuch, ich, heute“ ist der Regelfall; die Adresszeile weiß es genauer.
    appointment_type: vorbelegung.art ?? 'home_visit',
    date: vorbelegung.datum ?? heute,
    start_time: vorbelegung.beginn ?? '',
    // Das Ende folgt aus Beginn und Länge; ein Ende aus der Adresszeile zählt nicht.
    end_time: vorbelegung.beginn ? fensterEnde(vorbelegung.beginn, anfangsMinuten) : '',
    staff_member_id: vorbelegung.person ?? user.staffMemberId ?? '',
  }));

  const patient = useQuery({
    queryKey: ['patient', patientId],
    queryFn: () => fetchPatient(patientId!),
    enabled: Boolean(patientId),
    retry: false,
  });

  // Nur auf dem Weg über eine Verordnung: die organisatorische Sicht der Akte, keine klinischen Felder.
  const grundlagen = useQuery({
    queryKey: ['patient-treatment-bases', patientId],
    queryFn: () => fetchPatientTreatmentBases(patientId!),
    enabled: Boolean(patientId && verordnungId) && canReadTreatmentBases(user.roles),
    retry: false,
  });
  const grundlage = grundlagen.data?.find((eintrag) => eintrag.id === verordnungId) ?? null;
  // Wie in der Akte: „Folgeverordnung vom 18.06.2026“ (ADR-020 Punkt 7).
  const grundlageText = grundlage
    ? `${grundlageBezeichnung(grundlage).bauart} ${grundlageBezeichnung(grundlage).praeposition} ${formatDate(grundlage.issued_on)}`
    : null;

  const weg = useMemo(
    () =>
      user.organizationTimeZone
        ? { patientId: patientId ?? null, zeitzone: user.organizationTimeZone }
        : undefined,
    [patientId, user.organizationTimeZone],
  );

  /** Zurück ins Formular nach dem Abstecher in die Stammdaten, mit allem, was schon steht. */
  function rueckkehrAdresse({ werte, fensterMinuten, dauerGueltig }: AppointmentFormState): string {
    const felder: TerminVorbelegung = { art: werte.appointment_type as AppointmentType };
    if (werte.date) felder.datum = werte.date;
    if (werte.start_time) felder.beginn = werte.start_time;
    if (werte.staff_member_id) felder.person = werte.staff_member_id;
    const teile = new URLSearchParams(schreibeTerminVorbelegung(felder));
    if (dauerGueltig && fensterMinuten !== TERMINFENSTER_MINUTEN) {
      teile.set(DAUER_PARAM, String(fensterMinuten));
    }
    if (verordnungId) teile.set('verordnung', verordnungId);
    if (wartelisteId) teile.set('warteliste', wartelisteId);
    const eingehend = suche.get(RUECKWEG_PARAM);
    if (istInternerPfad(eingehend)) teile.set(RUECKWEG_PARAM, eingehend);
    return `${akte}/termine/neu?${teile.toString()}`;
  }

  // Der Rückweg steht in jedem Zustand der Seite, auch beim Laden und im Fehlerfall.
  const kopf = <Rueckweg standard={akte} beschriftung="Zurück zur Akte" />;

  // Nur ohne Daten ersetzt der Zustand das Formular: Ein gescheitertes Nachladen nimmt keine
  // Eingabe mit. Eine Akte, die es nicht gibt, ist kein Ladefehler.
  if (!patient.data) {
    return (
      <>
        {kopf}
        <Abfragezustand
          abfrage={patient}
          laden="Patientendaten werden geladen …"
          fehler="Die Patientendaten konnten nicht geladen werden."
        >
          {() => (
            <ErrorState
              title="Nicht gefunden"
              description="Diese Akte gibt es nicht oder sie ist für Ihren Zugang nicht freigegeben."
            />
          )}
        </Abfragezustand>
      </>
    );
  }

  const patientDaten = patient.data;

  return (
    <>
      {kopf}

      {/* Nur der Name, als Angabe ohne Punkt. */}
      <PageHeader title="Termin anlegen" description={`Für ${fullName(patientDaten)}`} />

      {patient.isError ? (
        <NachladeHinweis
          className="mb-6"
          laeuft={patient.isFetching}
          onErneut={() => void patient.refetch()}
        />
      ) : null}

      <AppointmentForm
        listen={listen}
        startwerte={startwerte}
        startMinuten={anfangsMinuten}
        heute={heute}
        rasterMinuten={user.appointmentGridMinutes}
        texte={{
          absenden: 'Termin anlegen',
          laeuft: 'Wird angelegt …',
          trotzdem: 'Termin trotzdem anlegen',
          fehlerTitel: 'Der Termin konnte nicht angelegt werden.',
          ungespeichert: 'Ungespeicherter Termin',
        }}
        abbrechenZiel={leseRueckweg(suche, akte)}
        onSpeichern={(werte, b) =>
          createAppointment(
            patientId!,
            werte,
            b.bestaetigt,
            verordnungId,
            b.vergangenheit,
            wartelisteId,
          )
        }
        onGespeichert={async (appointmentId) => {
          // Kalender, Tagesliste, Tour und Fahrpuffer stünden sonst bis zum Neuladen auf dem alten Tag.
          await tageslageNeuLaden(queryClient);
          if (wartelisteId) await queryClient.invalidateQueries({ queryKey: ['waitlist'] });
          // Zurück, wo das Anlegen begann, mit dem neuen Termin; ohne Rückweg zum Termin.
          const rueckweg = nachDemAnlegen(leseRueckweg(suche, ''), wartelisteId !== null);
          void navigate(
            rueckweg
              ? mitAngelegtemTermin(rueckweg, appointmentId)
              : kalenderZumTermin(appointmentId),
            { replace: true },
          );
        }}
        weg={weg}
        vorFeldern={
          // Kein Kasten mit dem Namen: Genannt wird, was die Seite sonst verschwiege.
          <>
            {wartelisteId ? (
              <p className="text-ink mb-3 max-w-prose text-sm">
                Aus der Warteliste: Mit dem Termin wird der Eintrag als eingeplant geschlossen.
              </p>
            ) : null}
            {verordnungId ? (
              <p className="text-ink mb-6 max-w-prose text-sm">
                {grundlageText
                  ? `Der Termin wird dieser Behandlungsgrundlage zugeordnet: ${grundlageText}.`
                  : 'Der Termin wird der Behandlungsgrundlage zugeordnet, aus der er geplant wird.'}
              </p>
            ) : null}
          </>
        }
        hausbesuch={(stand) => (
          <>
            <UebernommeneAdresse
              street={patientDaten.street}
              houseNumber={patientDaten.house_number}
              postalCode={patientDaten.postal_code}
              city={patientDaten.city}
              // Der Abstecher nimmt alle Eingaben mit; deshalb fragt der Schutz hier nicht.
              ergaenzenZiel={mitRueckweg(`${akte}/bearbeiten`, rueckkehrAdresse(stand))}
              onErgaenzen={stand.freigeben}
            />
            {/* Gebietstag der Adresse: warnt, sperrt nichts. */}
            <TerritoryHint
              postalCode={patientDaten.postal_code}
              slots={[{ datum: stand.werte.date, beginn: stand.werte.start_time }]}
            />
          </>
        )}
      />
    </>
  );
}
