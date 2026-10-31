// Die Schnittstelle von Termine: Andere Bereiche importieren nur, was hier einzeln steht (ANN-748).
// Seiten verdrahtet `src/routes` direkt; Art, Zustand und Wege des Termins stehen in `@/lib/termin`.

export {
  appointmentToFormValues,
  cancelAppointment,
  cancellationReasonSchema,
  completeAppointment,
  fensterEnde,
  fetchAppointment,
  fetchAppointments,
  fetchPatientAppointments,
  leererTermin,
  reopenAppointment,
  schreibfehler,
  updateAppointment,
  waehlbareAbsagegruende,
  type Appointment,
  type AppointmentFormValues,
  type CalendarEntry,
  type CancellationReason,
} from './api';
export { fetchAbrechnungslage, positionText, type Abrechnungslage } from './abrechnungslage-api';
export { useAbrechnungslage } from './useAbrechnungslage';
export { fetchKurzblick } from './kurzblick-api';
export { dokumentiertOhneHaken, hakenFehlt, hakenZuruecknehmbar } from './haken';
export { tageslageNeuLaden } from './tageslage';
export { tagUmplanenAdresse } from './tagumplanen';
export { fetchTerminTage, type TerminTag } from './terminTage';
export { useAppointmentFormLists } from './useAppointmentFormLists';
export { TerminErweiterungenKontext, type TerminErweiterungen } from './erweiterungen';

export { AppointmentForm, HomeVisitAddressHint } from './AppointmentForm';
export { DaysToReschedule } from './DaysToReschedule';
export { FolgeterminVorschlaege } from './FolgeterminVorschlaege';
export { FreigabeNachHaken } from './FreigabeNachHaken';
export { HomeVisitFlow } from './HomeVisitFlow';
export { LeistungAmTermin } from './LeistungAmTermin';
export { LetzterEintragVorDerTuer } from './Kurzblick';
export { NavigationZumTermin } from './NavigationStarten';
export { NichtAngetroffenAktion } from './NichtAngetroffen';
export { TerminAbschliessenKnopf } from './TerminAbschliessen';
