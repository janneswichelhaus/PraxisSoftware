import { Field } from '@/components/ui/Field';
import { Select } from '@/components/ui/Select';
import type { Location } from '@/features/appointments/api';
import { Listenfehler } from '@/features/appointments/Rueckmeldungen';
import type { StaffFeld } from './api';
import { staffFeldId } from './mitarbeiterfelder';
import { Feldgruppe, Section } from '@/components/ui/Section';
import { Kleingedrucktes } from '@/components/ui/Kleingedrucktes';

/** Stand der Standortliste für die Auswahl des Hauptstandorts (ORG-14). */
export type StandorteStand = 'laedt' | 'fehler' | 'bereit';

/**
 * Eingabefelder der Mitarbeiterstammdaten.
 *
 * Anlegen und Ändern erfassen dieselben Felder; sie liegen deshalb an einer
 * Stelle. Absenden, Fehlerbanner und Navigation bleiben bei der jeweiligen
 * Seite.
 *
 * Die Privatangaben stehen bewusst in einem eigenen Abschnitt mit eigenem
 * Hinweis: sie liegen in einer eigenen Tabelle und sind nur für die
 * Praxisinhaber:in und die betroffene Person lesbar
 * (PROJECT_PRINCIPLES.md 20).
 *
 * Für eine Rolle ohne diesen Zugriff - seit E10 kann das Office Stammdaten
 * pflegen - entfällt der Abschnitt vollständig. Er wird nicht mit leeren
 * Feldern gezeigt: die Werte kommen gar nicht erst an, und ein Speichern
 * dürfte sie nicht löschen (ANN-024, PROJECT_PRINCIPLES.md 4.7).
 *
 * **Ohne Standortliste keine stille Leere (ORG-14).** Bis UXR-011 bot die
 * Auswahl nach einem Ladefehler nur „kein fester Standort" an - als wäre das
 * die ganze Wahl. Jetzt steht im Feld, dass die Liste lädt oder fehlt, ein
 * gespeicherter Standort bleibt als Auswahl stehen, und darunter steht der Weg,
 * es noch einmal zu versuchen.
 */
