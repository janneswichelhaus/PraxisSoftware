import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Section } from '@/components/ui/Section';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import {
  fetchPatientenfotos,
  gibPatientenfotoHeraus,
  herausgabeDateiname,
  type Patientenfoto,
} from './patientenfotos';

/**
 * Fotos an die Person herausgeben (DOK-006d, ADR-017 Punkt 40).
 *
 * Steht auf der Seite der Betroffenenrechte, weil es kein Weg im Alltag ist:
 * Die Person verlangt eine Kopie (Art. 15 Abs. 3 DSGVO) oder ihre Daten zum
 * Mitnehmen (Art. 20 DSGVO), und `owner` gibt sie heraus — Foto für Foto,
 * jedes protokolliert (ANN-128). Dieselbe Datei ließe sich an jeden anderen
 * weitergeben; genau deshalb gibt es diesen Weg nur hier und nur für
 * `owner`. Verbindlich prüft die Datenbank.
 *
 * **Keine Erfolgsmeldung ohne Erfolg (DAT-19).** Ob der Browser die Datei
 * speichert, nachfragt oder der Speichern-Dialog abgebrochen wird, sieht die
 * Seite nicht. Sie meldet deshalb, was sie weiß: Die Kopie ist übergeben und
 * die Herausgabe protokolliert - ob die Datei angekommen ist, prüft, wer sie
 * herausgibt. Herausgabeweg, Protokoll und Freigabe der Objekt-URL sind
 * unverändert (ANN-128).
 */
function sichern(name: string, bild: Blob): void {
  const adresse = URL.createObjectURL(bild);
  const anker = document.createElement('a');
  anker.href = adresse;
  anker.download = herausgabeDateiname(name);
  anker.click();
  URL.revokeObjectURL(adresse);
}

function Zeile({ foto }: { foto: Patientenfoto }) {
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [erledigt, setErledigt] = useState(false);

  async function herausgeben() {
    setFehler(null);
    setLaeuft(true);
    try {
      const { name, bild } = await gibPatientenfotoHeraus(foto.id);
      sichern(name, bild);
      setErledigt(true);
    } catch (ursache) {
      setFehler((ursache as Error).message);
    } finally {
      setLaeuft(false);
    }
  }

  return (
    <li className="border-line border-t py-3 first:border-t-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-ink text-liste min-w-0 font-medium wrap-anywhere">{foto.display_name}</p>
        {/* Dasselbe Verb auf Knopf und Laufanzeige (WRT-10): Es entsteht ein
            Download, keine Sicherung. */}
        <Button
          type="button"
          variant="secondary"
          groesse="kompakt"
          onClick={() => void herausgeben()}
          disabled={laeuft}
        >
          {laeuft ? 'Wird heruntergeladen …' : 'Kopie für die Person herunterladen'}
          <span className="sr-only">: {foto.display_name}</span>
        </Button>
      </div>
      {erledigt ? (
        <Statusmeldung className="mt-2">
          Kopie zum Speichern übergeben und protokolliert. Bitte prüfen, ob die Datei angekommen
          ist.
        </Statusmeldung>
      ) : null}
      {fehler ? (
        <Statusmeldung ton="fehler" className="mt-2">
          {fehler}
        </Statusmeldung>
      ) : null}
    </li>
  );
}

export function FotoHerausgabe({ patientId }: { patientId: string }) {
  const fotos = useQuery({
    queryKey: ['patient-photos', patientId],
    queryFn: () => fetchPatientenfotos(patientId),
    retry: false,
  });

  return (
    // Eine Liste wie die übrigen der Seite, also im Rahmen (DAT-21).
    <Section
      titel="Fotos herausgeben"
      rahmen
      hinweis="Die Auskunft nennt jedes Foto, enthält es aber nicht. Hier entsteht je Foto eine Kopie für die Person selbst (Art. 15 Abs. 3 und Art. 20 DSGVO) – der einzige Weg, auf dem ein Foto die Anwendung verlässt. Jede Kopie wird protokolliert."
    >
      {fotos.isPending ? <LoadingState label="Fotos werden geladen …" /> : null}
      {fotos.isError ? (
        <ErrorState
          title="Die Fotos konnten nicht geladen werden."
          description="Bitte die Verbindung prüfen und erneut versuchen."
          onErneut={() => fotos.refetch()}
        />
      ) : null}
      {fotos.data && fotos.data.length === 0 ? (
        <EmptyState title="Keine Fotos" description="Für diese Person liegt kein Foto vor." />
      ) : null}
      {fotos.data && fotos.data.length > 0 ? (
        <ul className="flex flex-col">
          {fotos.data.map((foto) => (
            <Zeile key={foto.id} foto={foto} />
          ))}
        </ul>
      ) : null}
    </Section>
  );
}
