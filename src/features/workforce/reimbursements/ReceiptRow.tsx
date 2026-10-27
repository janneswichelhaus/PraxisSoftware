import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Dateiansicht } from '@/components/ui/Dateiansicht';
import { formatEuro } from '@/lib/geld';
import { loadReceipt, type Receipt } from './api';

/**
 * Die Belege eines Einkaufs (ANN-600): je ein Knopf mit Zweck und Betrag,
 * beides sichtbar (Design-Review Überholung 10); erst ein Tippen lädt den
 * Beleg - in den Speicher der Seite, nicht auf das Gerät, über eine
 * einmalige Freigabe (ADR-017 Punkt 54 sinngemäß). Gezeigt wird er wie eine
 * Datei der Akte, ein PDF im eigenen Rahmen.
 */
export function ReceiptRow({ receipts }: { receipts: readonly Receipt[] }) {
  const [open, setOpen] = useState<{ id: string; name: string; file: Blob } | null>(null);
  const load = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => ({
      id,
      name,
      file: await loadReceipt(id),
    }),
    onSuccess: (result) => setOpen(result),
  });

  if (receipts.length === 0) return null;
  return (
    <div className="pb-3">
      <div className="flex flex-wrap gap-2">
        {receipts.map((receipt) => {
          const amount = formatEuro(receipt.amount_cents);
          const name = `Beleg: ${receipt.purpose}, ${amount}`;
          return (
            <Button
              key={receipt.id}
              type="button"
              variant="secondary"
              groesse="kompakt"
              disabled={load.isPending}
              aria-pressed={open?.id === receipt.id}
              // Der Name beginnt mit dem sichtbaren Text (WCAG 2.5.3, UEB-10).
              aria-label={`${receipt.purpose}, ${amount}: Beleg ansehen`}
              onClick={() =>
                open?.id === receipt.id ? setOpen(null) : load.mutate({ id: receipt.id, name })
              }
            >
              {/* Ein Text, der als Ganzes umbricht; der Betrag bleibt beisammen. */}
              <span>
                {receipt.purpose}
                <span className="font-normal whitespace-nowrap tabular-nums">{`\u00a0· ${amount}`}</span>
              </span>
            </Button>
          );
        })}
      </div>
      {load.isError ? (
        <Statusmeldung ton="fehler" className="mt-2">
          {load.error.message}
        </Statusmeldung>
      ) : null}
      {open ? (
        <Dateiansicht bild={open.file} name={open.name} onSchliessen={() => setOpen(null)} />
      ) : null}
    </div>
  );
}
