import { describe, expect, it } from 'vitest';
import {
  istRuhetag,
  standortvorlageKoeln,
  werkstattNummern,
  wochentag,
  zustaendigeNummern,
} from './standortvorlage';

/**
 * Die Standortvorlage des Pannenablaufs (bis FLT-EPIC-001 in
 * `src/features/preview/trennung.test.ts`, mit der Vorlage hierher gezogen und
 * unverändert): Sie bleibt als ungeprüft gekennzeichnet, trägt keine
 * betrieblichen Kontaktdaten und benennt Zuständigkeit als Rolle.
 */
describe('Standortvorlage', () => {
  it('ist als ungeprueft gekennzeichnet', () => {
    expect(standortvorlageKoeln.geprueft).toBe(false);
    expect(standortvorlageKoeln.pruefhinweis).toMatch(/Tübingen/);
  });

  it('enthaelt keine betrieblichen Kontaktdaten oder Zugangscodes', () => {
    const werte = [
      standortvorlageKoeln.werkstatt.name,
      standortvorlageKoeln.werkstatt.telefon,
      standortvorlageKoeln.werkstatt.mobil,
      standortvorlageKoeln.depot.zugangHinweis,
    ].join(' ');
    // Keine Telefonnummer und keine mehrstellige Zahlenfolge, die als Code
    // gelesen werden koennte.
    expect(werte).not.toMatch(/\d{3,}/);
    expect(werte).toMatch(/nicht hinterlegt|nicht in der Anwendung gespeichert/);
  });

  it('waehlt erst, wenn eine Rufnummer hinterlegt ist (BEF-176)', () => {
    expect(werkstattNummern(standortvorlageKoeln.werkstatt)).toEqual([]);
    expect(zustaendigeNummern(standortvorlageKoeln)).toEqual([]);
    expect(
      werkstattNummern({ ...standortvorlageKoeln.werkstatt, telefon: '07071 000000' }),
    ).toEqual([{ label: 'Werkstatt', anzeige: '07071 000000', href: 'tel:07071000000' }]);
    expect(
      zustaendigeNummern({ ...standortvorlageKoeln, zustaendigeRufnummer: '0170 0000000' }),
    ).toEqual([{ label: 'Teamleitung', anzeige: '0170 0000000', href: 'tel:01700000000' }]);
  });

  it('kennt den Ruhetag aus dem Datum in der Zeit der Praxis (BEF-176)', () => {
    // Mittwoch, 21.10.2026, 00:30 in Berlin - in UTC noch Dienstag.
    const kurzNachMitternacht = new Date('2026-10-20T22:30:00Z');
    expect(wochentag(kurzNachMitternacht, 'Europe/Berlin')).toBe('Mittwoch');
    expect(wochentag(kurzNachMitternacht, 'UTC')).toBe('Dienstag');
    expect(istRuhetag(standortvorlageKoeln, kurzNachMitternacht, 'Europe/Berlin')).toBe(true);
    expect(
      istRuhetag(standortvorlageKoeln, new Date('2026-10-23T10:00:00Z'), 'Europe/Berlin'),
    ).toBe(false);
  });

  it('benennt Zustaendigkeit als Rolle, nicht als Person', () => {
    expect(standortvorlageKoeln.zustaendigeRolle).toBe('Teamleitung');
  });
});
