import { useQuery } from '@tanstack/react-query';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { formatDate } from '@/lib/datum';
import { checkTerritoryDays, dayPartsText } from './api';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Hinweis Gebietstag am Hausbesuch (PRX-002).
 *
 * Fragt den Server, ob die Termine im Gebietstag der Adresse liegen, und
 * meldet nur, was außerhalb liegt — als Warnung, die nichts sperrt
 * (IDEA-PRX-031). Ohne Gebiet für die Postleitzahl bleibt er stumm; ein
 * Fehler beim Prüfen ist kein Hindernis für den Termin und wird deshalb nur
 * leise genannt.
 */
export function TerritoryHint({
  postalCode,
  slots,
}: {
  postalCode: string | null;
  slots: readonly { datum: string; beginn: string }[];
}) {
  const valid = slots.filter((s) => DATE.test(s.datum) && TIME.test(s.beginn));
  const enabled = Boolean(postalCode) && valid.length > 0;

  const { data, isError } = useQuery({
    queryKey: ['territory-check', postalCode, valid],
    queryFn: () => checkTerritoryDays(postalCode!, valid),
    enabled,
    retry: false,
    staleTime: 30_000,
  });

  if (!enabled) return null;
  if (isError) {
    return (
      <p className="text-ink-muted mt-2 text-sm">Der Gebietstag konnte nicht geprüft werden.</p>
    );
  }
  const outside = (data ?? []).filter((c) => c.status === 'outside');
  if (outside.length === 0) return null;

  const first = outside[0]!;
  const rule = `Die Postleitzahl ${postalCode} gehört zum Gebiet ${first.territory_name ?? ''} (${dayPartsText(first.day_parts ?? [])}).`;

  if (valid.length === 1) {
    return (
      <Statusmeldung ton="warnung" className="mt-3">
        Außerhalb des Gebietstags. {rule} Der Termin lässt sich trotzdem anlegen.
      </Statusmeldung>
    );
  }

  const dates = outside.map((c) => formatDate(valid[c.slot_index]?.datum ?? null)).join(', ');
  return (
    <Statusmeldung ton="warnung" className="mt-3">
      {outside.length} von {valid.length} Terminen liegen außerhalb des Gebietstags: {dates}. {rule}
    </Statusmeldung>
  );
}
