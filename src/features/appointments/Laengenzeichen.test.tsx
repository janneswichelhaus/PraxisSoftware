import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Laengenzeichen } from './Laengenzeichen';
import { abweichendeLaengeMinuten, abweichendeLaengeText, istRegellaenge } from './api';

/**
 * PROJECT_PRINCIPLES.md 0.11 §8.1: Ein Behandlungstermin, dessen Länge weder
 * 45 noch 60 Minuten beträgt, MUSS gekennzeichnet werden - test- oder
 * auditierbar (§0). Das ist dieser Test (CAL-020).
 */
const um = (von: string, bis: string) => ({
  starts_at: `2027-05-12T${von}:00.000Z`,
  ends_at: `2027-05-12T${bis}:00.000Z`,
});

describe('abweichendeLaengeMinuten', () => {
  it('kennzeichnet weder 45 noch 60 Minuten', () => {
    expect(abweichendeLaengeMinuten({ kind: 'treatment', ...um('07:00', '08:00') })).toBeNull();
    expect(abweichendeLaengeMinuten({ kind: 'treatment', ...um('07:00', '07:45') })).toBeNull();
  });

  it('nennt jede andere Laenge eines Behandlungstermins in Minuten', () => {
    expect(abweichendeLaengeMinuten({ kind: 'treatment', ...um('07:00', '07:30') })).toBe(30);
    expect(abweichendeLaengeMinuten({ kind: 'treatment', ...um('07:00', '08:30') })).toBe(90);
    expect(abweichendeLaengeMinuten({ kind: 'treatment', ...um('07:00', '08:05') })).toBe(65);
  });

  it('kennzeichnet ein Ereignis nie', () => {
    expect(abweichendeLaengeMinuten({ kind: 'event', ...um('07:00', '07:30') })).toBeNull();
    expect(abweichendeLaengeMinuten({ kind: 'event', ...um('07:00', '09:00') })).toBeNull();
  });

  it('behandelt eine Liste ohne `kind` als Behandlungstermine (Akte)', () => {
    expect(abweichendeLaengeMinuten(um('07:00', '07:30'))).toBe(30);
  });

  it('erfindet bei unlesbaren Zeitpunkten kein Kennzeichen', () => {
    expect(abweichendeLaengeMinuten({ starts_at: 'x', ends_at: 'y' })).toBeNull();
  });

  it('haelt die Regellaengen an einer Stelle', () => {
    expect(istRegellaenge(60)).toBe(true);
    expect(istRegellaenge(45)).toBe(true);
    expect(istRegellaenge(30)).toBe(false);
  });
});

describe('Laengenzeichen', () => {
  it('traegt die Textfassung fuer Vorlesewerkzeuge', () => {
    render(<Laengenzeichen termin={{ kind: 'treatment', ...um('07:00', '07:30') }} />);
    expect(screen.getByTestId('laengenzeichen')).toHaveTextContent('Länge weicht ab: 30 Min.');
  });

  it('traegt sie auch in der knappen Fassung der Kalenderkachel', () => {
    render(<Laengenzeichen knapp termin={{ kind: 'treatment', ...um('07:00', '07:30') }} />);
    expect(screen.getByText(abweichendeLaengeText(30))).toBeInTheDocument();
  });

  it('erscheint bei einer Regellaenge nicht', () => {
    render(<Laengenzeichen termin={{ kind: 'treatment', ...um('07:00', '08:00') }} />);
    expect(screen.queryByTestId('laengenzeichen')).not.toBeInTheDocument();
  });

  it('erscheint an einem Ereignis nie', () => {
    render(<Laengenzeichen termin={{ kind: 'event', ...um('07:00', '07:30') }} />);
    expect(screen.queryByTestId('laengenzeichen')).not.toBeInTheDocument();
  });
});
