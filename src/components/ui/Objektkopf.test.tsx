import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test-utils';
import { pruefeBarrierefreiheit } from '@/barrierefreiheit';
import { Badge } from './Badge';
import { Button } from './Button';
import { ButtonLink } from './ButtonLink';
import { Objektkopf, Warnzeile } from './Objektkopf';
import { Reiterleiste, Suchreiterleiste } from './Reiterleiste';

/** Die Klassen eines Elements als Liste - für Zusicherungen ohne Teiltreffer. */
function klassenVon(element: Element | null | undefined): string[] {
  return (element?.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);
}

const REITER = [
  { to: '/patienten/1/termine', label: 'Termine' },
  { to: '/patienten/1/doku', label: 'Doku' },
  { to: '/patienten/1/stammdaten', label: 'Stammdaten' },
];

describe('Objektkopf (Design-Fundament, aus dem Rahmen der Akte)', () => {
  it('ist eine Karte mit dem Titel als einziger h1, Metazeile, Abzeichen, Aktionen und Reitern', async () => {
    const { container } = renderWithProviders(
      <Objektkopf
        titel="Max Mustermann"
        rueckweg={{ to: '/patienten', beschriftung: 'Zurück zu den Patient:innen' }}
        meta="geb. 12.03.1961 · 65 Jahre · Tübingen"
        status={<Badge ton="warnung">Nicht in Versorgung</Badge>}
        abzeichen={<Badge ton="akzent">Liege mitnehmen</Badge>}
        aktionen={
          <>
            <ButtonLink to="/patienten/1/termine/neu">Termin anlegen</ButtonLink>
            <ButtonLink to="/patienten/1/verordnungen/neu" variant="secondary">
              Grundlage erfassen
            </ButtonLink>
          </>
        }
        hinweise={
          <Warnzeile aktion={<a href="#foto">Fotografieren</a>}>Anmeldebogen fehlt</Warnzeile>
        }
        reiter={<Reiterleiste label="Bereiche der Akte" reiter={REITER} />}
      />,
      '/patienten/1/termine',
    );

    const kopf = container.querySelector('header')!;
    expect(klassenVon(kopf)).toEqual(
      expect.arrayContaining(['rounded-card', 'border', 'border-line', 'bg-surface']),
    );
    expect(kopf.className).not.toMatch(/shadow|ring/);

    // Der Titel ist der Seitentitel: 26 px am Telefon, 32 ab 640, 800, Hauptfarbe.
    const titel = screen.getByRole('heading', { level: 1, name: 'Max Mustermann' });
    expect(klassenVon(titel)).toEqual(
      expect.arrayContaining([
        'text-accent',
        'text-h2-mobil',
        'sm:text-h2',
        'tracking-display',
        'font-extrabold',
      ]),
    );
    expect(screen.getAllByRole('heading')).toHaveLength(1);

    // Pfeil zurück nur am Telefon, benannt und mit Tooltip.
    const pfeil = screen.getByRole('link', { name: 'Zurück zu den Patient:innen' });
    expect(pfeil).toHaveAttribute('href', '/patienten');
    expect(pfeil).toHaveAttribute('title', 'Zurück zu den Patient:innen');
    expect(klassenVon(pfeil)).toEqual(expect.arrayContaining(['size-10', 'sm:hidden']));

    expect(klassenVon(screen.getByText('geb. 12.03.1961 · 65 Jahre · Tübingen'))).toEqual(
      expect.arrayContaining(['text-ink-muted', 'text-sm']),
    );
    expect(screen.getByText('Nicht in Versorgung')).toBeInTheDocument();
    expect(screen.getByText('Liege mitnehmen')).toBeInTheDocument();

    // Aktionen sind ohne Angabe kompakt (44 px) und teilen sich am Telefon die Breite.
    const termin = screen.getByRole('link', { name: 'Termin anlegen' });
    expect(klassenVon(termin)).toEqual(expect.arrayContaining(['min-h-11', 'text-sm']));
    expect(klassenVon(termin)).not.toContain('h-12');
    expect(klassenVon(termin.parentElement)).toEqual(
      expect.arrayContaining(['w-full', '*:flex-1', 'sm:w-auto', 'sm:*:flex-none']),
    );

    // Die Warnzeile: Zeichen vorn, für Vorlesesoftware ausgeblendet.
    const warnung = screen.getByText('Anmeldebogen fehlt');
    expect(warnung.textContent).toBe('! Anmeldebogen fehlt');
    expect(warnung.querySelector('[aria-hidden="true"]')).toHaveTextContent('!');
    expect(klassenVon(warnung.parentElement)).toEqual(
      expect.arrayContaining(['bg-warnung-soft', 'text-warnung', 'min-h-11']),
    );

    // Die Reiter stehen in derselben Karte, mit einer Linie darüber.
    const reiter = screen.getByRole('navigation', { name: 'Bereiche der Akte' });
    expect(kopf).toContainElement(reiter);
    expect(klassenVon(reiter)).toEqual(expect.arrayContaining(['border-t', 'border-line']));

    await pruefeBarrierefreiheit(container);
  });

  it('setzt ohne Rückweg den Titel ohne Pfeil und lässt leere Bereiche weg', () => {
    const { container } = renderWithProviders(<Objektkopf titel="Lastenrad 1" />);
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByRole('heading', { level: 1 }).parentElement).toHaveClass('min-w-0');
    // Ohne Hinweise kein leerer Bereich mit Abstand, ohne Aktionen kein Behälter.
    expect(container.querySelector('.empty\\:hidden')).toBeNull();
    expect(container.querySelector('.sm\\:w-auto')).toBeNull();
  });

  it('lässt eine ausdrückliche Größe am Knopf gelten', () => {
    renderWithProviders(
      <Objektkopf
        titel="Anna Beispiel"
        aktionen={
          <Button type="button" groesse="normal">
            Groß
          </Button>
        }
      />,
    );
    expect(screen.getByRole('button', { name: 'Groß' })).toHaveClass('h-12');
  });

  it('setzt den Satz unter den Aktionen über die volle Breite', () => {
    renderWithProviders(<Objektkopf titel="Anna Beispiel" fuss="Keine neuen Termine." />);
    expect(klassenVon(screen.getByText('Keine neuen Termine.'))).toEqual(
      expect.arrayContaining(['w-full', 'text-sm', 'text-ink-muted']),
    );
  });

  it('hält einen Hinweisbereich, der leer bleibt, unsichtbar (empty:hidden)', () => {
    const Nichts = () => null;
    const { container } = renderWithProviders(
      <Objektkopf titel="Anna Beispiel" hinweise={<Nichts />} />,
    );
    const bereich = container.querySelector('header > div:nth-child(2)')!;
    expect(bereich).toBeEmptyDOMElement();
    expect(klassenVon(bereich)).toContain('empty:hidden');
  });
});

