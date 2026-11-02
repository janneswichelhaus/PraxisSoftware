// Dieselbe Sitzungsprüfung wie beim Kartendienst, dort einmal geschrieben und getestet; dazu bleibt
// `verify_jwt` der Plattform, und die Rolle prüft die Datenbank (`kasse.ts`).
export {
  erstelleSitzungspruefung,
  type Sitzungsergebnis,
  type Sitzungspruefung,
} from '../location-provider/sitzung.ts';