export function StaffMasterDataFields({
  werte,
  fehler,
  standorte,
  standorteStand = 'bereit',
  bisherigerStandort = null,
  onStandorteErneut,
  privat,
  onChange,
}: {
  werte: Record<StaffFeld, string>;
  fehler: Partial<Record<StaffFeld, string>>;
  standorte: readonly Location[];
  standorteStand?: StandorteStand;
  /** Name des gespeicherten Hauptstandorts, falls die Liste ihn nicht enthält. */
  bisherigerStandort?: string | null;
  onStandorteErneut?: () => void;
  privat: boolean;
  onChange: (feld: StaffFeld, wert: string) => void;
}) {
  const gewaehlt = werte.primary_location_id;
  const fehltInListe = gewaehlt !== '' && !standorte.some((standort) => standort.id === gewaehlt);

  return (
    <>
      <Section titel="Person">
        <Feldgruppe>
          <Field
            label="Vorname *"
            name="given_name"
            feldId={staffFeldId('given_name')}
            autoComplete="off"
            required
            value={werte.given_name}
            error={fehler.given_name}
            onChange={(event) => onChange('given_name', event.target.value)}
          />
          <Field
            label="Nachname *"
            name="family_name"
            feldId={staffFeldId('family_name')}
            autoComplete="off"
            required
            value={werte.family_name}
            error={fehler.family_name}
            onChange={(event) => onChange('family_name', event.target.value)}
          />
        </Feldgruppe>
      </Section>

      <Section
        titel="Dienstlich"
        hinweis="Für alle Praxisrollen sichtbar – für Vertretung, Rückfragen und Einsatzplanung."
      >
        <Feldgruppe>
          <Field
            label="Dienstliche E-Mail"
            name="work_email"
            feldId={staffFeldId('work_email')}
            type="email"
            autoComplete="off"
            value={werte.work_email}
            error={fehler.work_email}
            onChange={(event) => onChange('work_email', event.target.value)}
          />
          <Field
            label="Diensttelefon"
            name="work_phone"
            feldId={staffFeldId('work_phone')}
            type="tel"
            autoComplete="off"
            value={werte.work_phone}
            error={fehler.work_phone}
            onChange={(event) => onChange('work_phone', event.target.value)}
          />
          <div className="flex flex-col gap-2">
            <Select
              label="Hauptstandort"
              name="primary_location_id"
              feldId={staffFeldId('primary_location_id')}
              value={gewaehlt}
              disabled={standorteStand === 'laedt'}
              error={fehler.primary_location_id}
              onChange={(event) => onChange('primary_location_id', event.target.value)}
            >
              {standorteStand === 'laedt' ? (
                // Solange die Liste lädt, steht genau das im Feld - und nicht
                // „Kein fester Standort". Der Wert bleibt der gespeicherte.
                <option value={gewaehlt}>Wird geladen …</option>
              ) : (
                <>
                  <option value="">Kein fester Standort</option>
                  {fehltInListe && bisherigerStandort ? (
                    <option value={gewaehlt}>{bisherigerStandort}</option>
                  ) : null}
                  {standorte.map((standort) => (
                    <option key={standort.id} value={standort.id}>
                      {standort.name}
                    </option>
                  ))}
                </>
              )}
            </Select>
            {standorteStand === 'fehler' ? (
              <Listenfehler
                text={
                  fehltInListe && bisherigerStandort
                    ? 'Die Standorte konnten nicht geladen werden – der bisherige Hauptstandort bleibt erhalten.'
                    : 'Die Standorte konnten nicht geladen werden.'
                }
                onErneut={() => onStandorteErneut?.()}
              />
            ) : null}
          </div>
        </Feldgruppe>
      </Section>

      {!privat ? (
        <Kleingedrucktes className="mt-6">
          Die Privatangaben (Geburtsdatum, private Erreichbarkeit, Privatanschrift) pflegt
          ausschließlich die Praxisinhaber:in. Sie bleiben beim Speichern unverändert.
        </Kleingedrucktes>
      ) : null}

      {privat ? (
        <Section
          titel="Privat"
          hinweis="Beschäftigtendaten. Nur für die Praxisinhaber:in und die betroffene Person sichtbar; alle Angaben sind freiwillig."
        >
          <Feldgruppe>
            <Field
              label="Geburtsdatum"
              name="date_of_birth"
              feldId={staffFeldId('date_of_birth')}
              type="date"
              value={werte.date_of_birth}
              error={fehler.date_of_birth}
              onChange={(event) => onChange('date_of_birth', event.target.value)}
            />
            <Field
              label="Private E-Mail"
              name="private_email"
              feldId={staffFeldId('private_email')}
              type="email"
              autoComplete="off"
              value={werte.private_email}
              error={fehler.private_email}
              onChange={(event) => onChange('private_email', event.target.value)}
            />
            <Field
              label="Privattelefon"
              name="private_phone"
              feldId={staffFeldId('private_phone')}
              type="tel"
              autoComplete="off"
              value={werte.private_phone}
              error={fehler.private_phone}
              onChange={(event) => onChange('private_phone', event.target.value)}
            />
            <Field
              label="Straße und Hausnummer"
              name="street"
              feldId={staffFeldId('street')}
              autoComplete="off"
              value={werte.street}
              error={fehler.street}
              onChange={(event) => onChange('street', event.target.value)}
            />
            <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
              <Field
                label="PLZ"
                name="postal_code"
                feldId={staffFeldId('postal_code')}
                inputMode="numeric"
                autoComplete="off"
                value={werte.postal_code}
                error={fehler.postal_code}
                onChange={(event) => onChange('postal_code', event.target.value)}
              />
              <Field
                label="Ort"
                name="city"
                feldId={staffFeldId('city')}
                autoComplete="off"
                value={werte.city}
                error={fehler.city}
                onChange={(event) => onChange('city', event.target.value)}
              />
            </div>
          </Feldgruppe>
        </Section>
      ) : null}
    </>
  );
}
