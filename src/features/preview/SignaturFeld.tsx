import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';

/**
 * Unterschriftsfeld der Vorlage.
 *
 * Zwei gleichwertige Wege zur Bestätigung, weil ein reines Zeichenfeld mit
 * Tastatur nicht bedienbar wäre: mit dem Finger beziehungsweise der Maus
 * unterschreiben oder den eigenen Namen tippen. Beides führt zum selben
 * Ergebnis - „bestätigt ja/nein".
 *
 * Das Bild verlässt die Vorschau nicht: es wird weder hochgeladen noch
 * gespeichert. Eine rechtsverbindliche elektronische Signatur ist das
 * ausdrücklich nicht.
 */
export function SignaturFeld({
  beschriftung,
  erklaerung,
  unterschrieben,
  onChange,
}: {
  beschriftung: string;
  erklaerung?: string;
  unterschrieben: boolean;
  onChange: (unterschrieben: boolean) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const zeichnet = useRef(false);
  const [getippt, setGetippt] = useState('');

  const leeren = useCallback(() => {
    const canvas = canvasRef.current;
    const kontext = canvas?.getContext('2d');
    if (canvas && kontext) kontext.clearRect(0, 0, canvas.width, canvas.height);
    setGetippt('');
    onChange(false);
  }, [onChange]);

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
    kontext.strokeStyle = '#1f2933';
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
    if (!unterschrieben) onChange(true);
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
        <div className="flex min-w-56 flex-1 flex-col gap-1.5">
          <label htmlFor="signatur-getippt" className="text-ink-muted text-sm">
            Oder Namen tippen (barrierefreie Alternative)
          </label>
          <input
            id="signatur-getippt"
            type="text"
            value={getippt}
            placeholder="Vorname Nachname"
            onChange={(event) => {
              setGetippt(event.target.value);
              onChange(event.target.value.trim().length > 0);
            }}
            className="border-line-strong bg-surface text-ink placeholder:text-ink-subtle rounded-field min-h-11 w-full border px-3 text-base"
          />
        </div>
      </div>

      <p className="text-ink-subtle mt-2 text-sm">
        {unterschrieben ? 'Bestätigung liegt vor.' : 'Noch keine Bestätigung.'} Das Bild wird nicht
        gespeichert und ist keine rechtsverbindliche Signatur.
      </p>
    </fieldset>
  );
}
