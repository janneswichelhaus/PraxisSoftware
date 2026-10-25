import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Aktionsleiste } from '@/components/ui/Aktionsleiste';
import { Button } from '@/components/ui/Button';
import { Rueckmeldung } from '@/components/ui/Rueckmeldung';
import { Textlink } from '@/components/ui/Textlink';
import { Zwischentitel } from '@/components/ui/Zwischentitel';
import { FolgeterminVorschlaege } from '@/features/appointments/FolgeterminVorschlaege';
import { LeistungAmTermin } from '@/features/appointments/LeistungAmTermin';
import { type Appointment } from '@/features/appointments/api';
import {
  canReadExercisePlans,
  canRecordAtAppointment,
  type CurrentUser,
} from '@/features/session/types';
import { mitRueckweg } from '@/lib/rueckweg';
import { PLAENE_ANKER } from './sprungmarke';
import { Schreibflaeche } from './Schreibflaeche';
import { patientName } from '@/lib/termin';

/** Ein Teil des Blocks „Danach“: über eine Linie vom vorigen getrennt (kein Kasten im Kasten). */
const TEIL = 'border-line border-t pt-4 first:border-t-0 first:pt-0';

/**
 * Was nach dem Festschreiben am Besuch noch zu tun ist (Auftrag C1, Muster U1
 * und U8 des Referenzabgleichs): die Leistung zur Kontrolle (seit B7 ohne
 * Bestätigung, mit dem Vorschlag „In die Abrechnung stellen“), Folgetermin
 * anlegen, Übungsplan mitgeben - an einem Ort statt über Akte und Kalender.
 * Jeder Teil erscheint nur, wenn die Rolle ihn darf (Leitfaden L3). Am Vermerk
 * „ohne Behandlung“ gibt es weder Leistung noch Plan: Behandelt wurde nicht.
 */
export function DanachTeile({
  appointment,
  user,
  ohneBehandlung,
  hierher,
}: {
  appointment: Appointment;
  user: CurrentUser;
  ohneBehandlung: boolean;
  /** Die Schreibseite selbst - Rückweg aus Terminsuche und Akte. */
  hierher: string;
}) {
  const behandlung = !ohneBehandlung && appointment.kind === 'therapy';
  const leistung =
    behandlung &&
    canRecordAtAppointment(user.roles, appointment.staff_member_id, user.staffMemberId);
  const plan =
    behandlung && !!appointment.patient_id && canReadExercisePlans(user.roles, 'therapy');

  return (
    <div className="flex flex-col gap-4">
      {leistung ? (
        <div className={`${TEIL} empty:hidden`}>
          <LeistungAmTermin appointment={appointment} user={user} amAbschluss />
        </div>
      ) : null}
      <div className={`${TEIL} empty:hidden`}>
        <FolgeterminVorschlaege appointment={appointment} user={user} hierher={hierher} />
      </div>
      {plan ? (
        <section className={TEIL} aria-labelledby={`plan-${appointment.id}`}>
          <Zwischentitel id={`plan-${appointment.id}`}>Übungsplan</Zwischentitel>
          {/* Die Pläne stehen im Reiter „Doku“ der Akte (UEB-EPIC-002); von
              dort führt das Planblatt zu Druck und QR-Code. Die Sprungmarke
              rollt gleich zu ihnen - am Telefon stehen sie weit unten
              (Praxis-Review R2, P5). Eine eigene Adresse zum Anlegen gibt es
              nicht: Ein Plan entsteht dort mit einem Tipp. */}
          <Textlink
            alleinstehend
            to={mitRueckweg(`/patienten/${appointment.patient_id}/doku#${PLAENE_ANKER}`, hierher)}
            className="gap-1 text-sm font-semibold"
          >
            Plan mitgeben <span aria-hidden="true">→</span>
          </Textlink>
        </section>
      ) : null}
    </div>
  );
}

/**
 * Die Schreibseite nach dem Festschreiben (Auftrag C1): Sie bleibt stehen,
 * sagt, was geschehen ist, und zeigt „Danach“. „Fertig“ führt dorthin, woher
 * die Seite kam - aus der Übersicht zurück in den Tag, wo der nächste Weg
 * wartet - und nimmt die Meldung mit (DOK-15).
 *
 * Ohne Textfeld und ohne Textverlustschutz: Festgeschrieben ist
 * festgeschrieben, hier wird nichts mehr getippt.
 */
export function Danach({
  user,
  appointment,
  kopfzeile,
  kopf,
  meldung,
  ohneBehandlung,
  zurueck,
  zumTermin,
  hierher,
}: {
  user: CurrentUser;
  appointment: Appointment;
  kopfzeile: string;
  /** Statt der Meldung: ein Zustand, etwa „Bereits finalisiert“. */
  kopf?: ReactNode;
  /** Was das Festschreiben bewirkt hat; reist mit „Fertig“ weiter. */
  meldung: string | null;
  ohneBehandlung: boolean;
  zurueck: string;
  zumTermin: string;
  hierher: string;
}) {
  const navigate = useNavigate();
  return (
    <Schreibflaeche zurueck={zurueck} titel={patientName(appointment)} kopfzeile={kopfzeile}>
      <div className="flex-1 px-4 py-4">
        <div className="max-w-spalte flex flex-col gap-6">
          {meldung ? <Rueckmeldung>{meldung}</Rueckmeldung> : kopf}
          <DanachTeile
            appointment={appointment}
            user={user}
            ohneBehandlung={ohneBehandlung}
            hierher={hierher}
          />
        </div>
      </div>
      <Aktionsleiste einbettung="flaeche">
        <Button
          type="button"
          className="ml-auto"
          onClick={() => void navigate(zumTermin, meldung ? { state: { meldung } } : undefined)}
        >
          Fertig
        </Button>
      </Aktionsleiste>
    </Schreibflaeche>
  );
}
