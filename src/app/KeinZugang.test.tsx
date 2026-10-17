import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { renderWithProviders, testUser } from '@/test-utils';
import { KeinZugang } from './KeinZugang';

function Adresse() {
  return <p>Adresse: {useLocation().pathname}</p>;
}

function rendern(pfad: string, rollen: Parameters<typeof testUser>[0] = ['therapist']) {
  return renderWithProviders(
    <Routes>
      <Route path="/" element={<Adresse />} />
      <Route path="*" element={<KeinZugang user={testUser(rollen)} />} />
    </Routes>,
    pfad,
  );
}

describe('KeinZugang (ORG-001)', () => {
  it('sagt auf einer Seite der Praxis ohne Zugang, woran es liegt, statt still umzuleiten', () => {
    rendern('/praxis/sicherheit/audit');
    expect(screen.getByRole('heading', { level: 1, name: 'Kein Zugang' })).toBeInTheDocument();
    expect(screen.getByText('Diese Seite gibt es für Ihren Zugang nicht.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Zur Übersicht' })).toHaveAttribute('href', '/');
  });

  it('führt ein Patientenkonto still zur Übersicht', () => {
    rendern('/praxis/team', ['patient']);
    expect(screen.getByText('Adresse: /')).toBeInTheDocument();
  });

  it('führt einen Pfad außerhalb der Praxisbereiche weiter zur Übersicht', () => {
    rendern('/anmelden');
    expect(screen.getByText('Adresse: /')).toBeInTheDocument();
  });
});
