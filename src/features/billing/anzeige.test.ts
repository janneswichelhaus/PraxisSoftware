import { describe, expect, it } from 'vitest';
import {
  empfaengerart,
  grundlageText,
  ibanInGruppen,
  klammerText,
  monatsname,
  personLabel,
  positionenMitTagen,
  zahlungsTon,
  zeitraumText,
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

  describe('Rechnung je Verordnung (ABR-032)', () => {
    const zeile = (tag: string, code: string, preis: number) => ({
      performed_on: tag,
      code,
      label: code === 'KG' ? 'Krankengymnastik' : 'Hausbesuchspauschale',
      item_kind: 'treatment',
      quantity: 1,
      unit_price_cents: preis,
      line_total_cents: preis,
      currency: 'EUR',
      tax_treatment: 'exempt_healthcare',
      tax_rate_permille: 0,
    });

    it('fasst gleiche Positionen mit ihren Behandlungstagen zusammen', () => {
      const positionen = positionenMitTagen([
        zeile('2026-08-27', 'KG', 10000),
        zeile('2026-08-27', 'HB', 4000),
        zeile('2026-07-22', 'KG', 10000),
        zeile('2026-07-29', 'KG', 10000),
        zeile('2026-07-29', 'HB', 4000),
      ]);
      expect(positionen).toEqual([
        expect.objectContaining({
          code: 'KG',
          menge: 3,
          unit_price_cents: 10000,
          summe_cents: 30000,
          tage: ['2026-07-22', '2026-07-29', '2026-08-27'],
        }),
        expect.objectContaining({ code: 'HB', menge: 2, summe_cents: 8000 }),
      ]);
    });

    it('trennt Positionen mit verschiedenem Anteil und erfindet keinen Betrag', () => {
      // Am Termin ohne Hausbesuch traegt KG das ganze Honorar.
      const positionen = positionenMitTagen([
        zeile('2026-07-22', 'KG', 14000),
        zeile('2026-07-29', 'KG', 10000),
      ]);
      expect(positionen.map((p) => p.summe_cents)).toEqual([14000, 10000]);
    });

    it('nennt am Abo-Monat den Zeitraum statt eines Behandlungstags (ANG-002)', () => {
      const [position] = positionenMitTagen([
        {
          ...zeile('2026-10-01', 'NSA', 3900),
          label: 'Nachsorge-Abo (Monat)',
          item_kind: 'aftercare_month',
          period_until: '2026-10-31',
        },
      ]);
      expect(position).toMatchObject({
        tage: ['2026-10-01'],
        zeitraeume: [{ von: '2026-10-01', bis: '2026-10-31' }],
      });
      // Positionen vom Termin tragen keinen Zeitraum.
      expect(positionenMitTagen([zeile('2026-10-02', 'KG', 4500)])[0]!.zeitraeume).toEqual([]);
    });

    it('nennt die Verordnung als Klammer, ohne sie den Monat', () => {
      expect(
        klammerText({
          basis_kind: 'follow_up',
          basis_issued_on: '2026-09-08',
          period_month: '2026-09-01',
        }),
      ).toBe('Folgeverordnung vom 08.09.2026');
      expect(klammerText({ period_month: '2026-09-01' })).toBe('September 2026');
    });

    it('nennt den Zeitraum, an einem Tag nur den Tag', () => {
      expect(zeitraumText({ from: '2026-07-22', to: '2026-08-27' })).toBe(
        '22.07.2026 bis 27.08.2026',
      );
      expect(zeitraumText({ from: '2026-07-22', to: '2026-07-22' })).toBe('22.07.2026');
      expect(zeitraumText(undefined)).toBeNull();
    });
  });
});
