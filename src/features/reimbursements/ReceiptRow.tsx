import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Dateiansicht } from '@/features/files/Dateiansicht';
import { formatEuro } from '@/lib/geld';
import { loadReceipt, type Receipt } from './api';

/**
 * Die Belege eines Einkaufs (ANN-600): je ein Knopf mit Zweck und Betrag;
 * erst ein Tippen lädt den Beleg - in den Speicher der Seite, nicht auf das
 * Gerät, über eine einmalige Freigabe (ADR-017 Punkt 54 sinngemäß). Gezeigt
 * wird er wie eine Datei der Akte, ein PDF im eigenen Rahmen.
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
          const name = `Beleg: ${receipt.purpose}, ${formatEuro(receipt.amount_cents)}`;
          return (
            <Button
              key={receipt.id}
              type="button"
              variant="secondary"
              groesse="kompakt"
              disabled={load.isPending}
              aria-pressed={open?.id === receipt.id}
              // Der Name beginnt mit dem sichtbaren Wort (WCAG 2.5.3, UEB-10).
              aria-label={`${receipt.purpose}: Beleg über ${formatEuro(receipt.amount_cents)} ansehen`}
              onClick={() =>
                open?.id === receipt.id ? setOpen(null) : load.mutate({ id: receipt.id, name })
              }
            >
              {receipt.purpose}
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
