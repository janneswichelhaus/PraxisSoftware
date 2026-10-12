import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test-utils';
import { Button } from './Button';
import { ButtonLink } from './ButtonLink';
import { PageHeader } from './PageHeader';

/**
 * Aktionen im Seitenkopf sind ohne Angabe kompakt (ANN-403, DESIGN.md Regel
 * „Kopf“): Bis dahin brach ein Anlegen-Knopf in voller Größe am Telefon unter
 * den Titel.
 */
describe('PageHeader-Aktionen (Design-Fundament)', () => {
  it('macht Knöpfe und Knopf-Links im Kopf ohne Angabe kompakt', () => {
    renderWithProviders(
      <PageHeader
        title="Mitarbeitende"
        actions={
          <>
            <ButtonLink to="/neu">Anlegen</ButtonLink>
            <Button type="button" variant="secondary">
              Drucken
            </Button>
          </>
        }
      />,
    );
    for (const element of [
      screen.getByRole('link', { name: 'Anlegen' }),
      screen.getByRole('button', { name: 'Drucken' }),
    ]) {
      expect(element).toHaveClass('min-h-11', 'text-sm');
      expect(element).not.toHaveClass('h-12');
    }
  });

  it('lässt eine ausdrückliche Größe gelten', () => {
    renderWithProviders(
      <PageHeader
        title="Tour"
        actions={
          <ButtonLink to="/kalender" groesse="normal">
            Zum Kalender
          </ButtonLink>
        }
      />,
    );
    expect(screen.getByRole('link', { name: 'Zum Kalender' })).toHaveClass('h-12');
  });

  it('ändert außerhalb des Kopfs nichts: dort bleibt ein Knopf 48 px hoch', () => {
    renderWithProviders(
      <>
        <PageHeader title="Seite" />
        <Button type="button">Speichern</Button>
      </>,
    );
    expect(screen.getByRole('button', { name: 'Speichern' })).toHaveClass('h-12');
  });
});
