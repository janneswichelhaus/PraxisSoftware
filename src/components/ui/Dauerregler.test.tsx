import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { pruefeBarrierefreiheit } from '@/barrierefreiheit';
import { Dauerregler } from './Dauerregler';
import { dauerKurz, dauerLang, dauerStufen, naechsteStufe } from './dauer';

/**
 * Der Dauerregler (ORG-007, ANN-606): bis eine Stunde in 5 Minuten, darüber
 * in Viertelstunden; „−5“ und „+5“ fein über die ganze Skala; Tastatur und
 * Vorlesetext vom nativen Regler.
 */

function Probe({ start = 30, max = 360, min }: { start?: number; max?: number; min?: number }) {
  const [wert, setWert] = useState(start);
  return (
    <Dauerregler
      beschriftung="Dauer"
      wert={wert}
      onAendern={setWert}
      max={max}
      {...(min === undefined ? {} : { min })}
      zusatz={`bis ${wert}`}
    />
  );
}

function regler() {
  return screen.getByRole('slider', { name: 'Dauer' });
}

describe('dauerStufen', () => {
  it('geht bis eine Stunde in 5 Minuten, darüber in Viertelstunden', () => {
    const stufen = dauerStufen(5, 360);
    expect(stufen.slice(0, 13)).toEqual([5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 75]);
    expect(stufen.at(-1)).toBe(360);
    expect(stufen).toHaveLength(12 + 20);
    expect(dauerStufen(5, 600)).toHaveLength(12 + 36);
  });

  it('endet an einem Höchstwert zwischen zwei Stufen und beginnt auf 5 Minuten', () => {
    expect(dauerStufen(5, 100).slice(-3)).toEqual([75, 90, 100]);
    expect(dauerStufen(5, 40).at(-1)).toBe(40);
    expect(dauerStufen(3, 20)).toEqual([5, 10, 15, 20]);
  });

  it('findet die nächste Stufe, bei Gleichstand die kleinere', () => {
    const stufen = dauerStufen(5, 360);
    expect(stufen[naechsteStufe(stufen, 65)]).toBe(60);
    expect(stufen[naechsteStufe(stufen, 70)]).toBe(75);
    expect(stufen[naechsteStufe(stufen, 85)]).toBe(90);
    expect(stufen[naechsteStufe(stufen, 1000)]).toBe(360);
  });

  it('schreibt die Dauer kurz und zum Vorlesen', () => {
    expect(dauerKurz(45)).toBe('45\u00a0min');
    expect(dauerKurz(60)).toBe('1\u00a0h');
    expect(dauerKurz(75)).toBe('1\u00a0h 15\u00a0min');
    expect(dauerLang(75)).toBe('1 Stunde 15 Minuten');
    expect(dauerLang(120)).toBe('2 Stunden');
    expect(dauerLang(5)).toBe('5 Minuten');
    expect(dauerLang(1)).toBe('1 Minute');
  });
});

