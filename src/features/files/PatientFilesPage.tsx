import { Section } from '@/components/ui/Section';
import { Textlink } from '@/components/ui/Textlink';
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
 *
 * **Fotos der Person gehören nicht hierher (DAT-01).** Sie entstehen mit
 * Einwilligung und Frist im Behandlungsverlauf; der Hinweis sagt das und führt
 * hin, bevor jemand ein Knie als „Befund" ablegt - die „scharfe Kante" aus
 * ADR-017 (Konsequenzen der Fassung 2).
 */
export function PatientFilesPage() {
  const { patient, user } = usePatientRecord();
  return <Dateienbereich patientId={patient.id} user={user} />;
}

export function Dateienbereich({ patientId, user }: { patientId: string; user: CurrentUser }) {
  const klinischSchreiben = canWriteClinicalPatientFiles(user.roles);
  const akte = `/patienten/${patientId}`;

  return (
    // Gerahmt ist nur die Liste - das Hinzufügen darunter ist ein Formular
    // (UI-002c, DAT-21).
    <Section
      titel="Dateien"
      // UX-005e: Ein Satz statt dreier - geblieben ist nur die „scharfe
      // Kante" aus ADR-017: Fotos der Person gehören nicht hierher (DAT-01).
      hinweis={
        <>
          Fotos der Person – Region, Haltung, Narbe – entstehen{' '}
          <Textlink to={`${akte}/verlauf`}>im Behandlungsverlauf</Textlink> unter „Fotos“.
        </>
      }
    >
      <Dateiliste
        patientId={patientId}
        user={user}
        darfHinzufuegen
        rahmen
        leerHinweis={
          klinischSchreiben
            ? 'Noch liegt nichts vor. Eine Datei hinzufügen – oder einen Verordnungsscan an seiner Verordnung.'
            : 'Noch liegt nichts vor. Einwilligungen und Verträge lassen sich hier hinzufügen.'
        }
        leerAktion={
          klinischSchreiben ? (
            <Textlink to={`${akte}/verordnungen`} alleinstehend>
              Zu den Behandlungsgrundlagen
            </Textlink>
          ) : undefined
        }
      />
    </Section>
  );
}
