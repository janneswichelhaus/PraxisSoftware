import { describe, expect, it } from 'vitest';
import {
  empfaengerart,
  grundlageText,
  ibanInGruppen,
  monatsname,
  personLabel,
  zahlungsTon,
} from './anzeige';

describe('Anzeigehilfen der Abrechnung (UXR-010)', () => {
  it('nennt den Abrechnungsmonat ohne Zeitzonenrechnung', () => {
    expect(monatsname('2026-08-01')).toBe('August 2026');
    expect(monatsname('2027-01-01')).toBe('Januar 2027');
    // Unlesbares erscheint, wie es ist - erfunden wird kein Monat.
    expect(monatsname('unbekannt')).toBe('unbekannt');
  });

  it('gliedert die IBAN in Vierergruppen und ändert sonst nichts (ABR-28)', () => {
    expect(ibanInGruppen('DE02120300000000202051')).toBe('DE02 1203 0000 0000 2020 51');
    // Schon gegliedert oder mit Leerzeichen eingegeben: dasselbe Ergebnis.
    expect(ibanInGruppen('DE02 1203 0000 0000 2020 51')).toBe('DE02 1203 0000 0000 2020 51');
    expect(ibanInGruppen('')).toBe('');
  });

  it('nennt die Grundlage mit den Wörtern der Akte (ABR-18)', () => {
    expect(grundlageText('first', '2026-07-01')).toBe('Erstverordnung vom 01.07.2026');
    expect(grundlageText('follow_up', '2026-07-01')).toBe('Folgeverordnung vom 01.07.2026');
    // Kein „Selbstzahlerin vom": die Akte sagt „Selbstzahler seit".
    expect(grundlageText('self_pay', '2026-09-03')).toBe('Selbstzahler seit 03.09.2026');
    expect(grundlageText('neu', '2026-09-03')).toBe('neu vom 03.09.2026');
  });

  it('setzt das Warnzeichen nur an Zustände mit Handlungsbedarf (ABR-16)', () => {
    expect(zahlungsTon.unpaid).toBe('neutral');
    expect(zahlungsTon.paid).toBe('positiv');
    expect(zahlungsTon.partially_paid).toBe('warnung');
    expect(zahlungsTon.overpaid).toBe('warnung');
  });

  it('nennt die Person im Training nicht behandelt (TRN-008)', () => {
    expect(personLabel('training', 'kurz')).toBe('Leistung für');
    expect(personLabel('training', 'blatt')).toBe('Leistung für');
    expect(personLabel('therapy', 'kurz')).toBe('Behandelt');
    expect(personLabel('therapy', 'blatt')).toBe('Behandelte Person');
    // Snapshots vor schema_version 3 tragen keinen Bereich und sind Behandlung.
    expect(personLabel(undefined, 'blatt')).toBe('Behandelte Person');
  });

  it('nennt die Kundin im Training nicht Patientin (ANN-182)', () => {
    expect(empfaengerart('self', 'training')).toBe('Kund:in selbst');
    expect(empfaengerart('self', 'therapy')).toBe('Patient:in selbst');
    expect(empfaengerart('aid_authority', 'therapy')).toBe('Beihilfestelle');
  });
});
