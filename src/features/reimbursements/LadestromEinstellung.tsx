import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Formularfuss } from '@/components/ui/Formularfuss';
import { Kleingedrucktes } from '@/components/ui/Kleingedrucktes';
import { Listenfehler } from '@/components/ui/Rueckmeldung';
import { Section } from '@/components/ui/Section';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { formatEuro } from '@/lib/geld';
import {
  ELECTRICITY_SETTINGS_KEY,
  REIMBURSEMENTS_KEY,
  fetchElectricitySettings,
  saveElectricitySettings,
  type ElectricitySettings,
} from './api';
import { electricityCentsFromMinutes, electricityHoursFormula } from './rules';

/** Die drei Werte mit ihren Grenzen - dieselben wie `set_electricity_settings`. */
const FELDER = [
  { key: 'centsPerKwh', label: 'Strompreis in ct je kWh', min: 1, max: 200 },
  { key: 'whPerKm', label: 'Verbrauch bei höchster Stufe in Wh je km', min: 1, max: 100 },
  { key: 'kmPerHour', label: 'Strecke je Arbeitsstunde in km', min: 1, max: 30 },
] as const satisfies readonly {
  key: keyof ElectricitySettings;
  label: string;
  min: number;
  max: number;
}[];

type Eingabe = Record<keyof ElectricitySettings, string>;

/** Ein Monat mit 160 geplanten Stunden - das Beispiel unter den Feldern. */
const BEISPIEL_MINUTEN = 160 * 60;

function alsZahl(text: string): number | null {
  return /^\d{1,3}$/.test(text.trim()) ? Number(text.trim()) : null;
}

/**
 * Ladestrom der Praxis (ORG-008): Strompreis, Verbrauch des Lastenrads bei
 * höchster Unterstützungsstufe und Strecke je Arbeitsstunde. Daraus und aus
 * den geplanten Arbeitsstunden rechnet der Server den Ladestrom jeder Person
 * (geplante Stunden × km × Wh/km × ct). Die Strecke ist ein Pauschalwert der
 * Praxis, kein Messwert einer Person (PROJECT_PRINCIPLES.md 20).
 *
 * Nur owner, verbindlich prüft `set_electricity_settings`. Ohne geladene
 * Werte keine Eingabe - sonst überschriebe ein Tipp die unbekannten Werte
 * der Praxis (wie Fahrzeitfaktor und Frist, ORG-14). Gestellte Anträge
 * behalten ihre Werte.
 */
export function LadestromEinstellung() {
  const queryClient = useQueryClient();
  const werte = useQuery({
    queryKey: ELECTRICITY_SETTINGS_KEY,
    queryFn: fetchElectricitySettings,
    retry: false,
  });
  const [eingabe, setEingabe] = useState<Eingabe>({ centsPerKwh: '', whPerKm: '', kmPerHour: '' });
  const [gespeichert, setGespeichert] = useState(false);

  useEffect(() => {
    if (werte.data) {
      setEingabe({
        centsPerKwh: String(werte.data.centsPerKwh),
        whPerKm: String(werte.data.whPerKm),
        kmPerHour: String(werte.data.kmPerHour),
      });
    }
  }, [werte.data]);

  const zahlen = {
    centsPerKwh: alsZahl(eingabe.centsPerKwh),
    whPerKm: alsZahl(eingabe.whPerKm),
    kmPerHour: alsZahl(eingabe.kmPerHour),
  };
  const fehler = (feld: (typeof FELDER)[number]) => {
    const zahl = zahlen[feld.key];
    return zahl === null || zahl < feld.min || zahl > feld.max
      ? `Eine ganze Zahl von ${feld.min} bis ${feld.max}`
      : undefined;
  };
  const gueltig = FELDER.every((feld) => fehler(feld) === undefined);
  const geladen = werte.data !== undefined;

  const mutation = useMutation({
    mutationFn: () =>
      saveElectricitySettings({
        centsPerKwh: zahlen.centsPerKwh!,
        whPerKm: zahlen.whPerKm!,
        kmPerHour: zahlen.kmPerHour!,
      }),
    onSuccess: () => {
      setGespeichert(true);
      void queryClient.invalidateQueries({ queryKey: ELECTRICITY_SETTINGS_KEY });
      // Vorschläge im Eingang rechnen mit den neuen Werten.
      void queryClient.invalidateQueries({ queryKey: REIMBURSEMENTS_KEY });
    },
  });

  return (
    <Section titel="Ladestrom">
      <div className="max-w-formular space-y-4">
        {FELDER.map((feld) => (
          <Field
            key={feld.key}
            label={feld.label}
            inputMode="numeric"
            autoComplete="off"
            disabled={!geladen}
            placeholder={geladen ? undefined : werte.isError ? 'Nicht geladen' : 'Wird geladen …'}
            value={eingabe[feld.key]}
            error={geladen && eingabe[feld.key] !== '' ? fehler(feld) : undefined}
            onChange={(e) => {
              const text = e.target.value.replace(/\D/g, '').slice(0, 3);
              setEingabe((alt) => ({ ...alt, [feld.key]: text }));
              setGespeichert(false);
            }}
          />
        ))}
        {gueltig ? (
          <Kleingedrucktes>
            {`Bei 160 geplanten Stunden: ${electricityHoursFormula(
              BEISPIEL_MINUTEN,
              zahlen.kmPerHour!,
              zahlen.whPerKm!,
              zahlen.centsPerKwh!,
            )} = ${formatEuro(
              electricityCentsFromMinutes(
                BEISPIEL_MINUTEN,
                zahlen.kmPerHour!,
                zahlen.whPerKm!,
                zahlen.centsPerKwh!,
              ),
            )}. Gilt für neue Anträge; gestellte behalten ihre Werte.`}
          </Kleingedrucktes>
        ) : null}
      </div>

      {werte.isError && !geladen ? (
        <div className="mt-3">
          <Listenfehler
            text="Die Werte für den Ladestrom konnten nicht geladen werden. Bis dahin lassen sie sich nicht ändern."
            onErneut={() => void werte.refetch()}
          />
        </div>
      ) : null}

      {mutation.isError ? (
        <Statusmeldung ton="fehler" className="mt-3">
          {mutation.error.message} Bitte die Verbindung prüfen und erneut speichern.
        </Statusmeldung>
      ) : null}
      {gespeichert && !mutation.isPending && !mutation.isError ? (
        <Statusmeldung ton="erfolg" className="mt-3">
          Die Werte für den Ladestrom sind gespeichert.
        </Statusmeldung>
      ) : null}

      <Formularfuss>
        <Button
          type="button"
          disabled={mutation.isPending || !geladen || !gueltig}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? 'Wird gespeichert …' : 'Ladestrom speichern'}
        </Button>
      </Formularfuss>
    </Section>
  );
}