describe('Reiterleiste (Design-Fundament)', () => {
  it('markiert den offenen Reiter als Seite und setzt ihn auf die Akzentfläche', () => {
    renderWithProviders(
      <Reiterleiste label="Bereiche der Akte" reiter={REITER} />,
      '/patienten/1/doku',
    );
    const doku = screen.getByRole('link', { name: 'Doku' });
    expect(doku).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Termine' })).not.toHaveAttribute('aria-current');
    // Pillen 44 px, 15 px, aktiv Akzentfläche in der Hauptfarbe, 600.
    expect(klassenVon(doku)).toEqual(
      expect.arrayContaining([
        'rounded-pill',
        'min-h-11',
        'text-liste',
        'aria-[current=page]:bg-accent-soft',
        'aria-[current=page]:text-accent',
        'aria-[current=page]:font-semibold',
      ]),
    );
  });

  it('scrollt am Telefon waagerecht und bricht ab 640 px um', () => {
    renderWithProviders(<Reiterleiste label="Teile" reiter={REITER} />, '/patienten/1/termine');
    expect(klassenVon(screen.getByRole('list'))).toEqual(
      expect.arrayContaining(['overflow-x-auto', 'sm:flex-wrap', 'sm:overflow-visible']),
    );
  });

  describe('Verlauf an den Rändern (Sichtung 13.10.2026, A1)', () => {
    // Vier Reiter à 120 px, 300 px sichtbar - wie die Akte bei 375 px.
    const VIER = [...REITER, { to: '/patienten/1/verordnungen', label: 'Grundlagen' }];
    function geometrie() {
      const breite = 300;
      vi.spyOn(Element.prototype, 'scrollWidth', 'get').mockImplementation(function (
        this: Element,
      ) {
        return this.tagName === 'UL' ? VIER.length * 120 : 0;
      });
      vi.spyOn(Element.prototype, 'clientWidth', 'get').mockImplementation(function (
        this: Element,
      ) {
        return this.tagName === 'UL' ? breite : 0;
      });
      vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
        this: Element,
      ) {
        const rechteck = (left: number, width: number) =>
          ({ left, right: left + width, width, top: 0, bottom: 44, height: 44 }) as DOMRect;
        if (this.tagName === 'UL') return rechteck(0, breite);
        const liste = this.closest('ul');
        const index = VIER.findIndex((eintrag) => eintrag.label === this.textContent);
        return rechteck(index * 120 - (liste?.scrollLeft ?? 0), 120);
      });
    }
    afterEach(() => vi.restoreAllMocks());

    it('zeigt rechts „›", solange dort Reiter außer Sicht liegen, und links „‹", wenn gerollt', () => {
      geometrie();
      renderWithProviders(<Reiterleiste label="Teile" reiter={VIER} />, '/patienten/1/termine');
      const liste = screen.getByRole('list');
      expect(document.querySelector('[data-verlauf="links"]')).toBeNull();
      const rechts = document.querySelector('[data-verlauf="rechts"]')!;
      expect(rechts).not.toBeNull();
      expect(rechts).toHaveTextContent('›');
      // Auf der weißen Karte, nur wo die Leiste rollt; der Verlauf selbst fängt
      // keinen Tipp, nur sein Knopf (BEF-183).
      expect(rechts).toHaveAttribute('aria-hidden', 'true');
      expect(klassenVon(rechts)).toEqual(
        expect.arrayContaining(['from-surface', 'sm:hidden', 'pointer-events-none', 'w-11']),
      );

      // Ans Ende gerollt: rechts nichts mehr, links liegt jetzt etwas.
      liste.scrollLeft = VIER.length * 120 - 300;
      fireEvent.scroll(liste);
      expect(document.querySelector('[data-verlauf="rechts"]')).toBeNull();
      expect(document.querySelector('[data-verlauf="links"]')).toHaveTextContent('‹');
    });

    it('rollt den offenen Reiter so weit, dass er nicht unter dem Verlauf liegt', () => {
      geometrie();
      renderWithProviders(<Reiterleiste label="Teile" reiter={VIER} />, '/patienten/1/stammdaten');
      // „Stammdaten" liegt bei 240-360 px; rechts bleiben 52 px frei (Verlauf 44).
      expect(screen.getByRole('list').scrollLeft).toBe(360 + 52 - 300);
      expect(document.querySelector('[data-verlauf="links"]')).not.toBeNull();
    });

    it('blättert mit einem Tipp auf „›" weiter, bis der nächste verdeckte Reiter im Bild steht (BEF-183)', async () => {
      geometrie();
      const user = userEvent.setup();
      renderWithProviders(<Reiterleiste label="Teile" reiter={VIER} />, '/patienten/1/termine');
      const liste = screen.getByRole('list');
      const knopf = document.querySelector<HTMLButtonElement>('[data-verlauf-knopf="rechts"]')!;
      // 44 px Tippziel über die Höhe der Reihe; die Tastatur und die
      // Vorlesesoftware erreichen jeden Reiter ohnehin und überspringen ihn.
      expect(klassenVon(knopf)).toEqual(
        expect.arrayContaining(['pointer-events-auto', 'w-11', 'h-full']),
      );
      expect(knopf).toHaveAttribute('tabindex', '-1');
      expect(knopf).toHaveTextContent('›');
      expect(screen.queryAllByRole('button')).toEqual([]);

      // Ein Blatt weiter: 300 px abzüglich zweimal 52 px Verlauf = 196 px, höchstens
      // bis ans Ende (480 - 300) - „Stammdaten" und „Grundlagen" stehen ganz im Bild.
      await user.click(knopf);
      expect(liste.scrollLeft).toBe(480 - 300);
      // Jetzt liegt links etwas - „‹" rollt zurück zum vorigen verdeckten Reiter.
      fireEvent.scroll(liste);
      const zurueck = document.querySelector<HTMLButtonElement>('[data-verlauf-knopf="links"]')!;
      expect(zurueck).toHaveTextContent('‹');
      // Ein Blatt zurück, höchstens bis an den Anfang.
      await user.click(zurueck);
      expect(liste.scrollLeft).toBe(0);
    });

    it('zeigt keinen Verlauf, wo die Leiste umbricht und alles zu sehen ist', () => {
      vi.spyOn(Element.prototype, 'scrollWidth', 'get').mockReturnValue(300);
      vi.spyOn(Element.prototype, 'clientWidth', 'get').mockReturnValue(300);
      renderWithProviders(<Reiterleiste label="Teile" reiter={VIER} />, '/patienten/1/termine');
      expect(document.querySelector('[data-verlauf]')).toBeNull();
    });
  });

  it('ist ohne end auch auf Unterseiten aktiv, mit end nur auf dem Pfad', () => {
    const { unmount } = renderWithProviders(
      <Reiterleiste label="Teile" reiter={[{ to: '/rad/1', label: 'Rad' }]} />,
      '/rad/1/checkup',
    );
    expect(screen.getByRole('link', { name: 'Rad' })).toHaveAttribute('aria-current', 'page');
    unmount();
    renderWithProviders(
      <Reiterleiste label="Teile" reiter={[{ to: '/rad/1', label: 'Rad', end: true }]} />,
      '/rad/1/checkup',
    );
    expect(screen.getByRole('link', { name: 'Rad' })).not.toHaveAttribute('aria-current');
  });
});

