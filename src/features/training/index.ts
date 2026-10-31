// Die Schnittstelle der Domäne training: Andere Domänen importieren nur, was hier einzeln steht.
// Seiten stehen nicht darin; src/routes und src/app binden direkt ein (ANN-755).

export { getTrainingClient } from './api';
