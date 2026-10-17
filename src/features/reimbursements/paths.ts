/**
 * Wege der Erstattungen (ERS-001), geteilt von Übersicht, Beantragen,
 * Entscheiden, Auszahlen und Konto. In der Adresse nur Kennungen (ADR-011).
 */

export const REIMBURSEMENTS_HOME = '/betrieb/erstattungen';
export const PERSON_PARAM = 'person';

export const REQUEST_PATH = `${REIMBURSEMENTS_HOME}/beantragen`;
export const ACCOUNT_PATH = `${REIMBURSEMENTS_HOME}/konto`;

/** Ladestrom eines Monats beantragen, Monat vorgewählt (ORG-008) - `month` als `YYYY-MM-01`. */
export function requestElectricityPath(month: string): string {
  return `${REQUEST_PATH}?monat=${month}`;
}

export function decidePath(reimbursementId: string): string {
  return `${REIMBURSEMENTS_HOME}/entscheiden/${reimbursementId}`;
}

export function payPath(reimbursementId: string): string {
  return `${REIMBURSEMENTS_HOME}/auszahlen/${reimbursementId}`;
}

/** Die Erstattungen einer Person auf derselben Seite (owner und Büro). */
export function personPath(staffMemberId: string | null): string {
  return staffMemberId
    ? `${REIMBURSEMENTS_HOME}?${PERSON_PARAM}=${staffMemberId}`
    : REIMBURSEMENTS_HOME;
}

const DATE = new Intl.DateTimeFormat('de-DE', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'Europe/Berlin',
});

/** „14. Okt. 2026“ für einen Zeitpunkt, in der Zeitzone der Praxis. */
export function dateOf(timestamp: string, timeZone = 'Europe/Berlin'): string {
  return timeZone === 'Europe/Berlin'
    ? DATE.format(new Date(timestamp))
    : new Intl.DateTimeFormat('de-DE', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone,
      }).format(new Date(timestamp));
}