describe('Suchreiterleiste (R2-neu6, ANN-460)', () => {
  const BEREICHE = [
    { wert: 'einsatz', label: 'Einsatz' },
    { wert: 'zugang', label: 'Zugang' },
  ] as const;

  it('nennt jeden Reiter im Suchteil, auch den ersten, und nimmt die übrigen Parameter mit', () => {
    renderWithProviders(
      <Suchreiterleiste label="Bereiche" param="bereich" reiter={BEREICHE} />,
      '/praxis/team/1?zurueck=%2Fpraxis%2Fteam',
    );
    const einsatz = screen.getByRole('link', { name: 'Einsatz' });
    // Ohne Parameter gilt der erste.
    expect(einsatz).toHaveAttribute('aria-current', 'page');
    expect(einsatz).toHaveAttribute(
      'href',
      '/praxis/team/1?zurueck=%2Fpraxis%2Fteam&bereich=einsatz',
    );
    expect(screen.getByRole('link', { name: 'Zugang' })).toHaveAttribute(
      'href',
      '/praxis/team/1?zurueck=%2Fpraxis%2Fteam&bereich=zugang',
    );
    // Dieselbe Pille wie die Reiterleiste.
    expect(klassenVon(einsatz)).toEqual(
      expect.arrayContaining(['rounded-pill', 'min-h-11', 'aria-[current=page]:bg-accent-soft']),
    );
  });

  it('öffnet den Reiter aus der Adresse; ein unbekannter Wert öffnet den ersten', () => {
    const { unmount } = renderWithProviders(
      <Suchreiterleiste label="Bereiche" param="bereich" reiter={BEREICHE} />,
      '/praxis/team/1?bereich=zugang',
    );
    expect(screen.getByRole('link', { name: 'Zugang' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Einsatz' })).not.toHaveAttribute('aria-current');
    unmount();

    renderWithProviders(
      <Suchreiterleiste label="Bereiche" param="bereich" reiter={BEREICHE} />,
      '/praxis/team/1?bereich=unbekannt',
    );
    expect(screen.getByRole('link', { name: 'Einsatz' })).toHaveAttribute('aria-current', 'page');
  });
});
