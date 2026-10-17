import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Formularfuss } from '@/components/ui/Formularfuss';
import { Kleingedrucktes } from '@/components/ui/Kleingedrucktes';
import { PageHeader } from '@/components/ui/PageHeader';
import { Listenfehler } from '@/components/ui/Rueckmeldung';
import { Section } from '@/components/ui/Section';
import { Select } from '@/components/ui/Select';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import {
  FRIST_VOREINSTELLUNG,
  FRIST_WERTE,
  fetchDocumentationDeadline,
  fristLabel,
  saveDocumentationDeadline,
} from '@/features/documentation/api';
import { BenachrichtigungsSchalter } from '@/features/platform-access/BenachrichtigungsSchalter';
import { LadestromEinstellung } from '@/features/reimbursements/LadestromEinstellung';
import {
  RASTER_WERTE,
  istRasterWert,
  saveAppointmentGrid,
  type RasterWert,
} from '@/features/scheduling/api';
import type { CurrentUser } from '@/features/session/types';
import { FahrzeitfaktorEinstellung } from '@/features/tours/FahrzeitfaktorEinstellung';
import { GarageEinstellung, StartortEinstellung } from '@/features/tours/StartortEinstellung';

/**
 * Die Einstellungen der Praxis (ORG-002, ANN-604) - nur für owner.
 *
 * Bis ORG-002 standen sie eingeklappt unter „Arbeitszeiten", am Telefon rund
 * 2.400 px tief: Raster, Frist, Startort, Garage, Fahrzeitfaktor und die
 * Benachrichtigungen an Patient:innen hatten mit Arbeitszeit nichts zu tun.
 * Jetzt sind sie die erste Ansicht unter Praxis: Termine und Dokumentation,
 * Touren, Ladestrom (ORG-008), Benachrichtigungen. Die Formulare selbst sind unverändert;
 * verbindlich prüft der Server (ADR-004).
 */
export function PraxisEinstellungenPage({ user }: { user: CurrentUser }) {
  return (
    <>
      <PageHeader title="Einstellungen" />
      <RasterEinstellung aktuell={user.appointmentGridMinutes} />
      <FristEinstellung organizationId={user.profile.organization_id} />

      <div className="mt-10 space-y-8">
        <StartortEinstellung />
        {/* UBK-015: Beginn und Ende der Tour, getrennt vom Ort der Praxistermine. */}
        <GarageEinstellung />
        {/* UBK-010: neben dem Startort - beides bestimmt die Fahrzeiten. */}
        <FahrzeitfaktorEinstellung />
      </div>

      <div className="mt-10 space-y-8">
        {/* ORG-008: Strompreis, Verbrauch und Strecke je Stunde für den Ladestrom. */}
        <LadestromEinstellung />
      </div>

      <div className="mt-10 space-y-8">
        {/* KOM-011: Arten der Benachrichtigung für alle abschalten (ADR-024 Punkt 15). */}
        <BenachrichtigungsSchalter />
      </div>
    </>
  );
}

/** Was nach einem gescheiterten Speichern zu tun ist (WRT-01). */
const ERNEUT_SPEICHERN = 'Bitte die Verbindung prüfen und erneut speichern.';

// -----------------------------------------------------------------------------
// Praxisraster
// -----------------------------------------------------------------------------

function RasterEinstellung({ aktuell }: { aktuell: number | null }) {
  const queryClient = useQueryClient();
  const [wert, setWert] = useState<RasterWert>(istRasterWert(aktuell) ? aktuell : 5);
  const [gespeichert, setGespeichert] = useState(false);

  useEffect(() => {
    if (istRasterWert(aktuell)) setWert(aktuell);
  }, [aktuell]);

  const mutation = useMutation({
    mutationFn: () => saveAppointmentGrid(wert),
    onSuccess: () => {
      setGespeichert(true);
      // Das Raster steckt in den Sitzungsdaten und steuert die Eingabefelder.
      // Die Meldung wartet nicht auf das Nachladen (ZST-B01): Gespeichert ist
      // es, sobald der Server es bestätigt.
      void queryClient.invalidateQueries({ queryKey: ['current-user'] });
    },
  });

  return (
    // Kein Erklärsatz unter dem Titel (DESIGN.md Regel 6); was eine Änderung
    // bewirkt, steht knapp als Kleingedrucktes am Feld.
    <Section titel="Praxisraster">
      <div className="max-w-formular">
        <Select
          label="Minutenraster"
          value={String(wert)}
          onChange={(e) => {
            const gewaehlt = Number(e.target.value);
            if (istRasterWert(gewaehlt)) setWert(gewaehlt);
            setGespeichert(false);
          }}
        >
          {RASTER_WERTE.map((m) => (
            <option key={m} value={m}>
              {m} Minuten
            </option>
          ))}
        </Select>
        <Kleingedrucktes className="mt-2">
          Gilt für die ganze Praxis. Bestehende Termine außerhalb des Rasters bleiben erhalten.
        </Kleingedrucktes>
      </div>

      {mutation.isError ? (
        <Statusmeldung ton="fehler" className="mt-3">
          {mutation.error.message} {ERNEUT_SPEICHERN}
        </Statusmeldung>
      ) : null}
      {gespeichert && !mutation.isPending && !mutation.isError ? (
        <Statusmeldung ton="erfolg" className="mt-3">
          Das Praxisraster ist gespeichert.
        </Statusmeldung>
      ) : null}

      <Formularfuss>
        <Button type="button" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
          {mutation.isPending ? 'Wird gespeichert …' : 'Raster speichern'}
        </Button>
      </Formularfuss>
    </Section>
  );
}

