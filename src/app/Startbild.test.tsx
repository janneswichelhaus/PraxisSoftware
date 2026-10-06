import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { Startbild } from './Startbild';
import {
  BILDENDE,
  REDUZIERT_DAUER,
  STARTBILD_DAUER,
  ankommen,
  bildZu,
  geraetFuer,
  landeplatz,
  mitte,
  verwandeln,
} from './startbildGeometrie';
import { STARTBILD_MERKER } from '@/lib/startbildMerker';

/**
 * Das Startbild „Speiche wird O" (Handoff Rahmen vom 2026-10-05, Abschnitt 6;
 * RAH-009): Szenenfolge nach Zeit, Merker, Überspringen, reduzierte Bewegung.
 *
 * Die Uhr ist gestellt: `requestAnimationFrame` und `performance.now` laufen
 * mit den unechten Zeitgebern, ein Bild alle 16 ms.
 */

function fenster(breite: number, hoehe = 800) {
  Object.defineProperty(window, 'innerWidth', { value: breite, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: hoehe, configurable: true });
}

function reduzierteBewegung(aktiv: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (abfrage: string) => ({
      matches: aktiv && abfrage.includes('prefers-reduced-motion'),
      media: abfrage,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }),
  });
}

function laufenLassen(sekunden: number) {
  act(() => {
    vi.advanceTimersByTime(Math.round(sekunden * 1000));
  });
}

function startbild() {
  return document.querySelector('[data-startbild]');
}

function bild(): string | undefined {
  return startbild()?.getAttribute('data-bild') ?? undefined;
}

describe('Startbild: Cue-Tabelle und Kurven', () => {
  it('ordnet jeder Zeit ihr Bild zu', () => {
    expect(bildZu(0)).toBe(1);
    expect(bildZu(0.11)).toBe(1);
    expect(bildZu(0.12)).toBe(2);
    expect(bildZu(0.67)).toBe(2);
    expect(bildZu(0.68)).toBe(3);
    expect(bildZu(1.03)).toBe(3);
    expect(bildZu(1.04)).toBe(4);
    expect(bildZu(1.33)).toBe(4);
    expect(bildZu(1.34)).toBe(5);
    expect(bildZu(1.47)).toBe(5);
    expect(bildZu(1.48)).toBe(6);
    expect(bildZu(1.8)).toBe(6);
    expect(STARTBILD_DAUER).toBe(BILDENDE.abgang);
  });

  it('kennt genau zwei Kurven, beide von 0 nach 1', () => {
    for (const kurve of [ankommen, verwandeln]) {
      expect(kurve(0)).toBe(0);
      expect(kurve(1)).toBe(1);
      expect(kurve(-1)).toBe(0);
      expect(kurve(2)).toBe(1);
      const mitte = kurve(0.5);
      expect(mitte).toBeGreaterThan(0);
      expect(mitte).toBeLessThan(1);
    }
    // Ankommen bremst früh, Verwandeln startet langsam.
    expect(ankommen(0.3)).toBeGreaterThan(verwandeln(0.3));
  });

  it('wählt das Gerät an der Fensterbreite und setzt die Marke mittig', () => {
    expect(geraetFuer(375)).toBe('handy');
    expect(geraetFuer(639)).toBe('handy');
    expect(geraetFuer(640)).toBe('tablet');
    expect(geraetFuer(1023)).toBe('tablet');
    expect(geraetFuer(1024)).toBe('pc');
    // 300 breit bei 390 × 844: x 45, y um 360 (Handoff).
    const handy = mitte('handy', 390, 844);
    expect(handy.breite).toBe(300);
    expect(handy.x).toBe(45);
    expect(Math.round(handy.y)).toBe(365);
    expect(mitte('tablet', 834, 1112).breite).toBe(420);
    expect(mitte('pc', 1280, 800).breite).toBe(640);
    // Nie breiter als das Fenster minus 32.
    expect(mitte('handy', 320, 568).breite).toBe(288);
  });

  it('landet auf der Marke des Rahmens, wenn er schon steht, sonst auf seinen Maßen', () => {
    document.body.innerHTML = '';
    const handy = landeplatz('handy');
    expect([handy.x, handy.y]).toEqual([16, 16]);
    expect(handy.breite).toBeCloseTo(62.85, 1);
    const pc = landeplatz('pc');
    expect([pc.x, pc.y]).toEqual([32, 32]);
    expect(pc.breite).toBeCloseTo(94.28, 1);

    const link = document.createElement('a');
    link.setAttribute('data-startbild-ziel', 'kopfzeile');
    const marke = document.createElement('img');
    marke.getBoundingClientRect = () => ({ left: 16, top: 17, width: 63, height: 24 }) as DOMRect;
    link.append(marke);
    document.body.append(link);
    expect(landeplatz('handy')).toEqual({ x: 16, y: 17, breite: 63 });
    document.body.innerHTML = '';
  });
});

