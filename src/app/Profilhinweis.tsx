import { useContext, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { NachladefehlerContext } from './nachladefehler';

/**
 * Die Zeile über der Anwendung nach einem gescheiterten Nachladen (BEF-046).
 * Wann sie erscheint und warum die Anwendung dann stehen bleibt, steht in
 * `nachladefehler.ts`.
 */
export function Profilhinweis() {
  const fehler = useContext(NachladefehlerContext);
  const [laeuft, setLaeuft] = useState(false);

  async function erneut() {
    if (!fehler || laeuft) return;
    setLaeuft(true);
    try {
      await fehler.erneut();
    } finally {
      setLaeuft(false);
    }
  }

  if (fehler === undefined) return null;

  // Die Zeile steht immer im Baum, nur ihr Inhalt wechselt - wie die
  // Verbindungsanzeige (NAV-11): Eine Live-Region, die erst mit ihrem Text
  // entsteht, sagt Vorlesesoftware unzuverlässig an.
  return (
    <div role="status" className="nicht-drucken">
      {fehler ? (
        <div className="bg-warnung-soft text-warnung flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-1.5 text-sm">
          <span className="block max-w-prose">
            {/* Das Zeichen der Warnung wie im Badge (DS-001): Farbe trägt nie
                allein. Für Vorlesesoftware ausgeblendet, der Satz sagt es. */}
            <span aria-hidden="true" className="mr-1.5 font-semibold">
              !
            </span>
            <strong className="font-semibold">{fehler.satz}</strong> Eingaben bleiben erhalten.
          </span>
          <Button
            type="button"
            variant="quiet"
            groesse="kompakt"
            disabled={laeuft}
            onClick={() => void erneut()}
          >
            {laeuft ? 'Wird erneut geladen …' : 'Erneut versuchen'}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
