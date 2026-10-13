import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { Formularfuss } from '@/components/ui/Formularfuss';
import { Feldgruppe, Section } from '@/components/ui/Section';
import { Select } from '@/components/ui/Select';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Listenfehler, Rueckmeldung } from '@/components/ui/Rueckmeldung';
import {
  fetchVerguetungsmodell,
  setzeKalender,
  setzeVerguetungsmodell,
  verguetungsmodellLabels,
  type StaffMember,
  type Verguetungsmodell,
} from './api';

/**
 * Der Einsatz einer Person: im Kalender ohne eigenen Zugang (AKTE-009,
 * ANN-226) und ihr Vergütungsmodell (STA-005, ANN-157) - **ein** Formular mit
 * **einem** Speichern (Welle B, B7).
 *
 * Bis dahin standen beide als eigene Abschnitte mit eigenem Knopf da; ohne
 * Änderung waren das zwei gestrichelte Knöpfe untereinander. Die beiden
 * Vorgänge bleiben getrennt am Server: Speichern ruft nur, was sich geändert
 * hat - `set_staff_member_schedulable` für den Kalender,
 * `set_staff_compensation_model` für die Vergütung. Scheitert einer, sagt die
 * Meldung welcher; der andere ist dann schon gespeichert.
 *
 * Kalender: Es entsteht weder ein Zugang noch ein Kennwort noch eine Rolle;
 * anmelden kann sich die Person weiterhin nur über die Einladung. Vergütung:
 * Die Person wählt ihr Modell, owner trägt es hier ein; mit
 * „Umsatzbeteiligung" sieht sie unter Statistiken ihren eigenen Umsatz
 * (STA-006, ANN-156).
 *
 * Nur für owner gerendert; verbindlich prüft der Server.
 */
export function StaffEinsatz({ staff }: { staff: StaffMember }) {
  const queryClient = useQueryClient();
  const aktiv = staff.employment_status === 'active';
  const [behandlung, setBehandlung] = useState(staff.schedulable_treatment);
  const [training, setTraining] = useState(staff.schedulable_training);
  const [auswahl, setAuswahl] = useState<string | null>(null);
  const [meldung, setMeldung] = useState<{ text: string; nr: number } | null>(null);

  const modellSchluessel = ['staff-compensation', staff.id] as const;
  const modell = useQuery({
    queryKey: modellSchluessel,
    queryFn: () => fetchVerguetungsmodell(staff.id),
    retry: false,
  });

  const gespeichertesModell = modell.data ?? '';
  const wert = auswahl ?? gespeichertesModell;
  const kalenderGeaendert =
    behandlung !== staff.schedulable_treatment || training !== staff.schedulable_training;
  const modellGeaendert = modell.isSuccess && wert !== gespeichertesModell;

  const speichern = useMutation({
    mutationFn: async () => {
      if (kalenderGeaendert) {
        try {
          await setzeKalender(staff.id, { behandlung, training });
        } catch (fehler) {
          throw new Error(
            `Der Kalender wurde nicht gespeichert: ${fehler instanceof Error ? fehler.message : ''}`.trim(),
          );
        }
      }
      if (modellGeaendert) {
        try {
          await setzeVerguetungsmodell(staff.id, wert === '' ? null : (wert as Verguetungsmodell));
        } catch (fehler) {
          throw new Error(
            `Das Vergütungsmodell wurde nicht gespeichert: ${fehler instanceof Error ? fehler.message : ''}`.trim(),
          );
        }
      }
      return { kalender: kalenderGeaendert, modell: modellGeaendert };
    },
    onSuccess: async (geaendert) => {
      setMeldung((vorher) => ({
        text: geaendert.kalender || geaendert.modell ? 'Gespeichert.' : 'Nichts geändert.',
        nr: (vorher?.nr ?? 0) + 1,
      }));
      if (geaendert.modell) {
        setAuswahl(null);
        await queryClient.invalidateQueries({ queryKey: modellSchluessel });
      }
      if (geaendert.kalender) {
        // Alles, was die Auswahl der Behandelnden und Trainierenden zeigt.
        for (const queryKey of [
          ['staff-member', staff.id],
          ['staff-members'],
          ['assignable-therapists'],
          ['assignable-trainers'],
          ['calendar-staff'],
        ]) {
          await queryClient.invalidateQueries({ queryKey });
        }
      }
    },
  });

  function absenden(ereignis: FormEvent) {
    ereignis.preventDefault();
    if (speichern.isPending) return;
    setMeldung(null);
    speichern.mutate();
  }

  return (
    <form onSubmit={absenden} className="max-w-formular" noValidate>
      {/* Ein Satz, weil er die Eingabe ändert: Wer einen Zugang mit einer
          dieser Rollen hat, steht ohnehin im Kalender. */}
      <Section titel="Kalender" hinweis="Nur nötig, solange die Person keinen eigenen Zugang hat.">
        <Feldgruppe>
          <div className="flex flex-col gap-1">
            <Checkbox
              label="Im Kalender für Behandlungen"
              checked={behandlung}
              disabled={!aktiv || speichern.isPending}
              onChange={(e) => setBehandlung(e.target.checked)}
            />
            <Checkbox
              label="Im Kalender für Personal Training"
              checked={training}
              disabled={!aktiv || speichern.isPending}
              onChange={(e) => setTraining(e.target.checked)}
            />
          </div>
          {!aktiv ? (
            <Statusmeldung>
              Inaktiv – wird unabhängig davon nicht für neue Termine angeboten.
            </Statusmeldung>
          ) : null}
        </Feldgruppe>
      </Section>

      <Section titel="Vergütung">
        <Feldgruppe>
          <Select
            label="Vergütungsmodell"
            hint="Das Modell wählt die Person selbst."
            value={wert}
            disabled={!modell.isSuccess || speichern.isPending}
            onChange={(e) => setAuswahl(e.target.value)}
          >
            {modell.isPending ? (
              <option value="">Wird geladen …</option>
            ) : (
              <>
                <option value="">Nicht hinterlegt</option>
                <option value="fixed_salary">{verguetungsmodellLabels.fixed_salary}</option>
                <option value="revenue_share">{verguetungsmodellLabels.revenue_share}</option>
              </>
            )}
          </Select>
          {modell.isError ? (
            <Listenfehler
              text="Das Vergütungsmodell konnte nicht geladen werden."
              onErneut={() => void modell.refetch()}
            />
          ) : null}
        </Feldgruppe>
      </Section>

      <Formularfuss>
        <Button type="submit" disabled={speichern.isPending}>
          {speichern.isPending ? 'Wird gespeichert …' : 'Speichern'}
        </Button>
      </Formularfuss>

      {speichern.isError ? (
        <Statusmeldung ton="fehler" className="mt-3">
          {speichern.error.message}
        </Statusmeldung>
      ) : null}
      {meldung && !speichern.isError ? (
        <Rueckmeldung key={meldung.nr} className="mt-3">
          {meldung.text}
        </Rueckmeldung>
      ) : null}
    </form>
  );
}
