import { Section } from '@/components/ui/Section';
import { usePatientRecord } from '@/features/patients/akte';
import { canWriteClinicalPatientFiles, type CurrentUser } from '@/features/session/types';
import { Dateiliste } from './Dateiliste';

/**
 * Der Bereich „Dateien" der Patientenakte (DAT-001, ADR-017).
 *
 * Hier stehen die Dateien, die an der **Patient:in** hängen — Befund,
 * Arztbrief, Einwilligung, Vertrag —, und zusätzlich die Verordnungsscans, die
 * an einer Verordnung hängen. Der Scan wird trotzdem **an der Verordnung**
 * hinzugefügt und nicht hier: Er gehört zu einem Auftrag, und ohne den hätte
 * er weder Bezug noch Frist (ADR-017 Punkt 10).
 *
 * Seit E15 sehen alle vier Praxisrollen hier dieselben Dateien (ROL-002).
 * Unterschiedlich ist nur, was hinzugefügt werden darf: klinische Arten allein
 * von den behandelnden Rollen (ADR-017 Punkt 13).
 *
 * Ein fünfter Bereich statt eines Abschnitts in den Stammdaten, weil die
 * Dateien eine eigene Frage beantworten („was liegt uns vor") und die
 * Stammdaten die seltenen Verwaltungsvorgänge tragen (AKTE-005). Wer sie
 * dorthin legte, machte aus zwei Antworten eine lange Seite.
 */
export function PatientFilesPage() {
  const { patient, user } = usePatientRecord();
  return <Dateienbereich patientId={patient.id} user={user} />;
}

export function Dateienbereich({ patientId, user }: { patientId: string; user: CurrentUser }) {
  const klinischSchreiben = canWriteClinicalPatientFiles(user.roles);

  return (
    <Section
      titel="Dateien"
      rahmen
      hinweis="Alles, was als Blatt vorliegt: Befunde, Arztbriefe, Einwilligungen, Verträge — und die Verordnungsscans. Ein Scan wird an seiner Verordnung hinzugefügt."
    >
      <Dateiliste
        patientId={patientId}
        user={user}
        darfHinzufuegen
        leerHinweis={
          klinischSchreiben
            ? 'Noch liegt nichts vor. Eine Datei hinzufügen — oder einen Verordnungsscan an seiner Verordnung.'
            : 'Noch liegt nichts vor. Einwilligungen und Verträge lassen sich hier hinzufügen.'
        }
      />
    </Section>
  );
}
