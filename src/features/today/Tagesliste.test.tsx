import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test-utils';
import { pruefeBarrierefreiheit } from '@/barrierefreiheit';
import type { DayPlanEntry } from './api';
import { Tageskarte } from './Tagesliste';

/**
 * Die Tageskarte (UX-001) nach dem UX-Review (UXR-003) und dem Design-Handoff
 * vom 2026-10-01: Name als erkennbarer Link mit Rückweg, Freitexte, die
 * umbrechen, Pfeile, die nicht mitgelesen werden - und Zugang und
 * Besonderheit hinter Pillen und Info-Knopf statt als Textblock.
 */

function eintrag(teil: Partial<DayPlanEntry> = {}): DayPlanEntry {
  return {
    id: 't1',
    patient_id: 'p1',
    staff_member_id: 's1',
    appointment_type: 'home_visit',
    kind: 'therapy',
    title: null,
    status: 'confirmed',
    starts_at: '2026-09-28T07:00:00.000Z',
    ends_at: '2026-09-28T08:00:00.000Z',
    patient_given_name: 'Max',
    patient_family_name: 'Mustermann',
    location_name: null,
    visit_street: 'Beispielstrasse',
    visit_house_number: '12',
    visit_postal_code: '72070',
    visit_city: 'Tuebingen',
    patient_phone: null,
    patient_phone_mobile: '+49 160 0000005',
    home_visit_access_note: '2. OG links, Klingel „Mustermann“.',
    special_note: 'Hund im Flur.',
    documentation_status: 'none',
    organization_time_zone: 'Europe/Berlin',
    ...teil,
  };
}

