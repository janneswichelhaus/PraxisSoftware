/**
 * Die 14 Domänen unter src/features und ihre Module (Tiefenanalyse 1a.5), in der Folge von unten
 * nach oben (ANN-754). Ein Modul mit dem Namen seiner Domäne liegt an deren Wurzel.
 */
export const DOMAENEN = {
  core: ['session', 'auth', 'preview'],
  patients: ['patients', 'treatment-bases', 'files', 'intake', 'training-offers'],
  privacy: ['datenschutz', 'retention', 'audit'],
  fleet: ['fleet'],
  billing: ['billing', 'statistics'],
  workforce: ['staff', 'vacation', 'working-time', 'timeaccount', 'reimbursements'],
  calendar: [
    'appointments',
    'scheduling',
    'slot-search',
    'waitlist',
    'territories',
    'tours',
    'today',
    'day-plan',
  ],
  clinical: ['documentation', 'offline-documentation', 'assessments', 'therapy-reports'],
  nutrition: ['nutrition'],
  exercise: ['exercises', 'exercise-plans', 'checkins'],
  portal: ['platform', 'platform-access', 'messages'],
  training: ['training'],
  workplace: ['open-points', 'organisation', 'feedback', 'practice-settings', 'account'],
  teamchat: ['teamchat'],
};

export const EBENEN = Object.keys(DOMAENEN);

const MODULE = new Map(Object.entries(DOMAENEN));

/** Domäne, Modul und Pfad darin für einen Pfad unter src/features, sonst `null`. */
export function ortIn(pfad) {
  if (!pfad.startsWith('src/features/')) return null;
  const [domaene, ...weiter] = pfad.slice('src/features/'.length).split('/');
  if (!domaene) return null;
  const [kopf = '', ...rest] = weiter;
  if (kopf !== domaene && MODULE.get(domaene)?.includes(kopf)) {
    return { domaene, modul: kopf, rest: rest.join('/') };
  }
  return { domaene, modul: domaene, rest: weiter.join('/') };
}
