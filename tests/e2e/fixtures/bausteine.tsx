import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { TextArea } from '@/components/ui/TextArea';
import { BausteinFeld } from '@/features/assessments/BausteinFeld';
import { useBausteinAuswahl } from '@/features/assessments/bausteinauswahl';
import { bausteinEinfuegen } from '@/features/documentation/textbausteine';
import '@/index.css';

/**
 * Einstieg der Prüfseite aus `bausteine.html` (FRB-EPIC-003).
 *
 * Das Textfeld und das Bausteinfeld, wie sie in „Behandlung abschließen"
 * stehen — ohne Termin, ohne Server, ohne Router. Die Tests stammen aus der
 * Bibliothek des Releases.
 */
export function Seite() {
  const [text, setText] = useState('Synthetisch: Erstbefund Knie rechts.');
  const bausteine = useBausteinAuswahl();

  return (
    <div className="mx-auto flex max-w-2xl flex-col px-4 py-6">
      <TextArea
        label="Eintrag zur Behandlung"
        hint="Freitext. Was hier steht, wird mit dem Abschluss Bestandteil der Akte."
        rows={8}
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      <BausteinFeld
        bausteine={bausteine}
        onUebernehmen={(vorschlag) => setText((bisher) => bausteinEinfuegen(bisher, vorschlag))}
        hinweis="Übernommen wird der Vorschlag mit „In den Text übernehmen“. Abgeschlossen wird erst, wenn er im Text steht oder verworfen ist."
      />
    </div>
  );
}

const wurzel = document.getElementById('wurzel');
if (!wurzel) throw new Error('Wurzelelement der Prüfseite fehlt.');
createRoot(wurzel).render(<Seite />);
