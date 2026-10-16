import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test-utils';
import { pruefeBarrierefreiheit } from '@/barrierefreiheit';
import { Chip, Filterchips } from './Chip';
import { Filterleiste } from './Filterleiste';
import { SearchField } from './SearchField';
import { Segment } from './Segment';
import { Select } from './Select';

/** Die Klassen eines Elements als Liste - für Zusicherungen ohne Teiltreffer. */
function klassenVon(element: Element | null | undefined): string[] {
  return (element?.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);
}

describe('Segment (Design-Fundament, aus dem Kalender)', () => {
  it('ist eine benannte Gruppe, die gewählte Ansicht gefüllt und gedrückt', async () => {
    const user = userEvent.setup();
    const onWaehlen = vi.fn();
    const { container } = renderWithProviders(
      <Segment
        beschriftung="Ansicht"
        wahlen={[
          { wert: 'woche', text: 'Woche' },
          { wert: 'team', text: 'Team' },
        ]}
        gewaehlt="woche"
        onWaehlen={onWaehlen}
      />,
    );
    expect(screen.getByRole('group', { name: 'Ansicht' })).toBeInTheDocument();
    const woche = screen.getByRole('button', { name: 'Woche' });
    const team = screen.getByRole('button', { name: 'Team' });
    expect(woche).toHaveAttribute('aria-pressed', 'true');
    expect(team).toHaveAttribute('aria-pressed', 'false');
    // 44 px, gewählt mit der Hauptfarbe gefüllt, sonst Rand und Hauptfarbe.
    expect(klassenVon(woche)).toEqual(
      expect.arrayContaining(['min-h-11', 'bg-accent', 'text-surface', 'rounded-l-button']),
    );
    expect(klassenVon(team)).toEqual(
      expect.arrayContaining(['border-line-strong', 'text-accent', 'rounded-r-button']),
    );
    expect(klassenVon(team)).not.toContain('rounded-l-button');
    await user.click(team);
    expect(onWaehlen).toHaveBeenCalledWith('team');
    await pruefeBarrierefreiheit(container);
  });

  it('rundet je Breite die erste und letzte sichtbare Wahl - wie „Tag | Team“ und „Woche | Team“', () => {
    renderWithProviders(
      <Segment
        beschriftung="Ansicht"
        wahlen={[
          { wert: 'woche', text: 'Woche', nur: 'ab-sm' },
          { wert: 'tag', text: 'Tag', nur: 'telefon' },
          { wert: 'team', text: 'Team' },
        ]}
        gewaehlt="team"
        onWaehlen={() => undefined}
      />,
    );
    const woche = klassenVon(screen.getByRole('button', { name: 'Woche' }));
    const tag = klassenVon(screen.getByRole('button', { name: 'Tag' }));
    const team = klassenVon(screen.getByRole('button', { name: 'Team' }));
    expect(woche).toEqual(expect.arrayContaining(['rounded-l-button', 'max-sm:hidden']));
    expect(tag).toEqual(expect.arrayContaining(['rounded-l-button', 'sm:hidden']));
    expect(team).toEqual(expect.arrayContaining(['rounded-r-button']));
    expect(team).not.toContain('rounded-l-button');
    expect(woche).not.toContain('rounded-r-button');
  });

  it('rundet nur auf der Breite, auf der eine Wahl vorn steht', () => {
    renderWithProviders(
      <Segment
        beschriftung="Ansicht"
        wahlen={[
          { wert: 'liste', text: 'Liste', nur: 'telefon' },
          { wert: 'karte', text: 'Karte' },
        ]}
        gewaehlt="karte"
        onWaehlen={() => undefined}
      />,
    );
    // Am Rechner ist „Karte“ die erste Wahl, am Telefon nicht.
    expect(screen.getByRole('button', { name: 'Karte' })).toHaveClass(
      'sm:rounded-l-button',
      'rounded-r-button',
    );
  });
});

describe('Chip (Design-Fundament)', () => {
  it('ist als Sprung ein Link in Pillenform, 44 px, ohne umzubrechen', () => {
    renderWithProviders(<Chip href="#monat-2026-09">September 2026</Chip>);
    const chip = screen.getByRole('link', { name: 'September 2026' });
    expect(chip).toHaveAttribute('href', '#monat-2026-09');
    expect(klassenVon(chip)).toEqual(
      expect.arrayContaining([
        'rounded-pill',
        'min-h-11',
        'border-line-strong',
        'text-sm',
        'font-semibold',
        'whitespace-nowrap',
        'shrink-0',
      ]),
    );
  });

  it('ist als Schalter gedrückt, gewählt auf der Akzentfläche mit Häkchen', () => {
    renderWithProviders(
      <Chip gewaehlt onClick={() => undefined}>
        Knie
      </Chip>,
    );
    const chip = screen.getByRole('button', { name: 'Knie' });
    expect(chip).toHaveAttribute('aria-pressed', 'true');
    expect(chip).toHaveAttribute('type', 'button');
    expect(klassenVon(chip)).toEqual(
      expect.arrayContaining(['border-accent', 'bg-accent-soft', 'text-accent']),
    );
    // Farbe trägt nie allein: das Häkchen, für Vorlesesoftware ausgeblendet.
    expect(chip.querySelector('[aria-hidden="true"]')).toHaveTextContent('✓');
  });
});