describe('Dauerregler', () => {
  it('zeigt die Dauer groß, die Zusatzzeile und liest sie vor', async () => {
    render(<Probe start={75} />);
    expect(screen.getByText('1 h 15 min')).toBeInTheDocument();
    expect(screen.getByText('bis 75')).toBeInTheDocument();
    expect(regler()).toHaveAttribute('aria-valuetext', '1 Stunde 15 Minuten');
    expect(regler()).toHaveAttribute('type', 'range');
    await pruefeBarrierefreiheit(document.body);
  });

  it('stellt mit dem Regler auf die Stufen - Minuten und Stunden ohne Umschalten', () => {
    render(<Probe />);
    const r = regler();
    expect(r).toHaveAttribute('max', '31');
    fireEvent.change(r, { target: { value: '0' } });
    expect(r).toHaveAttribute('aria-valuetext', '5 Minuten');
    fireEvent.change(r, { target: { value: '11' } });
    expect(r).toHaveAttribute('aria-valuetext', '1 Stunde');
    fireEvent.change(r, { target: { value: '12' } });
    expect(r).toHaveAttribute('aria-valuetext', '1 Stunde 15 Minuten');
    fireEvent.change(r, { target: { value: '31' } });
    expect(r).toHaveAttribute('aria-valuetext', '6 Stunden');
  });

  it('stellt mit −5 und +5 fein, auch über einer Stunde, und hält die Grenzen', async () => {
    const nutzer = userEvent.setup();
    render(<Probe start={60} max={90} />);
    const plus = screen.getByRole('button', { name: '5 Minuten mehr' });
    const minus = screen.getByRole('button', { name: '5 Minuten weniger' });
    expect(plus).toHaveTextContent('+5');
    await nutzer.click(plus);
    expect(regler()).toHaveAttribute('aria-valuetext', '1 Stunde 5 Minuten');
    // Zwischen zwei Stufen steht der Daumen an der nächsten.
    expect(regler()).toHaveValue('11');
    for (let i = 0; i < 6; i += 1) await nutzer.click(plus);
    expect(regler()).toHaveAttribute('aria-valuetext', '1 Stunde 30 Minuten');
    expect(plus).toBeDisabled();
    await nutzer.click(minus);
    expect(regler()).toHaveAttribute('aria-valuetext', '1 Stunde 25 Minuten');
  });

  it('geht nicht unter das Mindeste', async () => {
    const nutzer = userEvent.setup();
    render(<Probe start={10} />);
    const minus = screen.getByRole('button', { name: '5 Minuten weniger' });
    await nutzer.click(minus);
    expect(regler()).toHaveAttribute('aria-valuetext', '5 Minuten');
    expect(minus).toBeDisabled();
  });

  it('bedient sich mit der Tastatur: Pfeile eine Stufe, Bild eine Stunde, Pos1 und Ende', async () => {
    const nutzer = userEvent.setup();
    render(<Probe start={55} />);
    regler().focus();
    await nutzer.keyboard('{ArrowRight}');
    expect(regler()).toHaveAttribute('aria-valuetext', '1 Stunde');
    await nutzer.keyboard('{ArrowUp}');
    expect(regler()).toHaveAttribute('aria-valuetext', '1 Stunde 15 Minuten');
    await nutzer.keyboard('{ArrowLeft}{ArrowDown}');
    expect(regler()).toHaveAttribute('aria-valuetext', '55 Minuten');
    await nutzer.keyboard('{PageUp}');
    expect(regler()).toHaveAttribute('aria-valuetext', '1 Stunde 55 Minuten');
    await nutzer.keyboard('{PageDown}{PageDown}');
    expect(regler()).toHaveAttribute('aria-valuetext', '5 Minuten');
    await nutzer.keyboard('{End}');
    expect(regler()).toHaveAttribute('aria-valuetext', '6 Stunden');
    await nutzer.keyboard('{ArrowRight}');
    expect(regler()).toHaveAttribute('aria-valuetext', '6 Stunden');
    await nutzer.keyboard('{Home}');
    expect(regler()).toHaveAttribute('aria-valuetext', '5 Minuten');
  });

  it('geht von einem Wert zwischen zwei Stufen zur nächsten darüber oder darunter', async () => {
    const nutzer = userEvent.setup();
    render(<Probe start={65} />);
    regler().focus();
    await nutzer.keyboard('{ArrowRight}');
    expect(regler()).toHaveAttribute('aria-valuetext', '1 Stunde 15 Minuten');
    await nutzer.click(screen.getByRole('button', { name: '5 Minuten mehr' }));
    regler().focus();
    await nutzer.keyboard('{ArrowLeft}');
    expect(regler()).toHaveAttribute('aria-valuetext', '1 Stunde 15 Minuten');
  });

  it('gibt den Knöpfen mindestens 44 px', () => {
    render(<Probe />);
    for (const name of ['5 Minuten weniger', '5 Minuten mehr']) {
      expect(screen.getByRole('button', { name }).className).toMatch(/\bh-12\b/);
    }
  });
});
