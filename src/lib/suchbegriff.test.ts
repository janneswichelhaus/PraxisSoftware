import { beforeEach, describe, expect, it } from 'vitest';
import { gemerkterSuchbegriff, suchbegriffMerken, suchbegriffeLeeren } from './suchbegriff';

describe('Suchbegriffe der Listen', () => {
  beforeEach(() => {
    suchbegriffeLeeren();
  });

  it('merkt sich den Begriff je Liste getrennt', () => {
    suchbegriffMerken('patienten', 'erika');
    suchbegriffMerken('mitarbeitende', 'anna');
    expect(gemerkterSuchbegriff('patienten')).toBe('erika');
    expect(gemerkterSuchbegriff('mitarbeitende')).toBe('anna');
    expect(gemerkterSuchbegriff('radflotte')).toBe('');
  });

  it('vergisst einen geleerten Begriff', () => {
    suchbegriffMerken('radflotte', 'nina');
    suchbegriffMerken('radflotte', '');
    expect(gemerkterSuchbegriff('radflotte')).toBe('');
  });

  it('leert beim Kontowechsel alle Listen', () => {
    suchbegriffMerken('patienten', 'erika');
    suchbegriffMerken('radflotte', 'nina');
    suchbegriffeLeeren();
    expect(gemerkterSuchbegriff('patienten')).toBe('');
    expect(gemerkterSuchbegriff('radflotte')).toBe('');
  });
});