describe('Chip rastet ein (ANN-567)', () => {
  it('federt erst nach einem Tipp, und jeder Tipp startet die Feder neu', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    renderWithProviders(
      <Chip gewaehlt={false} onClick={onClick}>
        Knie
      </Chip>,
    );
    const chip = screen.getByRole('button', { name: 'Knie' });
    expect(chip).not.toHaveAttribute('data-schwung');
    await user.click(chip);
    expect(chip).toHaveAttribute('data-schwung', '1');
    await user.click(chip);
    expect(chip).toHaveAttribute('data-schwung', '2');
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it('federt nicht, wenn er nichts wählt', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Chip onClick={vi.fn()}>Weiter</Chip>);
    const chip = screen.getByRole('button', { name: 'Weiter' });
    await user.click(chip);
    expect(chip).not.toHaveAttribute('data-schwung');
  });
});

describe('Filterchips (Design-Fundament)', () => {
  function Mehrfach({ mehrfach = true }: { mehrfach?: boolean }) {
    const [gewaehlt, setGewaehlt] = useState<string[]>([]);
    return (
      <>
        <Filterchips
          beschriftung="Körperregion"
          wahlen={[
            { wert: 'knie', text: 'Knie' },
            { wert: 'huefte', text: 'Hüfte' },
            { wert: 'schulter', text: 'Schulter' },
          ]}
          gewaehlt={gewaehlt}
          onAendern={setGewaehlt}
          mehrfach={mehrfach}
        />
        <output>{gewaehlt.join(',')}</output>
      </>
    );
  }

  it('ist eine beschriftete Gruppe; mehrere Werte lassen sich wählen und abwählen', async () => {
    const user = userEvent.setup();
    const { container } = renderWithProviders(<Mehrfach />);
    expect(screen.getByRole('group', { name: 'Körperregion' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Knie' }));
    await user.click(screen.getByRole('button', { name: 'Schulter' }));
    expect(screen.getByRole('status')).toHaveTextContent('knie,schulter');
    expect(screen.getByRole('button', { name: 'Knie' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'Knie' }));
    expect(screen.getByRole('status')).toHaveTextContent('schulter');
    // Am Telefon läuft die Reihe waagerecht, ab 640 px bricht sie um.
    expect(klassenVon(screen.getByRole('group'))).toEqual(
      expect.arrayContaining(['overflow-x-auto', 'sm:flex-wrap']),
    );
    await pruefeBarrierefreiheit(container);
  });

  it('wählt ohne mehrfach genau einen Wert', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Mehrfach mehrfach={false} />);
    await user.click(screen.getByRole('button', { name: 'Knie' }));
    await user.click(screen.getByRole('button', { name: 'Hüfte' }));
    expect(screen.getByRole('status')).toHaveTextContent('huefte');
    await user.click(screen.getByRole('button', { name: 'Hüfte' }));
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });
});

describe('Filterleiste (Design-Fundament, Lücke 9.8)', () => {
  function Leiste({
    gesetzt = 0,
    onZuruecksetzen,
  }: {
    gesetzt?: number;
    onZuruecksetzen?: () => void;
  }) {
    return (
      <Filterleiste
        suche={<SearchField label="Liste filtern" value="" onChange={() => undefined} />}
        gesetzt={gesetzt}
        ergebnis="12 Einträge"
        {...(onZuruecksetzen ? { onZuruecksetzen } : {})}
      >
        <Select label="Versorgung" value="" onChange={() => undefined}>
          <option value="">Alle</option>
        </Select>
      </Filterleiste>
    );
  }

  it('lässt die Suche offen und klappt die übrigen Filter am Telefon hinter „Filter“', async () => {
    const user = userEvent.setup();
    const { container } = renderWithProviders(<Leiste />);
    expect(screen.getByRole('search', { name: 'Liste filtern' })).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Liste filtern' })).toBeInTheDocument();
    const schalter = screen.getByRole('button', { name: 'Filter' });
    expect(schalter).toHaveAttribute('aria-expanded', 'false');
    expect(klassenVon(schalter)).toEqual(expect.arrayContaining(['min-h-11', 'sm:hidden']));
    const bereich = document.getElementById(schalter.getAttribute('aria-controls')!)!;
    // Zu am Telefon, offen ab 640 px - ohne <details>, das ihn überall verbärge.
    expect(klassenVon(bereich)).toEqual(expect.arrayContaining(['hidden', 'sm:flex']));
    await user.click(schalter);
    expect(schalter).toHaveAttribute('aria-expanded', 'true');
    expect(klassenVon(bereich)).toEqual(expect.arrayContaining(['flex', 'sm:flex']));
    expect(klassenVon(bereich)).not.toContain('hidden');
    // Ab 640 px nebeneinander, jeder höchstens 20rem.
    expect(klassenVon(bereich)).toEqual(expect.arrayContaining(['sm:flex-row', 'sm:*:w-80']));
    expect(screen.getByText('12 Einträge')).toHaveClass('text-sm', 'text-ink-muted');
    await pruefeBarrierefreiheit(container);
  });

  it('nennt gesetzte Filter, steht dann offen und bietet den Weg zurück', async () => {
    const user = userEvent.setup();
    const onZuruecksetzen = vi.fn();
    renderWithProviders(<Leiste gesetzt={2} onZuruecksetzen={onZuruecksetzen} />);
    const schalter = screen.getByRole('button', { name: 'Filter (2)' });
    expect(schalter).toHaveAttribute('aria-expanded', 'true');
    await user.click(screen.getByRole('button', { name: 'Filter zurücksetzen' }));
    expect(onZuruecksetzen).toHaveBeenCalledTimes(1);
  });

  it('kommt ohne weitere Filter mit der Suche allein aus', () => {
    renderWithProviders(
      <Filterleiste suche={<SearchField label="Suche" value="" onChange={() => undefined} />} />,
    );
    expect(screen.queryByRole('button', { name: /Filter/ })).toBeNull();
  });
});
