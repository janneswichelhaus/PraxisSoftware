import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { pruefeBarrierefreiheit } from '@/barrierefreiheit';
import { Durchfuehrungsfuss, STAND_VERZOEGERUNG_MS } from './Durchfuehrungsfuss';

afterEach(() => {
  vi.useRealTimers();
});

const naechste = { text: 'Nächste Übung', onClick: () => undefined };

/**
 * Der Fuß der Durchführung (Handoff 2026-10-24, Abschnitt 3): ein Hauptknopf,
 * 56 hoch, und der Übertragungsstand (ANN-710) - „auf diesem Gerät“ erst nach
 * einer Sekunde, damit beim normalen Übertragen nichts flackert.
 */
describe('Durchfuehrungsfuss', () => {
  it('trägt genau einen Hauptknopf in groß und vor dem ersten Haken keinen Stand', async () => {
    const weiter = vi.fn();
    const { container } = render(
      <Durchfuehrungsfuss aktion={{ text: 'Nächste Übung', onClick: weiter }} />,
    );
    const knopf = screen.getByRole('button', { name: 'Nächste Übung' });
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(knopf).toHaveClass('min-h-14', 'w-full', 'bg-accent');
    fireEvent.click(knopf);
    expect(weiter).toHaveBeenCalledOnce();
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    await pruefeBarrierefreiheit(container);
  });

  it('sagt sofort „Übertragen an die Praxis“', () => {
    render(<Durchfuehrungsfuss aktion={naechste} stand="uebertragen" />);
    expect(screen.getByRole('status')).toHaveTextContent('Übertragen an die Praxis');
  });

  it('sagt „auf diesem Gerät“ erst, wenn es eine Sekunde so bleibt', () => {
    vi.useFakeTimers();
    const { rerender } = render(<Durchfuehrungsfuss aktion={naechste} stand="uebertragen" />);
    rerender(<Durchfuehrungsfuss aktion={naechste} stand="geraet" />);
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Übertragen an die Praxis');
    act(() => {
      vi.advanceTimersByTime(STAND_VERZOEGERUNG_MS);
    });
    expect(status).toHaveTextContent('Auf diesem Gerät, noch nicht übertragen');
    expect(status).not.toHaveTextContent('entsperrt');
  });

  it('flackert nicht, wenn der Haken binnen einer Sekunde übertragen ist', () => {
    vi.useFakeTimers();
    const { rerender } = render(<Durchfuehrungsfuss aktion={naechste} />);
    rerender(<Durchfuehrungsfuss aktion={naechste} stand="geraet" />);
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    rerender(<Durchfuehrungsfuss aktion={naechste} stand="uebertragen" />);
    act(() => {
      vi.advanceTimersByTime(STAND_VERZOEGERUNG_MS);
    });
    expect(screen.getByRole('status')).toHaveTextContent('Übertragen an die Praxis');
    expect(screen.getByRole('status')).not.toHaveTextContent('Gerät');
  });

  it('nennt bei gesperrter Anwendung, wann übertragen wird', () => {
    vi.useFakeTimers();
    render(<Durchfuehrungsfuss aktion={naechste} stand="geraet" gesperrt />);
    act(() => {
      vi.advanceTimersByTime(STAND_VERZOEGERUNG_MS);
    });
    expect(screen.getByRole('status')).toHaveTextContent(
      'Auf diesem Gerät, noch nicht übertragen. Übertragen wird, sobald Verbindung besteht und Sie die Anwendung entsperrt haben.',
    );
  });

  it('sendet ein Formular ab oder führt als Link weiter, mit einem leisen zweiten Weg', () => {
    const { rerender } = render(
      <Durchfuehrungsfuss
        aktion={{ text: 'Einheit beenden', form: 'abschluss', disabled: true }}
      />,
    );
    const senden = screen.getByRole('button', { name: 'Einheit beenden' });
    expect(senden).toHaveAttribute('type', 'submit');
    expect(senden).toHaveAttribute('form', 'abschluss');
    expect(senden).toBeDisabled();
    rerender(
      <MemoryRouter>
        <Durchfuehrungsfuss
          aktion={{ text: 'Zur Übersicht', to: '/p' }}
          zweit={{ text: 'Zu den Übungen', to: '/p/uebungen' }}
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: 'Zur Übersicht' })).toHaveClass('min-h-14');
    const leise = screen.getByRole('link', { name: 'Zu den Übungen' });
    expect(leise).toHaveAttribute('href', '/p/uebungen');
    expect(leise).not.toHaveClass('bg-accent');
  });
});
