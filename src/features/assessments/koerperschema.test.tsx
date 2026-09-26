import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { antwortenSchema } from './antworten';
import { instrumentFuer } from './instrumente';
import {
  ANSICHTEN_GRENZE,
  BILD_BREITE,
  BILD_HOEHE,
  KOERPERBEREICHE,
  ansichtVon,
  bereichAn,
  bereicheText,
} from './koerperschema';
import { KoerperschemaFeld } from './KoerperschemaFeld';
import { kennungSchema } from './schema';
import { pruefeBarrierefreiheit } from '@/barrierefreiheit';

/** Das Körperschema (FRB-002d, IDEA-PRX-027, ANN-107). */
describe('Bereiche des Körperschemas', () => {
  it('hat eindeutige Kennungen, jeder Anker liegt im Bild', () => {
    const ids = KOERPERBEREICHE.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const bereich of KOERPERBEREICHE) {
      expect(kennungSchema.safeParse(bereich.id).success).toBe(true);
      for (const { x, y } of bereich.anker) {
        expect(x).toBeGreaterThan(0);
        expect(x).toBeLessThan(BILD_BREITE);
        expect(y).toBeGreaterThan(0);
        expect(y).toBeLessThan(BILD_HOEHE);
      }
    }
  });

  it('findet jeden Bereich an seinem eigenen Anker wieder', () => {
    // Liegen zwei Anker zu nah, gewinnt der falsche - dann ist die Einteilung kaputt.
    for (const bereich of KOERPERBEREICHE) {
      for (const anker of bereich.anker) expect(bereichAn(anker)?.id).toBe(bereich.id);
    }
  });

  it('zeichnet die rechte Seite der Person vorne links und hinten rechts im Bild', () => {
    const anker = (id: string) => KOERPERBEREICHE.find((b) => b.id === id)!.anker;
    const [schulterRechtsVorne] = anker('schulter_rechts').filter((p) => ansichtVon(p) === 'vorne');
    const [schulterLinksVorne] = anker('schulter_links').filter((p) => ansichtVon(p) === 'vorne');
    expect(schulterRechtsVorne!.x).toBeLessThan(schulterLinksVorne!.x);
    expect(anker('schulterblatt_rechts')[0]!.x).toBeGreaterThan(anker('schulterblatt_links')[0]!.x);
    expect(anker('schulterblatt_rechts')[0]!.x).toBeGreaterThan(ANSICHTEN_GRENZE);
  });

  it('setzt neben der Figur nichts', () => {
    expect(bereichAn({ x: 10, y: 700 })).toBeNull();
    expect(bereichAn({ x: 410, y: 600 })).toBeNull();
  });

  it('nennt die Bereiche einmal, in der Reihenfolge des Schemas', () => {
    expect(bereicheText(['lws', 'schulter_rechts', 'lws'])).toBe(
      'Schulter rechts, Lendenwirbelsäule',
    );
  });

  it('nimmt als Antwort nur Stellen im Bild mit bekanntem Bereich an', () => {
    const schema = antwortenSchema(instrumentFuer('anamnese_v8')!);
    const antwort = (markierungen: unknown) => ({ beschwerden_ort: { markierungen } });
    expect(schema.safeParse(antwort([{ x: 0.7, y: 0.4, bereich: 'lws' }])).success).toBe(true);
    expect(schema.safeParse(antwort([{ x: 0.7, y: 0.4, bereich: 'milz' }])).success).toBe(false);
    expect(schema.safeParse(antwort([{ x: 1.2, y: 0.4, bereich: 'lws' }])).success).toBe(false);
    expect(schema.safeParse(antwort([])).success).toBe(false);
  });
});

describe('Körperschema als Eingabe', () => {
  /** jsdom misst nichts; das Bild liegt hier 820 × 749 groß an der Ecke. */
  function flaeche(container: HTMLElement) {
    const svg = container.querySelector('svg')!;
    svg.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: BILD_BREITE, height: BILD_HOEHE }) as DOMRect;
    return svg;
  }

  it('setzt einen Kreis an der angetippten Stelle und nimmt ihn beim zweiten Tipp zurück', () => {
    const onChange = vi.fn();
    const { container, rerender } = render(
      <KoerperschemaFeld legende="1. Wo?" markierungen={[]} onChange={onChange} />,
    );
    fireEvent.click(flaeche(container), { clientX: 270, clientY: 505 });
    const gesetzt = onChange.mock.lastCall![0] as { bereich: string; x: number; y: number }[];
    expect(gesetzt).toEqual([{ x: 0.329, y: 0.674, bereich: 'knie_links' }]);

    rerender(<KoerperschemaFeld legende="1. Wo?" markierungen={gesetzt} onChange={onChange} />);
    expect(screen.getByText('Markiert: Knie links')).toBeInTheDocument();
    expect(container.querySelectorAll('circle')).toHaveLength(1);
    fireEvent.click(flaeche(container), { clientX: 275, clientY: 500 });
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it('setzt neben der Figur keinen Kreis', () => {
    const onChange = vi.fn();
    const { container } = render(
      <KoerperschemaFeld legende="1. Wo?" markierungen={[]} onChange={onChange} />,
    );
    fireEvent.click(flaeche(container), { clientX: 10, clientY: 700 });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('bietet dieselbe Auswahl als Liste für Tastatur und Vorlesesoftware', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { container } = render(
      <KoerperschemaFeld legende="1. Wo?" markierungen={[]} onChange={onChange} />,
    );
    await user.click(screen.getByText('Bereiche als Liste'));
    await user.click(screen.getByLabelText('Lendenwirbelsäule'));
    expect(onChange).toHaveBeenLastCalledWith([{ x: 0.726, y: 0.387, bereich: 'lws' }]);
    await pruefeBarrierefreiheit(container);
  });
});
