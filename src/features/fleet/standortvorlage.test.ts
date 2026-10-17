import { describe, expect, it } from 'vitest';
import { standortvorlageKoeln, werkstattRufnummern } from './standortvorlage';

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

  it('nennt Rufnummern erst, wenn eine hinterlegt ist', () => {
    expect(werkstattRufnummern(standortvorlageKoeln.werkstatt)).toBeNull();
    expect(
      werkstattRufnummern({ ...standortvorlageKoeln.werkstatt, telefon: '07071 000000' }),
    ).toBe('Telefon: 07071 000000');
    expect(
      werkstattRufnummern({
        ...standortvorlageKoeln.werkstatt,
        telefon: '07071 000000',
        mobil: '0170 0000000',
      }),
    ).toBe('Telefon: 07071 000000 · Mobil: 0170 0000000');
  });

  it('benennt Zustaendigkeit als Rolle, nicht als Person', () => {
    expect(standortvorlageKoeln.zustaendigeRolle).toBe('Teamleitung');
  });
});
