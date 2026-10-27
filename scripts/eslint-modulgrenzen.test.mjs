import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { RuleTester } from 'eslint';
import { describe, expect, it } from 'vitest';
import modulgrenzen, {
  DOMAENEN,
  EBENEN,
  gegenDieFolge,
  tieferImport,
} from './eslint-modulgrenzen.mjs';

const nurTermine = (modul) => modul === 'appointments';
const HEUTE = 'src/features/today/MyDayPage.tsx';

describe('tieferImport', () => {
  it('meldet den Griff an der index.ts eines anderen Moduls vorbei', () => {
    expect(tieferImport(HEUTE, '@/features/appointments/api', nurTermine)).toBe('appointments');
    expect(tieferImport(HEUTE, '../appointments/haken', nurTermine)).toBe('appointments');
  });

  it('lässt die Schnittstelle, das eigene Modul und Module ohne index.ts durch', () => {
    expect(tieferImport(HEUTE, '@/features/appointments', nurTermine)).toBeNull();
    expect(tieferImport(HEUTE, '@/features/appointments/index', nurTermine)).toBeNull();
    expect(
      tieferImport('src/features/appointments/CalendarPage.tsx', './api', nurTermine),
    ).toBeNull();
    expect(
      tieferImport('src/features/appointments/x.ts', '@/features/appointments/api', nurTermine),
    ).toBeNull();
    expect(tieferImport(HEUTE, '@/features/patients/api', nurTermine)).toBeNull();
    expect(tieferImport(HEUTE, '@/lib/termin', nurTermine)).toBeNull();
    expect(tieferImport(HEUTE, 'react', nurTermine)).toBeNull();
  });
});

describe('Regel nur-ueber-index am Baum', () => {
  RuleTester.describe = describe;
  RuleTester.it = it;
  RuleTester.itOnly = it.only;
  const pruefer = new RuleTester({
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  });
  const in_ = (pfad) => join(import.meta.dirname, '..', pfad);

  pruefer.run('nur-ueber-index', modulgrenzen.rules['nur-ueber-index'], {
    valid: [
      { code: "import { hakenFehlt } from '@/features/appointments';", filename: in_(HEUTE) },
      {
        code: "import { fetchAppointment } from './api';",
        filename: in_('src/features/appointments/a.ts'),
      },
    ],
    invalid: [
      {
        code: "import { hakenFehlt } from '@/features/appointments/haken';",
        filename: in_(HEUTE),
        errors: [{ messageId: 'tief' }],
      },
      {
        code: "export { fetchAppointment } from '@/features/appointments/api';",
        filename: in_('src/app/x.ts'),
        errors: [{ messageId: 'tief' }],
      },
      {
        code: "const seite = import('@/features/appointments/CalendarPage');",
        filename: in_(HEUTE),
        errors: [{ messageId: 'tief' }],
      },
    ],
  });
});

describe('gegenDieFolge (ANN-754)', () => {
  it('meldet außerhalb der Seiten einen Import in eine höhere Domäne', () => {
    expect(gegenDieFolge('src/features/treatment-bases/x.ts', '@/features/billing/api')).toEqual({
      hoeher: 'billing',
      von: 'patients',
    });
    expect(gegenDieFolge('src/features/auth/x.ts', '../teamchat/speicher')).toEqual({
      hoeher: 'teamchat',
      von: 'core',
    });
  });

  it('lässt Seiten, tiefere und dieselbe Domäne, das eigene Modul und src/lib durch', () => {
    const seite = 'src/features/treatment-bases/PatientTreatmentBasesPage.tsx';
    expect(gegenDieFolge(seite, '@/features/billing/posNummern')).toBeNull();
    expect(gegenDieFolge('src/features/vacation/UrlaubSeite.tsx', '@/features/today')).toBeNull();
    expect(gegenDieFolge('src/features/billing/x.ts', '@/features/patients/api')).toBeNull();
    expect(gegenDieFolge('src/features/files/x.ts', '@/features/patients/akte')).toBeNull();
    expect(gegenDieFolge('src/features/billing/x.ts', './api')).toBeNull();
    expect(gegenDieFolge('src/features/billing/x.ts', '@/lib/datum')).toBeNull();
    expect(gegenDieFolge('src/app/App.tsx', '@/features/teamchat')).toBeNull();
  });

  it('meldet ein Modul ohne Domäne', () => {
    expect(gegenDieFolge('src/features/neu/x.ts', '@/features/patients/api')).toEqual({
      ohneDomaene: 'neu',
    });
    expect(gegenDieFolge('src/features/patients/x.ts', '@/features/neu/api')).toEqual({
      ohneDomaene: 'neu',
    });
  });

  it('ordnet jedes Modul unter src/features genau einer der 14 Domänen zu', () => {
    const module = readdirSync(join(import.meta.dirname, '..', 'src', 'features'), {
      withFileTypes: true,
    })
      .filter((eintrag) => eintrag.isDirectory())
      .map((eintrag) => eintrag.name);
    expect(module.filter((modul) => !Object.hasOwn(DOMAENEN, modul))).toEqual([]);
    expect(Object.keys(DOMAENEN).filter((modul) => !module.includes(modul))).toEqual([]);
    expect(EBENEN).toHaveLength(14);
    expect(new Set(Object.values(DOMAENEN))).toEqual(new Set(EBENEN));
  });
});

describe('Regel nach-unten am Baum', () => {
  RuleTester.describe = describe;
  RuleTester.it = it;
  RuleTester.itOnly = it.only;
  const pruefer = new RuleTester({
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  });
  const in_ = (pfad) => join(import.meta.dirname, '..', pfad);

  pruefer.run('nach-unten', modulgrenzen.rules['nach-unten'], {
    valid: [
      {
        code: "import { ladePosNummern } from '@/features/billing/posNummern';",
        filename: in_('src/features/treatment-bases/PatientTreatmentBasesPage.tsx'),
      },
      {
        code: "import { fetchPatient } from '@/features/patients/api';",
        filename: in_('src/features/billing/Rechnung.tsx'),
      },
    ],
    invalid: [
      {
        code: "import { fetchKatalogVersionen } from '@/features/billing/api';",
        filename: in_('src/features/treatment-bases/posNummern.ts'),
        errors: [{ messageId: 'hoeher' }],
      },
      {
        code: "const speicher = import('@/features/teamchat/speicher');",
        filename: in_('src/features/auth/SessionProvider.tsx'),
        errors: [{ messageId: 'hoeher' }],
      },
      {
        code: "import { x } from '@/features/patients/api';",
        filename: in_('src/features/neu/x.ts'),
        errors: [{ messageId: 'ohneDomaene' }],
      },
    ],
  });
});
