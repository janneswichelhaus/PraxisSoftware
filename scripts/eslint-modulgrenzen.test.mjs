import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { RuleTester } from 'eslint';
import { describe, expect, it } from 'vitest';
import { DOMAENEN, EBENEN } from './domaenen.mjs';
import modulgrenzen, {
  anDerSchnittstelleVorbei,
  gegenDieFolge,
  tieferImport,
} from './eslint-modulgrenzen.mjs';

const nurTermine = ({ modul }) => modul === 'appointments';
const HEUTE = 'src/features/calendar/today/MyDayPage.tsx';

describe('tieferImport', () => {
  it('meldet den Griff an der index.ts eines anderen Moduls vorbei', () => {
    expect(tieferImport(HEUTE, '@/features/calendar/appointments/api', nurTermine)).toBe(
      'appointments',
    );
    expect(tieferImport(HEUTE, '../appointments/haken', nurTermine)).toBe('appointments');
  });

  it('lässt die Schnittstelle, das eigene Modul und Module ohne index.ts durch', () => {
    expect(tieferImport(HEUTE, '@/features/calendar/appointments', nurTermine)).toBeNull();
    expect(tieferImport(HEUTE, '@/features/calendar/appointments/index', nurTermine)).toBeNull();
    expect(
      tieferImport('src/features/calendar/appointments/CalendarPage.tsx', './api', nurTermine),
    ).toBeNull();
    expect(
      tieferImport(
        'src/features/calendar/appointments/x.ts',
        '@/features/calendar/appointments/api',
        nurTermine,
      ),
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
      {
        code: "import { hakenFehlt } from '@/features/calendar/appointments';",
        filename: in_(HEUTE),
      },
      {
        code: "import { fetchAppointment } from './api';",
        filename: in_('src/features/calendar/appointments/a.ts'),
      },
    ],
    invalid: [
      {
        code: "import { hakenFehlt } from '@/features/calendar/appointments/haken';",
        filename: in_(HEUTE),
        errors: [{ messageId: 'tief' }],
      },
      {
        code: "export { fetchAppointment } from '@/features/calendar/appointments/api';",
        filename: in_('src/app/x.ts'),
        errors: [{ messageId: 'tief' }],
      },
      {
        code: "const seite = import('@/features/calendar/appointments/CalendarPage');",
        filename: in_(HEUTE),
        errors: [{ messageId: 'tief' }],
      },
    ],
  });
});

