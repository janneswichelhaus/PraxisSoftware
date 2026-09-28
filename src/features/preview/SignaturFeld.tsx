import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';

/**
 * Unterschriftsfeld der Vorlage.
 *
 * Zwei gleichwertige Wege zur Bestätigung, weil ein reines Zeichenfeld mit
 * Tastatur nicht bedienbar wäre: mit dem Finger beziehungsweise der Maus
 * unterschreiben oder den eigenen Namen tippen. Beides führt zum selben
 * Ergebnis - „bestätigt ja/nein".
 *
 * **Der Zustand gehört dem Feld (VOR-03).** Bestätigt ist, was hier gezeichnet
 * oder getippt wurde - nicht, was die Seite zuletzt gemeldet bekam. Bis VOR-03
 * zeigte ein neu aufgebautes Feld „Bestätigung liegt vor." bei leerem Zeichen-
 * und Namensfeld, und wer einen getippten Namen wieder löschte, verlor die
 * Bestätigung trotz Zeichnung. Die Seite erfährt jede Änderung über
 * `onChange`; ein frisches Feld ist immer unbestätigt.
 *
 * Das Bild verlässt die Vorschau nicht: es wird weder hochgeladen noch
 * gespeichert. Eine rechtsverbindliche elektronische Signatur ist das
 * ausdrücklich nicht.
 */
export function SignaturFeld({
  beschriftung,
  erklaerung,
  onChange,
}: {
  beschriftung: string;
  erklaerung?: string;
  onChange: (bestaetigt: boolean) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const zeichnet = useRef(false);
  const [gezeichnet, setGezeichnet] = useState(false);
  const [getippt, setGetippt] = useState('');
  const bestaetigt = gezeichnet || getippt.trim().length > 0;

  function leeren() {
    const canvas = canvasRef.current;
    const kontext = canvas?.getContext('2d');
    if (canvas && kontext) kontext.clearRect(0, 0, canvas.width, canvas.height);
    setGezeichnet(false);
    setGetippt('');
    onChange(false);
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Auflösung an die tatsächliche Anzeigegröße koppeln, sonst wirkt die
    // Linie auf mobilen Geräten grob und versetzt.
    const rect = canvas.getBoundingClientRect();
    const faktor = window.devicePixelRatio || 1;
    canvas.width = Math.round(rect.width * faktor);
    canvas.height = Math.round(rect.height * faktor);
    const kontext = canvas.getContext('2d');
    if (!kontext) return;
    kontext.scale(faktor, faktor);
    kontext.lineWidth = 2;
    kontext.lineCap = 'round';
    kontext.lineJoin = 'round';
    // Die Tinte des Design Systems statt eines eigenen Farbwerts (UEB-20,
    // TOK-08): Bis dahin stand hier der alte Tintenwert, der keiner
    // Palettenänderung folgte. Versteht der Browser den Wert im Zeichenfeld
    // nicht, bleibt der Strich schwarz.
    const tinte = getComputedStyle(canvas).getPropertyValue('--color-ink').trim();
    if (tinte) kontext.strokeStyle = tinte;
  }, []);

  function position(event: React.PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function beginnen(event: React.PointerEvent<HTMLCanvasElement>) {
    const kontext = canvasRef.current?.getContext('2d');
    if (!kontext) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    zeichnet.current = true;
    const { x, y } = position(event);
    kontext.beginPath();
    kontext.moveTo(x, y);
  }

  function ziehen(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!zeichnet.current) return;
    const kontext = canvasRef.current?.getContext('2d');
    if (!kontext) return;
    const { x, y } = position(event);
    kontext.lineTo(x, y);
    kontext.stroke();
    if (!gezeichnet) {
      setGezeichnet(true);
      onChange(true);
    }
  }

  function beenden() {
    zeichnet.current = false;
  }

  return (
    <fieldset className="border-line rounded-card mt-2 border p-4">
      <legend className="text-ink px-1 text-sm font-medium">{beschriftung}</legend>
      {erklaerung ? (
        <p className="text-ink-muted bg-surface-sunken rounded-card px-3 py-2 text-sm">
          {erklaerung}
        </p>
      ) : null}

      <canvas
        ref={canvasRef}
        aria-label="Unterschriftsfeld – mit Finger oder Maus unterschreiben"
        onPointerDown={beginnen}
        onPointerMove={ziehen}
        onPointerUp={beenden}
        onPointerLeave={beenden}
        className="border-line-strong bg-surface rounded-card mt-3 block h-32 w-full max-w-sm touch-none border"
      />

      <div className="mt-2 flex flex-wrap items-end gap-3">
        <Button type="button" variant="secondary" onClick={leeren}>
          Unterschrift löschen
        </Button>
        {/* Das Feld des Systems statt eines eigenen Eingabefelds (UEB-20):
            48 px wie der Knopf daneben, Beschriftung in Tinte. */}
        <div className="min-w-56 flex-1">
          <Field
            label="Oder Namen tippen"
            placeholder="Vorname Nachname"
            value={getippt}
            onChange={(event) => {
              const wert = event.target.value;
              setGetippt(wert);
              onChange(gezeichnet || wert.trim().length > 0);
            }}
          />
        </div>
      </div>

      {/* Der Speichern-Knopf der Seite hängt an dieser Zeile. Vorlesesoftware
          erfährt den Wechsel über die Live-Region (UEB-20) - bewusst ohne
          zweite role="status": Die gehört der Zustandsmeldung der Seite. */}
      <p aria-live="polite" className="text-ink-muted mt-2 text-sm">
        {bestaetigt ? 'Bestätigung liegt vor.' : 'Noch keine Bestätigung.'} Das Bild wird nicht
        gespeichert und ist keine rechtsverbindliche Signatur.
      </p>
    </fieldset>
  );
}
