import { Textlink } from '@/components/ui/Textlink';
import { DokumentFoto } from './DokumentFoto';

/**
 * Verordnung ohne Papier (PRX-011): Die Therapeut:in fotografiert das Rezept
 * am Termin, das Büro tippt es später mit dem Foto daneben ab.
 *
 * ANN-141: Das Foto geht als Verordnungsscan **ohne** Grundlage in die Akte - an der
 * Person, bis das Büro es beim Erfassen zuordnet (ADR-017 Punkt 10). Den Weg
 * selbst (Kameradialog, Dateiwähler, Fotoverlustschutz) teilt es mit dem
 * Anmeldebogen: `DokumentFoto`.
 */
export function PrescriptionPhoto({ patientId }: { patientId: string }) {
  return (
    <DokumentFoto
      patientId={patientId}
      documentType="verordnungsscan"
      anzeigename="Verordnung"
      knopf="Verordnung fotografieren"
      dateiLabel="Verordnung als Datei"
      kameraTitel="Foto der Verordnung"
      kameraHinweis="Das Rezept flach hinlegen und ganz ins Bild nehmen. Das Foto bleibt in der Anwendung und landet nicht in der Mediathek des Geräts."
      vorschauAlt="Foto der Verordnung, noch nicht übergeben"
      wartetText="Noch nicht übergeben."
      speichernKnopf="Ans Büro geben"
      speichernLaeuft="Wird übergeben …"
      einleitung="Neues Rezept dabei? Ein Foto genügt – das Büro erfasst die Grundlage daraus."
      erfolg={
        <>
          Das Foto liegt beim Büro unter <Textlink to="/offen">Offene Punkte</Textlink> und wartet
          aufs Erfassen.
        </>
      }
    />
  );
}
