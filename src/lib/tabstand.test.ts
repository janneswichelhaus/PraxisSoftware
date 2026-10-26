// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { tabstaendeLeeren, tabstandLegen, tabstandLesen } from './tabstand';

describe('Stand eines Vorgangs im Tab (ANN-574)', () => {
  it('gibt den Stand nur dem Konto zurück, das ihn gelegt hat', () => {
    tabstandLegen('anna', 'v1', { abgesagt: ['t1'] });
    expect(tabstandLesen('anna', 'v1')).toEqual({ abgesagt: ['t1'] });
    expect(tabstandLesen('bert', 'v1')).toBeUndefined();
    expect(tabstandLesen('anna', 'v2')).toBeUndefined();
  });

  it('liest einen kaputten Eintrag als keinen', () => {
    sessionStorage.setItem('tabstand:anna:v1', '{kaputt');
    expect(tabstandLesen('anna', 'v1')).toBeUndefined();
  });

  it('behält auf Wunsch die Stände eines Kontos oder nur einen seiner Vorgänge', () => {
    tabstandLegen('anna', 'v1', 1);
    tabstandLegen('anna', 'v2', 2);
    tabstandLegen('bert', 'v3', 3);
    tabstaendeLeeren({ konto: 'anna' });
    expect([tabstandLesen('anna', 'v1'), tabstandLesen('anna', 'v2')]).toEqual([1, 2]);
    expect(tabstandLesen('bert', 'v3')).toBeUndefined();
    tabstaendeLeeren({ konto: 'anna', vorgang: 'v2' });
    expect([tabstandLesen('anna', 'v1'), tabstandLesen('anna', 'v2')]).toEqual([undefined, 2]);
  });

  it('leert nur die eigenen Einträge', () => {
    tabstandLegen('anna', 'v1', 1);
    tabstandLegen('bert', 'v2', 2);
    sessionStorage.setItem('startbild-gezeigt', '1');
    tabstaendeLeeren();
    expect(tabstandLesen('anna', 'v1')).toBeUndefined();
    expect(tabstandLesen('bert', 'v2')).toBeUndefined();
    expect(sessionStorage.getItem('startbild-gezeigt')).toBe('1');
  });
});
