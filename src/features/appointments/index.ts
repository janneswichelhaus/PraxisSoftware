// Die Schnittstelle von Termine: Andere Bereiche importieren nur, was hier einzeln steht (ANN-748).
// Seiten verdrahtet `src/routes` direkt; Art, Zustand und Wege des Termins stehen in `@/lib/termin`.

export {
  appointmentFormSchema,
  appointmentToFormValues,
  cancelAppointment,
  cancellationReasonSchema,
  completeAppointment,
  fensterEnde,
  fetchAppointment,
  fetchAppointments,
  fetchPatientAppointments,
  istAusserhalbArbeitszeit,
  istVergangenheit,
  leererTermin,
  liegtInVergangenheit,
  reopenAppointment,
  schreibfehler,
  updateAppointment,
  waehlbareAbsagegruende,
  type Appointment,
  type AppointmentFormField,
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
export { speicherfehlerText, terminFehlerliste, terminFeldfehler } from './terminformular';
export { TerminErweiterungenKontext, type TerminErweiterungen } from './erweiterungen';

export { AppointmentFormFields, ArbeitszeitRueckfrage } from './AppointmentFormFields';
export { DaysToReschedule } from './DaysToReschedule';
export { FolgeterminVorschlaege } from './FolgeterminVorschlaege';
export { FreigabeNachHaken } from './FreigabeNachHaken';
export { HomeVisitFlow } from './HomeVisitFlow';
export { LeistungAmTermin } from './LeistungAmTermin';
export { LetzterEintragVorDerTuer } from './Kurzblick';
export { NavigationZumTermin } from './NavigationStarten';
export { NichtAngetroffenAktion } from './NichtAngetroffen';
export { TerminAbschliessenKnopf } from './TerminAbschliessen';