describe('gegenDieFolge (ANN-754)', () => {
  it('meldet außerhalb der Seiten einen Import in eine höhere Domäne', () => {
    expect(
      gegenDieFolge('src/features/patients/treatment-bases/x.ts', '@/features/billing/api'),
    ).toEqual({
      hoeher: 'billing',
      von: 'patients',
    });
    expect(gegenDieFolge('src/features/core/auth/x.ts', '../../teamchat/speicher')).toEqual({
      hoeher: 'teamchat',
      von: 'core',
    });
  });

  it('lässt Seiten, tiefere und dieselbe Domäne, das eigene Modul und src/lib durch', () => {
    const seite = 'src/features/patients/treatment-bases/PatientTreatmentBasesPage.tsx';
    expect(gegenDieFolge(seite, '@/features/billing/posNummern')).toBeNull();
    expect(
      gegenDieFolge('src/features/workforce/vacation/UrlaubSeite.tsx', '@/features/calendar/today'),
    ).toBeNull();
    expect(gegenDieFolge('src/features/billing/x.ts', '@/features/patients/api')).toBeNull();
    expect(
      gegenDieFolge('src/features/patients/files/x.ts', '@/features/patients/akte'),
    ).toBeNull();
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

  it('legt unter src/features genau die 14 Domänen mit ihren Modulen ab', () => {
    const ordner = (...pfad) =>
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- Ordner der Domänen im Repository.
      readdirSync(join(import.meta.dirname, '..', 'src', 'features', ...pfad), {
        withFileTypes: true,
      })
        .filter((eintrag) => eintrag.isDirectory())
        .map((eintrag) => eintrag.name);
    expect(EBENEN).toHaveLength(14);
    expect(ordner().sort()).toEqual([...EBENEN].sort());
    for (const [domaene, module] of Object.entries(DOMAENEN)) {
      const unter = ordner(domaene);
      // Ohne Modul an der Wurzel ist jeder Unterordner ein Modul der Domäne.
      if (!module.includes(domaene)) expect(unter.sort(), domaene).toEqual([...module].sort());
      else
        expect(
          module.filter((m) => m !== domaene && !unter.includes(m)),
          domaene,
        ).toEqual([]);
    }
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
        filename: in_('src/features/patients/treatment-bases/PatientTreatmentBasesPage.tsx'),
      },
      {
        code: "import { fetchPatient } from '@/features/patients/api';",
        filename: in_('src/features/billing/Rechnung.tsx'),
      },
    ],
    invalid: [
      {
        code: "import { fetchKatalogVersionen } from '@/features/billing/api';",
        filename: in_('src/features/patients/treatment-bases/posNummern.ts'),
        errors: [{ messageId: 'hoeher' }],
      },
      {
        code: "const speicher = import('@/features/teamchat/speicher');",
        filename: in_('src/features/core/auth/SessionProvider.tsx'),
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

describe('anDerSchnittstelleVorbei (ANN-755)', () => {
  const personal = 'src/features/workforce/staff/x.ts';

  it('meldet den Griff in eine fremde Domäne an ihrer index.ts vorbei', () => {
    expect(anDerSchnittstelleVorbei(personal, '@/features/calendar/appointments/api')).toEqual({
      domaene: 'calendar',
    });
    expect(anDerSchnittstelleVorbei(personal, '@/features/calendar/appointments')).toEqual({
      domaene: 'calendar',
    });
    expect(anDerSchnittstelleVorbei(personal, '../../patients/api')).toEqual({
      domaene: 'patients',
    });
    expect(
      anDerSchnittstelleVorbei('src/components/ui/x.ts', '@/features/core/session/types'),
    ).toEqual({
      domaene: 'core',
    });
  });

  it('meldet die eigene index.ts, die im Kreis zurückführte', () => {
    expect(
      anDerSchnittstelleVorbei('src/features/calendar/today/x.ts', '@/features/calendar'),
    ).toEqual({
      eigene: 'calendar',
    });
    expect(anDerSchnittstelleVorbei('src/features/patients/intake/x.ts', '../index')).toEqual({
      eigene: 'patients',
    });
  });

  it('lässt die Schnittstelle, die eigene Domäne und src/lib durch', () => {
    expect(anDerSchnittstelleVorbei(personal, '@/features/calendar')).toBeNull();
    expect(anDerSchnittstelleVorbei(personal, '@/features/calendar/index')).toBeNull();
    expect(anDerSchnittstelleVorbei(personal, '@/features/patients')).toBeNull();
    expect(
      anDerSchnittstelleVorbei('src/features/calendar/today/x.ts', '../appointments/api'),
    ).toBeNull();
    expect(
      anDerSchnittstelleVorbei('src/features/patients/intake/x.ts', '@/features/patients/api'),
    ).toBeNull();
    expect(anDerSchnittstelleVorbei(personal, '@/lib/datum')).toBeNull();
    expect(anDerSchnittstelleVorbei(personal, 'react')).toBeNull();
  });

  it('meldet auch eine fremde Seite: Seiten bindet nur der Router ein', () => {
    expect(
      anDerSchnittstelleVorbei(personal, '@/features/calendar/appointments/CalendarPage'),
    ).toEqual({ domaene: 'calendar' });
    expect(
      anDerSchnittstelleVorbei(
        'src/features/calendar/today/MyDayPage.tsx',
        '../appointments/CalendarPage',
      ),
    ).toBeNull();
  });

  it('überlässt die Wurzel einer Domäne der Schnittstelle, nicht der Regel für Module', () => {
    expect(tieferImport('src/features/patients/intake/x.ts', '@/features/patients/api')).toBeNull();
  });
});

describe('Regel nur-ueber-schnittstelle am Baum', () => {
  RuleTester.describe = describe;
  RuleTester.it = it;
  RuleTester.itOnly = it.only;
  const pruefer = new RuleTester({
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  });
  const in_ = (pfad) => join(import.meta.dirname, '..', pfad);

  pruefer.run('nur-ueber-schnittstelle', modulgrenzen.rules['nur-ueber-schnittstelle'], {
    valid: [
      {
        code: "import { fetchTerminTage } from '@/features/calendar';",
        filename: in_('src/features/workforce/vacation/UrlaubTerminePage.tsx'),
      },
      {
        code: "import { ArbeitszeitJePerson } from '@/features/calendar';",
        filename: in_('src/features/workforce/working-time/WorkingTimePage.tsx'),
      },
      {
        code: "import { hakenFehlt } from '../appointments';",
        filename: in_('src/features/calendar/today/x.ts'),
      },
    ],
    invalid: [
      {
        code: "import { CalendarPage } from '@/features/calendar/appointments/CalendarPage';",
        filename: in_('src/features/workforce/working-time/WorkingTimePage.tsx'),
        errors: [{ messageId: 'vorbei' }],
      },
      {
        code: "import { fetchTerminTage } from '@/features/calendar/appointments';",
        filename: in_('src/features/workforce/vacation/UrlaubTerminePage.tsx'),
        errors: [{ messageId: 'vorbei' }],
      },
      {
        code: "export { fullName } from '@/features/patients/api';",
        filename: in_('src/features/billing/x.ts'),
        errors: [{ messageId: 'vorbei' }],
      },
      {
        code: "const termine = import('@/features/calendar/appointments/api');",
        filename: in_('src/features/workforce/staff/x.ts'),
        errors: [{ messageId: 'vorbei' }],
      },
      {
        code: "import { hakenFehlt } from '@/features/calendar';",
        filename: in_('src/features/calendar/today/x.ts'),
        errors: [{ messageId: 'eigene' }],
      },
    ],
  });
});
