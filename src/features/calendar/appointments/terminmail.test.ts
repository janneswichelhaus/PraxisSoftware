import { describe, expect, it } from 'vitest';
import type { AppointmentSlipEntry } from './api';
import {
  MAILTO_HOECHSTLAENGE,
  MAIL_BETREFF,
  mailtoUrl,
  terminMailText,
  terminmailEntwurf,
} from './terminmail';

function eintrag(
  nummer: number,
  ueberschreibungen: Partial<AppointmentSlipEntry> = {},
): AppointmentSlipEntry {
  const tag = String(3 + nummer).padStart(2, '0');
  const basis: AppointmentSlipEntry = {
    id: `aaaaaaaa-aaaa-4aaa-8aaa-0000000000${String(nummer).padStart(2, '0')}`,
    starts_at: `2027-05-${tag}T07:00:00.000Z`,
    ends_at: `2027-05-${tag}T08:00:00.000Z`,
    appointment_type: 'practice',
    location_name: 'Hauptstandort Tuebingen',
    staff_given_name: 'Anna',
    staff_family_name: 'Beispiel',
    organization_time_zone: 'Europe/Berlin',
  };
  return { ...basis, ...ueberschreibungen };
}

describe('terminMailText', () => {
  it('nennt Datum, Zeit, Ort und behandelnde Person je Termin', () => {
    const text = terminMailText('Max Mustermann', [eintrag(1), eintrag(2)]);

    expect(text).toContain('Guten Tag Max Mustermann,');
    expect(text).toContain('Dienstag, 4. Mai 2027');
    expect(text).toContain('09:00–10:00 Uhr · Hauptstandort Tuebingen · Anna Beispiel');
    expect(text).toContain('Mittwoch, 5. Mai 2027');
    expect(text).toContain('rechtzeitig ab');
  });

  it('schreibt beim Hausbesuch die eigene Wohnung und keine Adresse', () => {
    const text = terminMailText('Max Mustermann', [
      eintrag(1, { appointment_type: 'home_visit', location_name: null }),
    ]);

    expect(text).toContain('bei Ihnen zu Hause');
    expect(text).not.toMatch(/Straße|Weg \d|\d{5}/);
  });

  it('traegt weder Status noch Verordnung noch Behandlungsinhalt', () => {
    const text = terminMailText('Max Mustermann', [eintrag(1)]);

    for (const verboten of [/bestätigt/i, /verordnung/i, /diagnose/i, /dokumentation/i]) {
      expect(text).not.toMatch(verboten);
    }
  });
});

describe('mailtoUrl', () => {
  it('laesst die Empfaengeradresse lesbar und kodiert den Rest', () => {
    const url = mailtoUrl('max@example.invalid', 'Ihre nächsten Termine', 'Guten Tag');

    expect(url.startsWith('mailto:max@example.invalid?')).toBe(true);
    expect(url).toContain('subject=Ihre%20n%C3%A4chsten%20Termine');
    expect(url).toContain('body=Guten%20Tag');
  });

  it('kodiert Leerzeichen als %20 und nicht als Pluszeichen', () => {
    // Im Rumpf einer mailto-Adresse ist ein „+" ein Pluszeichen. Käme der Text
    // mit „+" zwischen den Wörtern an, wäre die Nachricht unlesbar.
    const url = mailtoUrl('max@example.invalid', 'Betreff hier', 'ein Text mit Wörtern');
    expect(url).not.toContain('+');
  });

  it('macht aus Zeilenumbruechen CRLF, wie RFC 6068 es verlangt', () => {
    const url = mailtoUrl('max@example.invalid', 'B', 'erste\nzweite');
    expect(url).toContain('erste%0D%0Azweite');
  });

  it('haengt ueber die Adresse keine weiteren Kopfzeilen an', () => {
    const url = mailtoUrl('max@example.invalid?bcc=fremd@example.invalid', 'B', 'T');

    // Genau ein „?" - das der Anwendung. Das eingeschleuste ist kodiert.
    expect(url.split('?')).toHaveLength(2);
    expect(url).toContain('%3Fbcc%3D');
  });
});

describe('terminmailEntwurf', () => {
  it('nimmt alle Termine, solange sie passen', () => {
    const alle = [eintrag(1), eintrag(2), eintrag(3)];
    const entwurf = terminmailEntwurf('Max Mustermann', 'max@example.invalid', alle);

    expect(entwurf.betreff).toBe(MAIL_BETREFF);
    expect(entwurf.enthalten).toHaveLength(3);
    expect(entwurf.ausgelassen).toBe(0);
    expect(entwurf.url.length).toBeLessThanOrEqual(MAILTO_HOECHSTLAENGE);
  });

  it('kuerzt von hinten, statt das Mailprogramm still abschneiden zu lassen', () => {
    const viele = Array.from({ length: 20 }, (_, index) => eintrag(index + 1));
    const entwurf = terminmailEntwurf('Max Mustermann', 'max@example.invalid', viele);

    expect(entwurf.url.length).toBeLessThanOrEqual(MAILTO_HOECHSTLAENGE);
    expect(entwurf.ausgelassen).toBeGreaterThan(0);
    expect(entwurf.enthalten.length + entwurf.ausgelassen).toBe(20);
    // Von hinten gekuerzt: Der erste Termin bleibt, der letzte faellt weg.
    expect(entwurf.enthalten[0]?.id).toBe(viele[0]?.id);
    expect(entwurf.enthalten.at(-1)?.id).not.toBe(viele.at(-1)?.id);
  });

  it('vermerkt genau so viele Termine, wie in der E-Mail stehen', () => {
    // Der tragende Punkt: Vermerkt wird `enthalten`. Stünden dort mehr
    // Termine als im Text, behauptete der Vermerk eine Mitteilung, die nicht
    // stattgefunden hat.
    const viele = Array.from({ length: 20 }, (_, index) => eintrag(index + 1));
    const entwurf = terminmailEntwurf('Max Mustermann', 'max@example.invalid', viele);

    const zeitzeilen = entwurf.text.match(/ Uhr · /g) ?? [];
    expect(zeitzeilen).toHaveLength(entwurf.enthalten.length);
    expect(entwurf.enthalten.length).toBeLessThan(20);
  });

  it('behaelt bei einem sehr langen Namen wenigstens einen Termin', () => {
    const entwurf = terminmailEntwurf('Ä'.repeat(900), 'max@example.invalid', [eintrag(1)]);
    expect(entwurf.enthalten).toHaveLength(1);
  });
});
