import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Section } from '@/components/ui/Section';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/Feedback';
import {
  fetchVerguetungsmodell,
  setzeVerguetungsmodell,
  verguetungsmodellLabels,
  type StaffMember,
  type Verguetungsmodell,
} from './api';

/**
 * Vergütungsmodell einer Person (STA-005, ANN-157).
 *
 * Nur für owner gerendert; verbindlich prüft der Server. Die Person wählt ihr
 * Modell, owner trägt es hier ein. Mit „Umsatzbeteiligung" sieht sie unter
 * Statistiken ihren eigenen Umsatz (STA-006, ANN-156).
 */
export function StaffCompensationSection({ staff }: { staff: StaffMember }) {
  const queryClient = useQueryClient();
  const schluessel = ['staff-compensation', staff.id] as const;
  const modell = useQuery({
    queryKey: schluessel,
    queryFn: () => fetchVerguetungsmodell(staff.id),
    retry: false,
  });
  const [auswahl, setAuswahl] = useState<string | null>(null);

  const speichern = useMutation({
    mutationFn: (wert: Verguetungsmodell | null) => setzeVerguetungsmodell(staff.id, wert),
    onSuccess: () => {
      setAuswahl(null);
      return queryClient.invalidateQueries({ queryKey: schluessel });
    },
  });

  if (modell.isError) {
    return (
      <Section titel="Vergütung" rahmen>
        <ErrorState
          title="Das Vergütungsmodell konnte nicht geladen werden."
          onErneut={() => modell.refetch()}
        />
      </Section>
    );
  }
  if (!modell.isSuccess) return null;

  const wert = auswahl ?? modell.data ?? '';

  function absenden(ereignis: FormEvent) {
    ereignis.preventDefault();
    speichern.mutate(wert === '' ? null : (wert as Verguetungsmodell));
  }

  return (
    // Nur der erste Satzteil des Hinweises: Der Rest erklärte das System (UX-005i).
    <Section titel="Vergütung" rahmen hinweis="Das Modell wählt die Person selbst.">
      <form onSubmit={absenden} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="sm:w-72">
          <Select
            label="Vergütungsmodell"
            value={wert}
            onChange={(e) => setAuswahl(e.target.value)}
          >
            <option value="">Nicht hinterlegt</option>
            <option value="fixed_salary">{verguetungsmodellLabels.fixed_salary}</option>
            <option value="revenue_share">{verguetungsmodellLabels.revenue_share}</option>
          </Select>
        </div>
        <div>
          <Button
            type="submit"
            variant="secondary"
            disabled={speichern.isPending || wert === (modell.data ?? '')}
          >
            {speichern.isPending ? 'Wird gespeichert …' : 'Speichern'}
          </Button>
        </div>
      </form>
      {speichern.isError ? (
        <p role="alert" className="text-danger mt-2 text-sm">
          {speichern.error.message}
        </p>
      ) : null}
      {speichern.isSuccess ? (
        <p role="status" className="text-ink-muted mt-2 text-sm">
          Gespeichert.
        </p>
      ) : null}
    </Section>
  );
}
