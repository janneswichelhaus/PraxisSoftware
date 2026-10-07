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
    // AKTE-008 (Jannes 2026-10-03): Die Etage ist keine Pille mehr; sie
    // steht mit Zugang, Besonderheit und den Rufnummern im Info-Aufklapper.
    it('zeigt keine Etagen-Pille und haelt Etage, Zugang, Besonderheit und Nummern zugeklappt', () => {
      renderWithProviders(<Tageskarte termin={eintrag()} kicker="Erster Weg" />);

      // Die Anschrift in einer Zeile.
      expect(screen.getByText('Beispielstrasse 12, 72070 Tuebingen').tagName).toBe('ADDRESS');
      expect(screen.queryByText('2. OG links')).toBeNull();
      expect(screen.queryByRole('button', { name: '2. OG links' })).toBeNull();
      // Nichts davon steht offen da: Die Übersicht wird im Treppenhaus
      // mitgelesen.
      expect(screen.queryByText('Klingel „Mustermann“.')).toBeNull();
      expect(screen.queryByText('Hund im Flur.')).toBeNull();
      expect(screen.queryByRole('link', { name: /0000005/ })).toBeNull();
      const knopf = screen.getByRole('button', { name: 'Etage, Zugang und Kontakt' });
      expect(knopf).toHaveAttribute('aria-expanded', 'false');
      // Kein Verweis auf etwas, das es im Dokument nicht gibt (UIK-08).
      expect(knopf).not.toHaveAttribute('aria-controls');
    });

    it('klappt Etage, Zugang, Besonderheit und Rufnummern in dieser Reihenfolge auf', async () => {
      const user = userEvent.setup();
      const { container } = renderWithProviders(
        <Tageskarte termin={eintrag({ patient_phone: '+49 7071 0000009' })} kicker="Erster Weg" />,
      );

      const knopf = screen.getByRole('button', { name: 'Etage, Zugang und Kontakt' });
      // 44 px Tippziel, auch wenn das Bild nur 22 px misst.
      expect(knopf).toHaveClass('size-11');
      expect(knopf).toHaveAttribute('type', 'button');
      await user.click(knopf);

      expect(knopf).toHaveAttribute('aria-expanded', 'true');
      const hinweise = container.querySelector('dl')!;
      expect(knopf).toHaveAttribute('aria-controls', hinweise.id);
      expect(Array.from(hinweise.querySelectorAll('dt')).map((dt) => dt.textContent)).toEqual([
        'Etage',
        'Zugangshinweis',
        'Besonderheit',
        'Mobil',
        'Telefon',
      ]);
      // Die Etage hervorgehoben, der Zugangshinweis ohne sie.
      const etage = within(hinweise).getByText('2. OG links');
      expect(etage).toHaveClass('font-semibold');
      expect(within(hinweise).getByText('Klingel „Mustermann“.')).toBeInTheDocument();
      expect(within(hinweise).getByText('Hund im Flur.')).toBeInTheDocument();
      // Kontakt ist Aktion: Textlinks auf tel:, 44 px hoch.
      const mobil = within(hinweise).getByRole('link', { name: '+49 160 0000005' });
      expect(mobil).toHaveAttribute('href', 'tel:+491600000005');
      expect(mobil).toHaveClass('min-h-11');
      expect(within(hinweise).getByRole('link', { name: '+49 7071 0000009' })).toHaveAttribute(
        'href',
        'tel:+4970710000009',
      );

      await pruefeBarrierefreiheit(container);

      await user.click(knopf);
      expect(container.querySelector('dl')).toBeNull();
    });

    it('zeigt den Info-Knopf schon fuer eine Etage allein', async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <Tageskarte
          termin={eintrag({
            home_visit_access_note: '1. OG',
            special_note: null,
            patient_phone_mobile: null,
          })}
          kicker="Erster Weg"
        />,
      );
      expect(screen.queryByText('1. OG')).toBeNull();
      await user.click(screen.getByRole('button', { name: 'Etage, Zugang und Kontakt' }));
      expect(screen.getByText('1. OG')).toBeInTheDocument();
      expect(screen.queryByText('Zugangshinweis')).toBeNull();
    });

    it('zeigt den Info-Knopf schon fuer eine Rufnummer allein', () => {
      renderWithProviders(
        <Tageskarte
          termin={eintrag({ home_visit_access_note: null, special_note: null })}
          kicker="Erster Weg"
        />,
      );
      expect(screen.getByRole('button', { name: 'Etage, Zugang und Kontakt' })).toBeInTheDocument();
    });

    it('zeigt ohne Etage, Zugang, Besonderheit und Rufnummer keinen Info-Knopf', () => {
      renderWithProviders(
        <Tageskarte
          termin={eintrag({
            home_visit_access_note: null,
            special_note: null,
            patient_phone: null,
            patient_phone_mobile: null,
          })}
          kicker="Erster Weg"
        />,
      );
      expect(screen.queryByRole('button', { name: 'Etage, Zugang und Kontakt' })).toBeNull();
    });

    it('laesst einen Hinweis ohne erkennbare Etage ganz', async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <Tageskarte
          termin={eintrag({ home_visit_access_note: 'Klingel Müller, 2. OG', special_note: null })}
          kicker="Erster Weg"
        />,
      );
      await user.click(screen.getByRole('button', { name: 'Etage, Zugang und Kontakt' }));
      expect(screen.getByText('Klingel Müller, 2. OG')).toBeInTheDocument();
      expect(screen.queryByText('Etage')).toBeNull();
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
          erstaufnahme={['prescription_photo', 'registration_form']}
        />,
      );
      const pille = screen.getByRole('link', {
        name: 'Erstaufnahme offen: Verordnungsfoto · Anmeldebogen',
      });
      expect(pille).toHaveAttribute('href', `/patienten/p1?zurueck=${encodeURIComponent('/')}`);
      expect(pille).toHaveClass('bg-warnung-soft', 'text-warnung', 'min-h-9');
      // Zeichen und Pfeil sind Bild; was fehlt, steht nur für Vorlesesoftware.
      expect(pille.querySelectorAll('[aria-hidden="true"]')).toHaveLength(2);
      expect(pille.querySelector('.sr-only')).toHaveTextContent(': Verordnungsfoto · Anmeldebogen');
    });

    it('erinnert in den letzten Terminen an das Abschlussgespräch und führt in die Akte (KND-001)', () => {
      renderWithProviders(<Tageskarte termin={eintrag()} kicker="Jetzt" abschlussgespraech />);
      const pille = screen.getByRole('link', {
        name: 'Abschlussgespräch: Wie geht es nach der Behandlung weiter?',
      });
      expect(pille).toHaveAttribute('href', `/patienten/p1?zurueck=${encodeURIComponent('/')}`);
      expect(pille).toHaveClass('bg-accent-soft', 'text-accent', 'min-h-9');
    });

    it('erinnert an einem Trainingstermin nie an das Abschlussgespräch', () => {
      renderWithProviders(
        <Tageskarte termin={eintrag({ kind: 'training' })} kicker="Jetzt" abschlussgespraech />,
      );
      expect(screen.queryByText(/Abschlussgespräch/)).toBeNull();
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
      // Pillen sind 36 px hoch; das Bild im Info-Knopf ist keine.
      expect(document.querySelector('.rounded-pill.min-h-9')).toBeNull();
    });

    it('zeigt die Erstaufnahme nur am Behandlungstermin', () => {
      renderWithProviders(
        <Tageskarte
          termin={eintrag({ kind: 'training', patient_id: null })}
          kicker="Nächster Weg"
          erstaufnahme={['registration_form']}
        />,
      );
      expect(screen.queryByText(/Erstaufnahme/)).toBeNull();
    });
  });

  it('stellt die Hauptaktion ueber die uebrigen Handlungen; Rufnummern stehen nicht offen da', () => {
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
    expect(Boolean(haupt.compareDocumentPosition(doku) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(
      true,
    );
    // AKTE-008: Die Nummern stehen im Info-Aufklapper (Test oben), nicht mehr
    // unter den Handlungen.
    expect(screen.queryByRole('link', { name: /0000005/ })).toBeNull();
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
    await user.click(screen.getByRole('button', { name: 'Etage, Zugang und Kontakt' }));

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

  it('oeffnet mit der ganzen Karte den Termin - ohne Fusszeile (UBK-004)', () => {
    const { container } = renderWithProviders(
      <Tageskarte termin={eintrag()} kicker="Erster Weg" />,
    );

    const termin = screen.getByRole('link', { name: 'Termin öffnen' });
    expect(termin).toHaveAttribute(
      'href',
      `/kalender?termin=t1&zurueck=${encodeURIComponent('/')}`,
    );
    // Die Fläche des Links spannt sich über die Karte, die selbst der Bezug ist.
    expect(termin).toHaveClass('after:absolute', 'after:inset-0');
    expect(container.querySelector('article')).toHaveClass('relative');
    // Kein sichtbarer „Termin öffnen →" mehr.
    expect(screen.queryByText('→')).toBeNull();
    expect(container.querySelector('.border-t')).toBeNull();
    // Die eigenen Ziele liegen darüber, sonst träfe jeder Tipp den Termin.
    expect(screen.getByRole('link', { name: 'Max Mustermann' })).toHaveClass('relative', 'z-10');
    expect(screen.getByRole('button', { name: 'Etage, Zugang und Kontakt' })).toHaveClass(
      'relative',
      'z-10',
    );
  });

  it('nennt eine Fehlzeit als Fehlzeit', () => {
    renderWithProviders(
      <Tageskarte
        termin={eintrag({ kind: 'internal', patient_id: null, title: 'Teambesprechung' })}
        kicker="Jetzt"
      />,
    );
    expect(screen.getByRole('link', { name: 'Fehlzeit öffnen' })).toBeInTheDocument();
  });

  it('stellt das „i" in die Namenszeile, nicht hinter die Anschrift (UBK-004)', () => {
    renderWithProviders(<Tageskarte termin={eintrag()} kicker="Erster Weg" />);
    const knopf = screen.getByRole('button', { name: 'Etage, Zugang und Kontakt' });
    const name = screen.getByRole('link', { name: 'Max Mustermann' });
    expect(knopf.parentElement).toBe(name.closest('p')!.parentElement);
    const anschrift = screen.getByText('Beispielstrasse 12, 72070 Tuebingen');
    expect(
      anschrift.compareDocumentPosition(knopf) & Node.DOCUMENT_POSITION_PRECEDING,
    ).toBeTruthy();
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