// -----------------------------------------------------------------------------
// Frist der automatischen Finalisierung (DOK-004)
// -----------------------------------------------------------------------------

/**
 * Die Frist steht neben dem Praxisraster, weil beides Grundeinstellungen der
 * Praxis sind, die nur owner setzt (PROJECT_PRINCIPLES.md 4.1). Verbindlich
 * prüft `set_documentation_deadline`.
 *
 * **Ohne geladene Frist keine Auswahl (ORG-14, ZST-09).** Bis UXR-011 zeigte
 * das Feld nach einem Ladefehler die Voreinstellung, und „Frist speichern"
 * blieb bedienbar - ein Tipp hätte die unbekannte Frist der Praxis mit der
 * Voreinstellung überschrieben. Solange der Wert fehlt, sagt das Feld das und
 * ist gesperrt.
 */
function FristEinstellung({ organizationId }: { organizationId: string }) {
  const queryClient = useQueryClient();
  const [wert, setWert] = useState<number>(FRIST_VOREINSTELLUNG);
  const [gespeichert, setGespeichert] = useState(false);

  const frist = useQuery({
    queryKey: ['documentation-deadline', organizationId],
    queryFn: () => fetchDocumentationDeadline(organizationId),
    retry: false,
  });

  useEffect(() => {
    if (frist.data !== undefined) setWert(frist.data);
  }, [frist.data]);

  const mutation = useMutation({
    mutationFn: () => saveDocumentationDeadline(wert),
    onSuccess: () => {
      setGespeichert(true);
      void queryClient.invalidateQueries({ queryKey: ['documentation-deadline'] });
    },
  });

  const geladen = frist.data !== undefined;

  // Ein gespeicherter Wert außerhalb der Stufen bleibt sichtbar und wählbar.
  const werte = FRIST_WERTE.includes(wert as (typeof FRIST_WERTE)[number])
    ? [...FRIST_WERTE]
    : [...FRIST_WERTE, wert].sort((a, b) => a - b);

  return (
    // Was die Frist bewirkt, trägt Rechtsfunktion (ADR-016: Finalisierung
    // macht den Entwurf zum Bestandteil der Akte) - deshalb bleibt der Satz,
    // als Kleingedrucktes am Feld statt als Erklärsatz unter dem Titel.
    <Section titel="Automatische Finalisierung">
      <div className="max-w-formular">
        <Select
          label="Frist"
          value={String(wert)}
          disabled={!geladen}
          onChange={(e) => {
            setWert(Number(e.target.value));
            setGespeichert(false);
          }}
        >
          {geladen ? (
            werte.map((tage) => (
              <option key={tage} value={tage}>
                {fristLabel(tage)}
              </option>
            ))
          ) : (
            // Solange die Frist fehlt, steht genau das im Feld - und nicht
            // die Voreinstellung, die wie der Wert der Praxis aussähe.
            <option value={wert}>{frist.isError ? 'Nicht geladen' : 'Wird geladen …'}</option>
          )}
        </Select>
        <Kleingedrucktes className="mt-2">
          Ein Entwurf der Behandlungsdokumentation wird nach Ablauf dieser Frist automatisch
          finalisiert und ist ab dann Bestandteil der Akte. Die Frist zählt in Kalendertagen der
          Praxiszeitzone ab dem Behandlungstag; später angelegte Einträge und Nachträge bekommen sie
          ab ihrer Anlage.
        </Kleingedrucktes>
      </div>

      {frist.isError && !geladen ? (
        <div className="mt-3">
          <Listenfehler
            text="Die Dokumentationsfrist konnte nicht geladen werden. Bis dahin lässt sie sich nicht ändern."
            onErneut={() => void frist.refetch()}
          />
        </div>
      ) : null}

      {mutation.isError ? (
        <Statusmeldung ton="fehler" className="mt-3">
          {mutation.error.message} {ERNEUT_SPEICHERN}
        </Statusmeldung>
      ) : null}
      {gespeichert && !mutation.isPending && !mutation.isError ? (
        <Statusmeldung ton="erfolg" className="mt-3">
          Die Frist ist gespeichert.
        </Statusmeldung>
      ) : null}

      <Formularfuss>
        <Button
          type="button"
          disabled={mutation.isPending || !geladen}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? 'Wird gespeichert …' : 'Frist speichern'}
        </Button>
      </Formularfuss>
    </Section>
  );
}