describe('Startbild', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    reduzierteBewegung(false);
    fenster(1280);
    vi.useFakeTimers({
      toFake: [
        'setTimeout',
        'clearTimeout',
        'setInterval',
        'clearInterval',
        'Date',
        'performance',
        'requestAnimationFrame',
        'cancelAnimationFrame',
      ],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    document.documentElement.classList.remove('startbild-landung');
  });

  it('läuft die sechs Bilder in 1,8 s durch und meldet das Ende', () => {
    const onFertig = vi.fn();
    render(<Startbild onFertig={onFertig} />);

    // Der Merker steht beim Start, nicht erst am Ende.
    expect(window.sessionStorage.getItem(STARTBILD_MERKER)).toBe('1');
    const huelle = startbild()!;
    expect(huelle).toHaveAttribute('aria-hidden', 'true');
    expect(huelle).toHaveAttribute('data-geraet', 'pc');
    expect(bild()).toBe('1');

    // Bild 2: das Laufrad mit 14 Speichen und Nabe rollt herein.
    laufenLassen(0.3);
    expect(bild()).toBe('2');
    const rad = huelle.querySelector('svg[data-rad]')!;
    expect(rad.querySelectorAll('line')).toHaveLength(14);
    expect(rad.querySelector('circle')).not.toBeNull();
    expect(huelle.querySelector('img')).toBeNull();

    // Bild 3: Speichen ziehen sich zur Nabe, die Felge wird zum O.
    laufenLassen(0.6);
    expect(bild()).toBe('3');

    // Bild 4: W und N wischen auf, MOTION fährt ein - nur als beschnittene
    // Kopien der Markendatei, nie umgefärbt.
    laufenLassen(0.3);
    expect(bild()).toBe('4');
    for (const teil of ['w', 'n', 'motion']) {
      const kopie = huelle.querySelector<HTMLImageElement>(`img[data-marke="${teil}"]`)!;
      expect(kopie, teil).not.toBeNull();
      expect(kopie.getAttribute('src')).toBe('/marke/own-motion-block-farbig.svg');
      expect(kopie.style.clipPath).toMatch(/^inset\(/);
      expect(kopie.getAttribute('alt')).toBe('');
    }

    // Bild 5: harter Schnitt auf die unveränderte Datei.
    laufenLassen(0.2);
    expect(bild()).toBe('5');
    const voll = huelle.querySelector<HTMLImageElement>('img[data-marke="voll"]')!;
    expect(voll.style.clipPath).toBe('');
    expect(voll.style.width).toBe('640px');

    // Bild 6: Die Seitenleiste schiebt sich von links herein, die Seite
    // blendet gestaffelt ein, die Fläche geht.
    laufenLassen(0.25);
    expect(bild()).toBe('6');
    expect(huelle.querySelector('[data-leiste]')).not.toBeNull();
    expect(document.documentElement.classList.contains('startbild-landung')).toBe(true);
    expect(onFertig).not.toHaveBeenCalled();

    laufenLassen(0.25);
    expect(onFertig).toHaveBeenCalledTimes(1);
  });

  it('wechselt am Rechner auf die Papier-Fassung, sobald die Marke über Tiefgrün steht', () => {
    render(<Startbild onFertig={vi.fn()} />);
    laufenLassen(BILDENDE.abgang - 0.02);
    const voll = document.querySelector<HTMLImageElement>('img[data-marke="voll"]')!;
    expect(voll.getAttribute('src')).toBe('/marke/own-motion-block-papier.svg');
    // Kein Umfärben: eine eigene Datei, kein Filter, keine Farbe am Bild.
    expect(voll.style.filter).toBe('');
  });

  it('führt am Tablet M und O als Paar in die Kachel und blendet den Rest aus', () => {
    fenster(834, 1112);
    render(<Startbild onFertig={vi.fn()} />);
    expect(startbild()).toHaveAttribute('data-geraet', 'tablet');
    laufenLassen(BILDENDE.abgang - 0.02);
    const huelle = startbild()!;
    expect(huelle.querySelector('[data-kachel]')).not.toBeNull();
    // Das O der ersten Zeile und das M von MOTION - je ein eigenes Bild, weil
    // sie in der Marke verschieden groß übereinander und in der Kachel gleich
    // hoch nebeneinander stehen.
    const o = huelle.querySelector<HTMLImageElement>('img[data-marke="o"]')!;
    const m = huelle.querySelector<HTMLImageElement>('img[data-marke="m"]')!;
    expect(o.style.clipPath).toMatch(/^inset\(/);
    expect(m.style.clipPath).toMatch(/^inset\(/);
    expect(parseFloat(o.style.width)).toBeLessThan(parseFloat(m.style.width));
    const rest = huelle.querySelector<HTMLImageElement>('img[data-marke="rest-0"]')!;
    expect(Number(rest.style.opacity)).toBe(0);
  });

  it('bietet „Überspringen" als echten Knopf außerhalb der Tab-Reihenfolge an und springt zu Bild 6', () => {
    const onFertig = vi.fn();
    render(<Startbild onFertig={onFertig} />);
    laufenLassen(0.3);
    const knopf = screen.getByRole('button', { name: 'Überspringen', hidden: true });
    expect(knopf).toHaveAttribute('type', 'button');
    expect(knopf).toHaveAttribute('tabindex', '-1');
    expect(knopf.className).toContain('min-h-11');

    fireEvent.click(knopf);
    laufenLassen(0.02);
    expect(bild()).toBe('6');
    expect(screen.queryByRole('button', { name: 'Überspringen', hidden: true })).toBeNull();
    // Die Seite blendet trotzdem ein: 0,32 s bis zum Ende.
    laufenLassen(0.2);
    expect(onFertig).not.toHaveBeenCalled();
    laufenLassen(0.15);
    expect(onFertig).toHaveBeenCalledTimes(1);
  });

  it('beendet ab Bild 2 auch ein Tipp auf die Fläche, in Bild 1 noch nicht', () => {
    render(<Startbild onFertig={vi.fn()} />);
    laufenLassen(0.05);
    fireEvent.click(startbild()!);
    laufenLassen(0.02);
    expect(bild()).toBe('1');

    laufenLassen(0.3);
    fireEvent.click(startbild()!);
    laufenLassen(0.02);
    expect(bild()).toBe('6');
  });

  it('zeigt mit reduzierter Bewegung nur die Marke und schneidet nach 0,3 s hart', () => {
    reduzierteBewegung(true);
    const onFertig = vi.fn();
    render(<Startbild onFertig={onFertig} />);
    expect(bild()).toBe('1');
    laufenLassen(0.1);
    expect(startbild()!.querySelector('svg[data-rad]')).toBeNull();
    laufenLassen(0.1);
    expect(bild()).toBe('5');
    expect(startbild()!.querySelector('img[data-marke="voll"]')).not.toBeNull();
    laufenLassen(REDUZIERT_DAUER);
    expect(onFertig).toHaveBeenCalledTimes(1);
    expect(document.documentElement.classList.contains('startbild-landung')).toBe(false);
  });

  it('steht mit fester Uhrzeit still und setzt keinen Merker (Prüfseite)', () => {
    const onFertig = vi.fn();
    render(<Startbild onFertig={onFertig} uhrzeit={1.2} />);
    expect(bild()).toBe('4');
    laufenLassen(3);
    expect(bild()).toBe('4');
    expect(onFertig).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem(STARTBILD_MERKER)).toBeNull();
  });
});
