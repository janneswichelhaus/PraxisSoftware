import { useCallback, useState, type ReactNode } from 'react';
import {
  EINGABETEXTE,
  useTextverlustschutz,
  type Verlustschutztexte,
} from '@/features/documentation/Textverlustschutz';

const TEXTE: Verlustschutztexte = {
  ...EINGABETEXTE,
  bezeichnung: 'Ungespeicherte Eingaben zur Übung',
};

/**
 * Ein Schutz für alle offenen Formulare einer Seite (Sichtung, Oberflächen-
 * Checkliste Punkt 5). Der Router hält nur eine Sperre; die Rückfrage
 * erscheint in dem Formular, in dem gearbeitet wird (Muster der Textbausteine).
 * Einen Entwurf gibt es nicht - also „Verwerfen und weitergehen“ und „Hier
 * bleiben“ (ANN-046).
 */
export function useFormularschutz(): {
  melden: (formularId: string, ungespeichert: boolean) => void;
  schutzFuer: (formularId: string) => ReactNode;
} {
  const [offen, setOffen] = useState<Readonly<Record<string, boolean>>>({});
  const melden = useCallback((formularId: string, ungespeichert: boolean) => {
    setOffen((bisher) =>
      Boolean(bisher[formularId]) === ungespeichert
        ? bisher
        : { ...bisher, [formularId]: ungespeichert },
    );
  }, []);
  const betroffen = Object.keys(offen).find((formularId) => offen[formularId]);
  const { schutz } = useTextverlustschutz({
    ungespeichert: betroffen !== undefined,
    texte: TEXTE,
  });
  return {
    melden,
    schutzFuer: (formularId: string) => (formularId === betroffen ? schutz : null),
  };
}
