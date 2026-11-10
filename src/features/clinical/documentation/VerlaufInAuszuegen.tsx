import { fetchPatientTreatmentNotesPage } from './api';
import { Auszugsliste } from './Auszugsliste';
import { useAuszuege } from './auszuege';
import { quellenAus } from './auszugsquellen';

/**
 * Vor der Sitzung: aus den letzten Einträgen je bis zu zwei Sätze, wörtlich und mit dem Weg zum
 * Eintrag. Gelesen wird erst auf Verlangen, über den Lesepfad der Akte mit seinem Protokoll.
 */
export function VerlaufInAuszuegen({ patientId, hier }: { patientId: string; hier: string }) {
  const auszuege = useAuszuege({
    akteId: patientId,
    lade: async () => quellenAus(await fetchPatientTreatmentNotesPage(patientId, null), hier),
  });
  return auszuege.angeboten ? <Auszugsliste auszuege={auszuege} /> : null;
}
