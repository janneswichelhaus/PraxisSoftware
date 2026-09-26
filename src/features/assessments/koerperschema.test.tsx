import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { antwortenSchema } from './antworten';
import { instrumentFuer } from './instrumente';
import { BILD_BREITE, BILD_HOEHE, KOERPERBEREICHE, bereicheText } from './koerperschema';
import { KoerperschemaFeld } from './KoerperschemaFeld';
import { kennungSchema } from './schema';
import { pruefeBarrierefreiheit } from '@/barrierefreiheit';

/** Das Körperschema (FRB-002d, IDEA-PRX-027). */
describe('Bereiche des Körperschemas', () => {
  it('hat eindeutige Kennungen in der Form einer Kennung', () => {
    const ids = KOERPERBEREICHE.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(kennungSchema.safeParse(id).success).toBe(true);
  });

  it('liegt ganz im Bild, und kein Bereich verdeckt einen anderen derselben Ansicht', () => {
    for (const { form } of KOERPERBEREICHE) {
      const [x, y, b, h] = form;
      expect(x).toBeGreaterThanOrEqual(0);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(x + b).toBeLessThanOrEqual(BILD_BREITE);
      expect(y + h).toBeLessThanOrEqual(BILD_HOEHE);
    }
    const ueberlappend: string[] = [];
    for (const a of KOERPERBEREICHE) {
      for (const c of KOERPERBEREICHE) {
        if (a.id >= c.id || a.ansicht !== c.ansicht) continue;
        const [ax, ay, ab, ah] = a.form;
        const [cx, cy, cb, ch] = c.form;
        if (ax < cx + cb && cx < ax + ab && ay < cy + ch && cy < ay + ah) {
          ueberlappend.push(`${a.id}/${c.id}`);
        }
      }
    }
    expect(ueberlappend).toEqual([]);
  });

  it('zeichnet die rechte Seite der Person vorne links und hinten rechts im Bild', () => {
    const x = (id: string) => KOERPERBEREICHE.find((b) => b.id === id)!.form[0];
    expect(x('schulter_rechts')).toBeLessThan(x('schulter_links'));
    expect(x('schulterblatt_rechts')).toBeGreaterThan(x('schulterblatt_links'));
  });

  it('nennt die Bereiche in der Reihenfolge des Schemas', () => {
    expect(bereicheText(['lws', 'schulter_rechts'])).toBe('Schulter rechts, Lendenwirbelsäule');
  });

  it('nimmt als Antwort nur Bereiche des Schemas an', () => {
    const schema = antwortenSchema(instrumentFuer('anamnese_v8')!);
    expect(schema.safeParse({ beschwerden_ort: { bereiche: ['lws'] } }).success).toBe(true);
    expect(schema.safeParse({ beschwerden_ort: { bereiche: ['milz'] } }).success).toBe(false);
    expect(schema.safeParse({ beschwerden_ort: { bereiche: [] } }).success).toBe(false);
  });
});

describe('Körperschema als Eingabe', () => {
  it('wählt durch Antippen der Figur und nimmt durch erneutes Antippen zurück', () => {
    const onChange = vi.fn();
    const { container, rerender } = render(
      <KoerperschemaFeld legende="1. Wo?" bereiche={[]} onChange={onChange} />,
    );
    fireEvent.click(container.querySelector('[data-bereich="knie_links"]')!);
    expect(onChange).toHaveBeenLastCalledWith(['knie_links']);

    rerender(<KoerperschemaFeld legende="1. Wo?" bereiche={['knie_links']} onChange={onChange} />);
    expect(screen.getByText('Gewählt: Knie links')).toBeInTheDocument();
    fireEvent.click(container.querySelector('[data-bereich="knie_links"]')!);
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it('bietet dieselbe Auswahl als Liste für Tastatur und Vorlesesoftware', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { container } = render(
      <KoerperschemaFeld legende="1. Wo?" bereiche={[]} onChange={onChange} />,
    );
    await user.click(screen.getByText('Bereiche als Liste'));
    await user.click(screen.getByLabelText('Lendenwirbelsäule'));
    expect(onChange).toHaveBeenLastCalledWith(['lws']);
    await pruefeBarrierefreiheit(container);
  });
});