describe('Tageskarte', () => {
  it('fuehrt ueber den Namen in die Akte - mit dem Weg zurueck in den Tag (UEB-13)', () => {
    renderWithProviders(<Tageskarte termin={eintrag()} kicker="Erster Weg" />);

    const name = screen.getByRole('link', { name: 'Max Mustermann' });
    expect(name).toHaveAttribute('href', `/patienten/p1?zurueck=${encodeURIComponent('/')}`);
    // Als Link erkennbar ohne Maus und 44 px hoch (RSP-06, UIK-15) - mit dem
    // kräftigen Unterstrich des Handoffs.
    expect(name).toHaveClass('text-accent', 'underline', 'min-h-11', 'decoration-2');
    // 20 px in 700.
    expect(name.closest('p')).toHaveClass('text-h4', 'font-bold');
  });

  it('traegt den Kicker als Ueberschrift und daneben die Zeit bis zum Beginn', () => {
    renderWithProviders(
      <Tageskarte termin={eintrag()} kicker="Erster Weg · ≈ 12 min" relativ="in 25 Minuten" />,
    );
    const kicker = screen.getByRole('heading', { level: 3, name: 'Erster Weg · ≈ 12 min' });
    expect(kicker).toHaveClass('text-accent', 'text-xs', 'uppercase', 'tracking-label');
    expect(screen.getByText('in 25 Minuten')).toBeInTheDocument();
    // „Steht aus" ist der Regelfall und trägt kein Abzeichen (UX-005h).
    expect(screen.queryByText('Steht aus')).toBeNull();
  });

  it('zeigt einen abweichenden Zustand als Abzeichen - statt der Zeit bis zum Beginn', () => {
    renderWithProviders(
      <Tageskarte
        termin={eintrag({ status: 'completed', documentation_status: 'draft' })}
        kicker="Dokumentation offen"
        relativ="in 25 Minuten"
      />,
    );
    expect(screen.getByText('Abgeschlossen')).toBeInTheDocument();
    expect(screen.queryByText('in 25 Minuten')).toBeNull();
    // Warum der Termin noch offen steht - als Text mit Zeichen, nicht als Farbe.
    const grund = screen.getByText('Doku im Entwurf').closest('p')!;
    expect(grund).toHaveClass('text-warnung');
    expect(grund.querySelector('[aria-hidden="true"]')).toHaveTextContent('!');
  });

  it('nennt die ganze Spanne und den Zaehler in der Nebenzeile', () => {
    renderWithProviders(
      <Tageskarte termin={eintrag()} kicker="Erster Weg" position="Termin 2 von 6" />,
    );
    // Der Hausbesuch trägt kein Wort (ANN-192).
    expect(screen.getByText('09:00–10:00 Uhr · Termin 2 von 6')).toBeInTheDocument();
    expect(screen.queryByText(/Hausbesuch/)).toBeNull();
  });

  it('nennt Art und Standort, wo der Termin kein Hausbesuch ist', () => {
    renderWithProviders(
      <Tageskarte
        termin={eintrag({
          appointment_type: 'practice',
          location_name: 'Hauptstandort',
          visit_street: null,
          visit_house_number: null,
          visit_postal_code: null,
          visit_city: null,
          home_visit_access_note: null,
          special_note: null,
        })}
        kicker="Nächster Weg"
      />,
    );
    expect(screen.getByText('Praxis · Hauptstandort · 09:00–10:00 Uhr')).toBeInTheDocument();
    // Ohne Anschrift und ohne Hinweise weder Adresszeile noch Info-Knopf.
    expect(document.querySelector('address')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Zugang und Besonderheiten' })).toBeNull();
  });

  it('nennt eine Fehlzeit beim Titel, ohne Link in eine Akte', () => {
    renderWithProviders(
      <Tageskarte
        termin={eintrag({
          kind: 'internal',
          patient_id: null,
          title: 'Teambesprechung',
          appointment_type: 'practice',
          location_name: 'Hauptstandort',
        })}
        kicker="Jetzt"
      />,
    );

    expect(screen.getByText('Teambesprechung')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Teambesprechung' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Fehlzeit öffnen' })).toBeInTheDocument();
  });

  it('fuehrt am Trainingstermin zur Kund:in und in den Trainingsbereich (TRN-006)', () => {
    renderWithProviders(
      <Tageskarte
        termin={eintrag({
          kind: 'training',
          patient_id: null,
          patient_given_name: null,
          patient_family_name: null,
          training_relationship_id: 'r1',
          training_given_name: 'Tina',
          training_family_name: 'Training',
        })}
        kicker="Nächster Weg"
      />,
    );
    expect(screen.getByRole('link', { name: 'Tina Training' })).toHaveAttribute(
      'href',
      `/training/r1?zurueck=${encodeURIComponent('/')}`,
    );
    expect(screen.getByRole('link', { name: 'Termin öffnen' })).toHaveAttribute(
      'href',
      `/training/termine/t1?zurueck=${encodeURIComponent('/')}`,
    );
  });

  describe('Pillen und Info-Knopf (Design-Handoff 2026-10-01)', () => {
    it('zeigt das Stockwerk als Pille und haelt Zugang und Besonderheit zugeklappt', () => {
      renderWithProviders(<Tageskarte termin={eintrag()} kicker="Erster Weg" />);

      // Die Anschrift in einer Zeile.
      expect(screen.getByText('Beispielstrasse 12, 72070 Tuebingen').tagName).toBe('ADDRESS');
      const pille = screen.getByRole('button', { name: '2. OG links' });
      expect(pille).toHaveAttribute('aria-expanded', 'false');
      expect(pille).toHaveClass('min-h-9', 'rounded-pill', 'border-line-strong');
      // Der Rest des Hinweises und die Besonderheit stehen nicht offen da:
      // Die Übersicht wird im Treppenhaus mitgelesen.
      expect(screen.queryByText('Klingel „Mustermann“.')).toBeNull();
      expect(screen.queryByText('Hund im Flur.')).toBeNull();
      // Kein Verweis auf etwas, das es im Dokument nicht gibt (UIK-08).
      expect(pille).not.toHaveAttribute('aria-controls');
    });

    it('klappt beides ueber den Info-Knopf auf - und ueber die Stockwerk-Pille wieder zu', async () => {
      const user = userEvent.setup();
      const { container } = renderWithProviders(
        <Tageskarte termin={eintrag()} kicker="Erster Weg" />,
      );

      const knopf = screen.getByRole('button', { name: 'Zugang und Besonderheiten' });
      // 44 px Tippziel, auch wenn das Bild nur 22 px misst.
      expect(knopf).toHaveClass('size-11');
      expect(knopf).toHaveAttribute('type', 'button');
      await user.click(knopf);

      expect(knopf).toHaveAttribute('aria-expanded', 'true');
      const hinweise = container.querySelector('dl')!;
      expect(knopf).toHaveAttribute('aria-controls', hinweise.id);
      // „Zugangshinweis" wie im Feld der Stammdaten (WRT-17) - ohne das
      // Stockwerk, das schon in der Pille steht.
      expect(within(hinweise).getByText('Zugangshinweis').tagName).toBe('DT');
      expect(within(hinweise).getByText('Klingel „Mustermann“.')).toBeInTheDocument();
      expect(within(hinweise).queryByText(/2\. OG/)).toBeNull();
      expect(within(hinweise).getByText('Besonderheit').tagName).toBe('DT');
      expect(within(hinweise).getByText('Hund im Flur.')).toBeInTheDocument();
      expect(screen.queryByText('Zugang')).toBeNull();

      await pruefeBarrierefreiheit(container);

      // Beide Knöpfe zeigen denselben Zustand und schalten dasselbe.
      const pille = screen.getByRole('button', { name: '2. OG links' });
      expect(pille).toHaveAttribute('aria-expanded', 'true');
      await user.click(pille);
      expect(container.querySelector('dl')).toBeNull();
      expect(knopf).toHaveAttribute('aria-expanded', 'false');
    });

    it('macht aus dem Stockwerk keinen Knopf, wenn es nichts aufzuklappen gibt', () => {
      renderWithProviders(
        <Tageskarte
          termin={eintrag({ home_visit_access_note: '1. OG', special_note: null })}
          kicker="Erster Weg"
        />,
      );
      expect(screen.getByText('1. OG').tagName).toBe('SPAN');
      expect(screen.queryByRole('button')).toBeNull();
    });

    it('zeigt ohne erkennbares Stockwerk nur den Info-Knopf - der Hinweis bleibt ganz', async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <Tageskarte
          termin={eintrag({ home_visit_access_note: 'Klingel Müller, 2. OG', special_note: null })}
          kicker="Erster Weg"
        />,
      );
      expect(screen.getAllByRole('button')).toHaveLength(1);
      await user.click(screen.getByRole('button', { name: 'Zugang und Besonderheiten' }));
      expect(screen.getByText('Klingel Müller, 2. OG')).toBeInTheDocument();
      expect(screen.queryByText('Besonderheit')).toBeNull();
    });

    it('zeigt die Liege als Pille mit Haekchen (ANN-116)', () => {
      renderWithProviders(
        <Tageskarte termin={eintrag({ treatment_table_required: true })} kicker="Erster Weg" />,
      );
      const liege = screen.getByText('Liege').closest('span')!;
      expect(liege).toHaveClass('bg-accent-soft', 'text-accent', 'min-h-9');
      expect(liege.querySelector('[aria-hidden="true"]')).toHaveTextContent('✓');
      // Kein Bedienelement: Sie sagt etwas, sie schaltet nichts.
      expect(screen.queryByRole('button', { name: /Liege/ })).toBeNull();
    });

    it('fuehrt ueber „Erstaufnahme offen" in die Akte und sagt der Vorlesesoftware, was fehlt (PRX-013)', () => {
      renderWithProviders(
        <Tageskarte
          termin={eintrag()}
          kicker="Erster Weg"
          erstaufnahme={['finding', 'treatment_table']}
        />,
      );
      const pille = screen.getByRole('link', { name: 'Erstaufnahme offen: Befund · Liege' });
      expect(pille).toHaveAttribute('href', `/patienten/p1?zurueck=${encodeURIComponent('/')}`);
      expect(pille).toHaveClass('bg-warnung-soft', 'text-warnung', 'min-h-9');
      // Zeichen und Pfeil sind Bild; was fehlt, steht nur für Vorlesesoftware.
      expect(pille.querySelectorAll('[aria-hidden="true"]')).toHaveLength(2);
      expect(pille.querySelector('.sr-only')).toHaveTextContent(': Befund · Liege');
    });

    it('zeigt ohne Stockwerk, Liege und offene Erstaufnahme keine Pillenreihe', () => {
      renderWithProviders(
        <Tageskarte
          termin={eintrag({ home_visit_access_note: null, special_note: null })}
          kicker="Erster Weg"
          erstaufnahme={[]}
        />,
      );
      expect(screen.queryByText('Liege')).toBeNull();
      expect(screen.queryByText(/Erstaufnahme/)).toBeNull();
      expect(document.querySelector('.rounded-pill')).toBeNull();
    });

    it('zeigt die Erstaufnahme nur am Behandlungstermin', () => {
      renderWithProviders(
        <Tageskarte
          termin={eintrag({ kind: 'training', patient_id: null })}
          kicker="Nächster Weg"
          erstaufnahme={['finding']}
        />,
      );
      expect(screen.queryByText(/Erstaufnahme/)).toBeNull();
    });
  });

  it('stellt die Hauptaktion ueber die uebrigen Handlungen und die Rufnummern dahinter', () => {
    renderWithProviders(
      <Tageskarte
        termin={eintrag({ patient_phone: '+49 7071 0000005' })}
        kicker="Erster Weg"
        hauptaktion={<button type="button">Navigation starten</button>}
        aktionen={<a href="/doku">Doku</a>}
      />,
    );
    const haupt = screen.getByRole('button', { name: 'Navigation starten' });
    const doku = screen.getByRole('link', { name: 'Doku' });
    const mobil = screen.getByRole('link', { name: /Mobil/ });
    const telefon = screen.getByRole('link', { name: /Telefon/ });
    const danach = (a: Element, b: Element) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(danach(haupt, doku)).toBe(true);
    // Kontakt ist Aktion, nicht Text: die Nummer wählt, statt nur dazustehen -
    // wichtig, aber selten, deshalb hinter den Handlungen (IDEA-PRX-040).
    expect(danach(doku, mobil)).toBe(true);
    expect(mobil).toHaveAttribute('href', 'tel:+491600000005');
    expect(mobil).toHaveClass('min-h-11');
    expect(telefon).toHaveAttribute('href', 'tel:+4970710000005');
  });

  it('bricht Freitexte auch mitten im Wort um (UEB-16)', async () => {
    const user = userEvent.setup();
    const langesWort = 'Hinterhofeingangstuerschluesselkastenzahlenkombination';
    renderWithProviders(
      <Tageskarte
        termin={eintrag({ home_visit_access_note: langesWort, special_note: langesWort })}
        kicker="Erster Weg"
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Zugang und Besonderheiten' }));

    const stellen = screen.getAllByText(langesWort);
    expect(stellen).toHaveLength(2);
    for (const stelle of stellen) {
      expect(stelle).toHaveClass('wrap-anywhere', 'min-w-0');
    }
    expect(screen.getByText('Beispielstrasse 12, 72070 Tuebingen')).toHaveClass('wrap-anywhere');
    expect(screen.getByRole('link', { name: 'Max Mustermann' }).closest('p')).toHaveClass(
      'wrap-anywhere',
    );
  });

  it('liest beim Termin-Link keinen Pfeil mit vor (WRT-08)', () => {
    renderWithProviders(<Tageskarte termin={eintrag()} kicker="Erster Weg" />);

    const termin = screen.getByRole('link', { name: 'Termin öffnen' });
    expect(termin).toHaveAttribute('href', `/termine/t1?zurueck=${encodeURIComponent('/')}`);
    // Sichtbar steht der Pfeil noch da, nur ausgeblendet für Vorlesesoftware.
    expect(termin.querySelector('[aria-hidden="true"]')).toHaveTextContent('→');
  });

  it('ist eine weisse Karte ohne Schatten', () => {
    const { container } = renderWithProviders(
      <Tageskarte termin={eintrag()} kicker="Erster Weg" />,
    );
    const karte = container.querySelector('article')!;
    expect(karte).toHaveClass('rounded-card', 'bg-surface', 'border', 'border-line');
    expect(karte.innerHTML).not.toMatch(/shadow|ring-/);
  });
});
