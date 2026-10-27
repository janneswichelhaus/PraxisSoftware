// Die Schnittstelle der Domäne workplace: Andere Domänen importieren nur, was hier einzeln steht.
// Seiten stehen nicht darin; src/routes und src/app binden direkt ein (ANN-755).

export { useBarometerHinweise } from './feedback/barometerHinweis';
export { OpenPointsSummary } from './open-points/OpenPointsSummary';
export { fetchPlatformRequests, PLATFORM_REQUESTS_KEY } from './open-points/platform-requests-api';
export { createTask, TASKS_KEY } from './open-points/tasks-api';
