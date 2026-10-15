import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import {
  fetchAppointment,
  formatLocalDate,
  formatLocalTime,
  patientName,
  recordNoShow,
  type Appointment,
} from './api';
import type { NiemandOeffnetTermin } from './HomeVisitFlow';

/**
 * „Nicht angetroffen" am Praxis- und am Videotermin — ein Schritt ohne
 * Honorar (CAL-014c, ANN-055).
 *
 * Das Protokoll ist ein Hausbesuchsprotokoll; an der Praxistür gibt es nichts
 * zu klingeln, und für das Nichtantreffen in der Praxis gibt es keine
 * Festlegung. Der Hausbesuch führt seit UX-005b seinen eigenen Ablauf
 * („Niemand öffnet?", `HomeVisitFlow`). Verbindlich prüft beides der Server.
 *
 * Die Rückfrage bleibt: Der Vermerk sperrt die Dokumentation und ist damit
 * mehr als ein Haken. Zurückgenommen wird er über „Termin wieder öffnen".
 *
 * Dieselbe Rückfrage steht im Terminfenster und in der Übersicht, dort als
 * „Ausfall“ an Zeile und Karte (B12, `AusfallKnopf`): ein Satz an beiden
 * Orten. Die Übersicht kennt den Bearbeitungsstand nicht - dann liest die
 * Aktion ihn unmittelbar vor dem Vermerk, wie der Haken (`TerminAbschliessen`).
 */
export function NichtAngetroffenAktion({
  appointment,
  melden,
  ausloeser = 'Nicht angetroffen',
  ausloeserVariante = 'secondary',
  ausloeserGroesse = 'normal',
  ausloeserZusatz,
  unterDerReihe = false,
}: {
  appointment: NiemandOeffnetTermin &
    Pick<Appointment, 'patient_given_name' | 'patient_family_name'>;
  melden: (text: string) => void;
  ausloeser?: string;
  /** An der Zeile der Übersicht leise, sonst mit Rahmen. */
  ausloeserVariante?: 'secondary' | 'quiet';
  ausloeserGroesse?: 'normal' | 'kompakt';
  /** Für Vorlesesoftware: wessen Termin (`Rueckfrage`, UEB-10). */
  ausloeserZusatz?: string | undefined;
  /** In einer umbrechenden Knopfreihe: die Frage unter den Knöpfen. */
  unterDerReihe?: boolean;
}) {
  const queryClient = useQueryClient();
  const zone = appointment.organization_time_zone;

  const mutation = useMutation({
    mutationFn: async () => {
      const stand = appointment.updated_at ?? (await fetchAppointment(appointment.id))?.updated_at;
      if (!stand) throw new Error('Der Termin wurde nicht gefunden.');
      await recordNoShow(appointment.id, stand, false);
    },
    onSuccess: () => {
      // Nachladen anstoßen, ohne darauf zu warten (ZST-B01).
      for (const queryKey of [['appointment', appointment.id], ['appointments'], ['day-plan']]) {
        void queryClient.invalidateQueries({ queryKey });
      }
      melden('Als „nicht angetroffen“ vermerkt.');
    },
  });

  return (
    <Rueckfrage
      ausloeser={ausloeser}
      ausloeserVariante={ausloeserVariante}
      ausloeserGroesse={ausloeserGroesse}
      ausloeserZusatz={ausloeserZusatz}
      unterDerReihe={unterDerReihe}
      bestaetigen="Ja, niemand angetroffen"
      bestaetigenLaeuft="Wird vermerkt …"
      fehler={mutation.isError ? mutation.error.message : undefined}
      laeuft={mutation.isPending}
      onBestaetigen={() => mutation.mutateAsync()}
      onAbbrechen={() => mutation.reset()}
    >
      <p>
        Der Termin am {formatLocalDate(appointment.starts_at, zone)} um{' '}
        {formatLocalTime(appointment.starts_at, zone)} Uhr für {patientName(appointment)} wird als
        „nicht angetroffen“ geführt. Der Zeitraum bleibt belegt. Ein Irrtum lässt sich über „Termin
        wieder öffnen“ zurücknehmen.
      </p>
      {/* „Das ist ein organisatorischer Vermerk …" ist gestrichen
          (Design-Handoff 2026-10-01, Abschnitt 1). */}
    </Rueckfrage>
  );
}
