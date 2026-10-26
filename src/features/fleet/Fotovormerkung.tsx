import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Medienbild } from '@/components/ui/Medienbild';
import { Kameradialog } from '@/features/files/Kameradialog';
import { useObjektadressen } from './objektadressen';

/** Höchstens vier Fotos je Stelle und je Check-Up (`app.fleet_photo_limit()`). */
export const FOTOS_JE_STELLE = 4;

/**
 * Fotos, die mit einer Stelle oder einem Check-Up hochgeladen werden, bis
 * dahin nur im Arbeitsspeicher (ADR-017 Punkt 33 sinngemäß, ANN-552): über
 * den Kameradialog der Anwendung, nicht über die Kamera-App - so landet kein
 * Bild in der Mediathek und ihrem Cloud-Backup. Hochgeladen wird erst mit dem
 * Speichern der Meldung, an deren Stelle die Fotos hängen.
 *
 * Nur Gegenstände, nie Personen (Handoff Lastenrad 3D, Abschnitt 6): Das sagt
 * der Kameradialog über dem Bild.
 */
export function Fotovormerkung({
  fotos,
  onFotos,
  titel,
  bezug,
}: {
  fotos: readonly Blob[];
  onFotos: (fotos: Blob[]) => void;
  /** Titel des Kameradialogs, etwa „Foto zu Bremse vorne“. */
  titel: string;
  /** Wofür die Fotos sind, für Vorlesesoftware: „zu Bremse vorne“, „vom ganzen Rad“. */
  bezug: string;
}) {
  const [kamera, setKamera] = useState(false);
  const adressen = useObjektadressen(fotos);
  const voll = fotos.length >= FOTOS_JE_STELLE;

  return (
    <div>
      {fotos.length > 0 ? (
        <ul aria-label={`Fotos ${bezug}`} className="mb-3 flex flex-wrap gap-3">
          {fotos.map((foto, index) => (
            <li key={adressen[index] ?? index} className="flex items-center gap-2">
              <Medienbild
                vorschau
                einpassen="fuellen"
                src={adressen[index] ?? null}
                alt={`Foto ${index + 1} ${bezug}`}
              />
              <Button
                type="button"
                variant="quiet"
                groesse="kompakt"
                aria-label={`Foto ${index + 1} ${bezug} entfernen`}
                onClick={() => onFotos(fotos.filter((eintrag) => eintrag !== foto))}
              >
                Entfernen
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      <Button
        type="button"
        variant="secondary"
        groesse="kompakt"
        disabled={voll}
        onClick={() => setKamera(true)}
      >
        Foto hinzufügen
        <span className="sr-only"> {bezug}</span>
      </Button>
      {voll ? (
        <p className="text-ink-muted mt-2 text-sm">Höchstens {FOTOS_JE_STELLE} Fotos.</p>
      ) : null}
      {kamera ? (
        <Kameradialog
          titel={titel}
          hinweis="Nur das Rad fotografieren – keine Personen, keine Hausnummern, keine Unterlagen."
          onAufnahme={(foto) => {
            onFotos([...fotos, foto]);
            setKamera(false);
          }}
          onSchliessen={() => setKamera(false)}
        />
      ) : null}
    </div>
  );
}
