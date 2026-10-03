import { Section } from '@/components/ui/Section';
import {
  canReadPatientFiles,
  canWriteClinicalPatientFiles,
  canWriteTreatmentBases,
  type CurrentUser,
} from '@/features/session/types';
import type { PatientFile } from './api';
import { Dateiliste } from './Dateiliste';
import { useDateien } from './dateien';
import { artenImBereich, dateibereich } from './dokumentarten';

/**
 * Die Dateien der Akte, verteilt auf die Reiter (AKTE-007, ADR-017).
 *
 * Bis AKTE-007 gab es einen eigenen Bereich „Dateien". Jetzt steht jede Datei
 * im Reiter, zu dem sie gehört - welcher das ist, sagt allein `dateibereich`
 * in `dokumentarten.ts`. Jeder Ausschnitt fragt dieselbe Liste
 * (`list_patient_files`, ein Abfrageschlüssel) und zeigt nur seinen Teil; der
 * Filter ist Ordnung, keine Zugriffskontrolle (ADR-004).
 *
 * Seit E15 sehen alle vier Praxisrollen dieselben Dateien (ROL-002).
 * Unterschiedlich ist nur, was hinzugefügt werden darf: klinische Arten allein
 * von den behandelnden Rollen (ADR-017 Punkt 13).
 */

function imBereich(bereich: ReturnType<typeof dateibereich>) {
  return (datei: PatientFile) => dateibereich(datei.document_type) === bereich;
}

function ohneGrundlage(datei: PatientFile): boolean {
  return dateibereich(datei.document_type) === 'grundlagen' && datei.treatment_basis_id === null;
}

/**
 * Doku: Befund, Arztbrief, klinisches Bild. Hinzufügen nur die behandelnden
 * Rollen - die Arten sind klinisch.
 *
 * Fotos der Person stehen nicht hier, sondern darüber unter „Fotos": Sie
 * entstehen mit Kamera, Einwilligung und Frist (DAT-01, ADR-017 „scharfe
 * Kante").
 */
export function DokuDateien({ patientId, user }: { patientId: string; user: CurrentUser }) {
  if (!canReadPatientFiles(user.roles)) return null;
  return (
    <Section titel="Dateien zu Befund und Behandlung">
      <Dateiliste
        patientId={patientId}
        user={user}
        darfHinzufuegen={canWriteClinicalPatientFiles(user.roles)}
        auswahl={imBereich('doku')}
        hinzufuegbar={artenImBereich('doku')}
        rahmen
        hinzufuegenEingeklappt="Dokument hinzufügen"
        leerHinweis="Noch kein Befund, Arztbrief oder klinisches Bild."
        leerKompakt
      />
    </Section>
  );
}

/** Stammdaten, beim Anmeldebogen: Einwilligung und Vertrag als Scan. */
export function AnmeldebogenDateien({ patientId, user }: { patientId: string; user: CurrentUser }) {
  if (!canReadPatientFiles(user.roles)) return null;
  return (
    <Dateiliste
      patientId={patientId}
      user={user}
      darfHinzufuegen
      auswahl={imBereich('anmeldebogen')}
      hinzufuegbar={artenImBereich('anmeldebogen')}
      titel="Unterschriebene Blätter"
      hinzufuegenEingeklappt="Unterschriebenes Blatt hinzufügen"
      hinzufuegenEingeklapptWeitere="Weiteres Blatt hinzufügen"
      leerKompakt
    />
  );
}

/**
 * Stammdaten, „Sonstige Dateien": was keinem Reiter zugeordnet ist. Heute
 * leer, solange jede Art einen Bereich hat; steht nur, wenn es etwas zeigt -
 * auch nicht als Ladeanzeige (die Liste lädt ohnehin für die anderen Teile).
 */
export function SonstigeDateien({ patientId, user }: { patientId: string; user: CurrentUser }) {
  const { dateien } = useDateien(patientId, user);
  if (!dateien.some(imBereich('sonstige'))) return null;
  return (
    <div className="mt-8">
      <Dateiliste
        patientId={patientId}
        user={user}
        darfHinzufuegen={false}
        auswahl={imBereich('sonstige')}
        titel="Sonstige Dateien"
        leerKompakt
      />
    </div>
  );
}

/**
 * Behandlungsgrundlagen: Verordnungsfotos, die noch an keiner Grundlage
 * hängen (PRX-011, ANN-141). Die zugeordneten stehen an ihrer Grundlage; ohne
 * diesen Ausschnitt wäre ein offener Scan in der Akte nirgends zu sehen.
 */
export function OffeneVerordnungsfotos({
  patientId,
  user,
}: {
  patientId: string;
  user: CurrentUser;
}) {
  const { dateien } = useDateien(patientId, user);
  if (!dateien.some(ohneGrundlage)) return null;
  return (
    <div className="mb-6">
      <Dateiliste
        patientId={patientId}
        user={user}
        // Löschen folgt der Grundlage (PRX-010); hinzugefügt wird der Scan an
        // der Grundlage selbst, deshalb keine Art zur Wahl.
        darfHinzufuegen={canWriteTreatmentBases(user.roles)}
        auswahl={ohneGrundlage}
        hinzufuegbar={[]}
        titel="Verordnungsfotos ohne Grundlage"
        leerKompakt
      />
    </div>
  );
}
