import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Klappbereich, SimulationsMeldung } from './ui';
import type { Protokolleintrag } from './vorschauContext';

const eintrag: Protokolleintrag = {
  id: 'protokoll-vorschau-1',
  zeitpunkt: '2026-09-27T06:56:00.000Z',
  bereich: 'Radflotte',
  vorgang: 'Schlüssel zurückgelegt: Lastenrad 5 (Ersatz)',
  folgen: ['Schlüsselverlauf ergänzt'],
  nichtGeschehen: ['Kein Vorgang gespeichert, keine Benachrichtigung versendet'],
};

/** Eine Aktion weit unter der Meldung, wie an einem Rad in der Liste. */
function MitAktion() {
  const [gezeigt, setGezeigt] = useState<Protokolleintrag | null>(null);
  return (
    <>
      <SimulationsMeldung eintrag={gezeigt} />
      <button type="button" onClick={() => setGezeigt({ ...eintrag })}>
        Auslösen
      </button>
    </>
  );
}

describe('SimulationsMeldung', () => {
  it('holt sich beim Erscheinen den Fokus, damit sie nicht ungesehen bleibt (VOR-01)', async () => {
    const nutzer = userEvent.setup();
    render(<MitAktion />);
    expect(screen.queryByRole('status')).toBeNull();

    await nutzer.click(screen.getByRole('button', { name: 'Auslösen' }));

    const meldung = screen.getByRole('status');
    expect(meldung).toHaveFocus();
    expect(meldung).toHaveTextContent(/Nicht passiert:/);
  });

  it('nimmt den Fokus bei jeder neuen Aktion wieder auf', async () => {
    const nutzer = userEvent.setup();
    render(<MitAktion />);
    const knopf = screen.getByRole('button', { name: 'Auslösen' });

    await nutzer.click(knopf);
    knopf.focus();
    await nutzer.click(knopf);

    expect(screen.getByRole('status')).toHaveFocus();
  });
});

describe('Klappbereich', () => {
  it('traegt im Kopf das Aufklappzeichen des Systems (UEB-03, VOR-20)', () => {
    const { container } = render(
      <Klappbereich titel="Wochenübersicht – wer nutzt wann welches Rad">Inhalt</Klappbereich>,
    );
    const kopf = container.querySelector('summary');
    expect(kopf).toHaveTextContent('Wochenübersicht – wer nutzt wann welches Rad');
    expect(kopf?.querySelector('[data-aufklappzeichen]')).not.toBeNull();
    // Das Zeichen dreht sich am `open` des umgebenden `<details>`.
    expect(container.querySelector('details')).toHaveClass('group');
  });
});
