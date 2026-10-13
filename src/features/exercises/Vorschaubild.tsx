import { Medienbild } from '@/components/ui/Medienbild';
import type { Uebungsbild as Bild } from './bild/schema';
import { Uebungsbild } from './bild/Uebungsbild';

/**
 * Die Vorschau einer Übung für den Platz `bild` einer `ListRow` (56 × 56 px,
 * 1:1; DESIGN.md „Bild, Übungszeichnung"). Bibliothek, Auswahlblatt und
 * Planeditor zeigen dasselbe kleine Bild.
 *
 * Stumm für Vorlesesoftware, auch als Platzhalter: Der Name steht in der
 * Zeile daneben, und „Noch kein Bild“ vor jedem Namen einer eigenen Übung
 * wäre nur Lärm. Ohne Bild (eigene Übungen der Praxis) steht der Platzhalter
 * des `Medienbild` - die Zeilen bleiben bündig.
 */
export function Vorschaubild({ bild, name }: { bild: Bild | null; name: string }) {
  return (
    <span aria-hidden="true" className="block size-14">
      <Medienbild vorschau alt="">
        {bild ? (
          <Uebungsbild
            bild={bild}
            name={name}
            darstellung="vorschau"
            dekorativ
            className="size-full"
          />
        ) : null}
      </Medienbild>
    </span>
  );
}
