// Dieselbe Sitzungsprüfung wie beim Kartendienst, dort einmal geschrieben und getestet; dazu bleibt
// `verify_jwt` der Plattform, und Rolle und Organisation prüft die Datenbank (`datenbank.ts`).
export {
  erstelleSitzungspruefung,
  type Sitzungsergebnis,
  type Sitzungspruefung,
} from '../location-provider/sitzung.ts';
