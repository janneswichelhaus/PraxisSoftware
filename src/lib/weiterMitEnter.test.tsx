import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { weiterMitEnter } from './weiterMitEnter';

function Formular({ onSubmit }: { onSubmit: () => void }) {
  return (
    <form
      onKeyDown={weiterMitEnter}
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <input aria-label="Vorname" />
      <input aria-label="Gesperrt" disabled />
      <details>
        <summary>Mehr</summary>
        <input aria-label="Verborgen" />
      </details>
      <textarea aria-label="Zugang" />
      <input aria-label="Ort" />
      <button type="submit">Anlegen</button>
    </form>
  );
}

describe('weiterMitEnter (K11)', () => {
  it('springt mit Enter ins nächste erreichbare Feld und schickt nicht ab', () => {
    const onSubmit = vi.fn();
    render(<Formular onSubmit={onSubmit} />);
    const vorname = screen.getByLabelText('Vorname');
    vorname.focus();
    fireEvent.keyDown(vorname, { key: 'Enter' });
    // Gesperrtes und Eingeklapptes werden übersprungen.
    expect(screen.getByLabelText('Zugang')).toHaveFocus();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('lässt Enter im Textfeld und im letzten Feld unberührt', () => {
    render(<Formular onSubmit={vi.fn()} />);
    const zugang = screen.getByLabelText('Zugang');
    zugang.focus();
    const imTextfeld = fireEvent.keyDown(zugang, { key: 'Enter' });
    expect(imTextfeld).toBe(true);
    const ort = screen.getByLabelText('Ort');
    ort.focus();
    // Nicht verhindert: Der Browser schickt das Formular ab wie mit dem Knopf.
    expect(fireEvent.keyDown(ort, { key: 'Enter' })).toBe(true);
  });
});
