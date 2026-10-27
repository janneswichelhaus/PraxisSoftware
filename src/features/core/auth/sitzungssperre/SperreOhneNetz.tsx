import { useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/Feedback';
import { Vollseite } from '@/app/Vollseite';
import { ANMELDESAETZE } from '../anmeldefehler';
import { freigebenOhneNetz } from '../freigabeOhneNetz';
import { useFokusNachWechsel } from '../fokus';
import { PasskeyFehler } from '../passkey';
import { usePasskeyVonSelbst } from '../passkeyVonSelbst';

/**
 * Gesperrt und ohne Verbindung (TRK-009, ADR-025 Punkt 16, ADR-024 Punkt 9).
 *
 * Ohne Netz prüft niemand die Sitzung; die Anwendung zeigt deshalb nichts,
 * bis sich die Person mit dem Passkey ihres Kontos ausweist. Das Fenster
 * öffnet sich von selbst wie auf der Sperrseite (Fassung 3). Freigegeben wird
 * nur, was auf dem Gerät liegt - die Seite sagt es. Die App-PIN steht hier
 * nicht: Sie gibt ohne Netz nie frei (Punkt 11).
 */
export function SperreOhneNetz({
  besitzer,
  einleitung = 'Ohne Verbindung öffnet Ihr Passkey nur, was auf diesem Gerät liegt: Ihre Übungen zum Abhaken. Alles andere kommt mit der Verbindung zurück.',
  onFreigegeben,
  onErneut,
}: {
  besitzer: string;
  /** OFF-003: Was auf diesem Gerät liegt, je Kontoart. */
  einleitung?: string | undefined;
  onFreigegeben: () => void;
  /** Mit Verbindung erneut prüfen. */
  onErneut: () => void;
}) {
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const fehlerkasten = useRef<HTMLDivElement>(null);
  useFokusNachWechsel(fehler, () => (fehler ? fehlerkasten.current : null));

  async function mitPasskey(vonSelbst = false) {
    setFehler(null);
    setLaeuft(true);
    try {
      await freigebenOhneNetz(besitzer);
      onFreigegeben();
    } catch (grund) {
      // Den ungefragten Start schließt man einfach; das ist kein Fehler.
      if (!vonSelbst || !(grund instanceof PasskeyFehler && grund.abgebrochen)) {
        setFehler(grund instanceof PasskeyFehler ? grund.message : ANMELDESAETZE.keineVerbindung);
      }
    } finally {
      setLaeuft(false);
    }
  }

  usePasskeyVonSelbst(() => mitPasskey(true), true);

  return (
    <Vollseite
      titel="Gesperrt – ohne Verbindung"
      einleitung={einleitung}
      kleingedrucktes="Übertragen wird erst, wenn Verbindung besteht und Sie die Anwendung wie gewohnt entsperrt haben. Bis dahin bleibt alles auf dem Gerät."
    >
      {fehler ? (
        <div ref={fehlerkasten} tabIndex={-1} className="mb-4">
          <ErrorState title={fehler} />
        </div>
      ) : null}
      <div className="flex flex-col gap-3">
        <Button disabled={laeuft} onClick={() => void mitPasskey()}>
          {laeuft ? 'Wird geprüft …' : 'Mit Passkey öffnen'}
        </Button>
        <Button variant="secondary" onClick={onErneut}>
          Verbindung erneut prüfen
        </Button>
      </div>
    </Vollseite>
  );
}
