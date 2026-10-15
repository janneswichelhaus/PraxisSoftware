import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Dateiansicht } from '@/features/files/Dateiansicht';
import { FLOTTE_SCHLUESSEL, deleteFleetPhoto, loadFleetPhoto, type FleetPhoto } from './api';

/**
 * Die Fotos einer Stelle oder eines Check-Ups (ANN-547): je ein Knopf
 * „Foto 1“, „Foto 2“; erst ein Tippen lädt das Bild - in den Speicher der
 * Seite, nicht auf das Gerät, über eine einmalige Freigabe (ADR-017 Punkt 54
 * sinngemäß). Löschen darf, wer es aufgenommen hat (am selben Tag), und die
 * Praxisinhaber:in; der Server entscheidet (`may_delete`).
 */
export function Fotoreihe({ fotos, bezug }: { fotos: readonly FleetPhoto[]; bezug: string }) {
  const queryClient = useQueryClient();
  const [offen, setOffen] = useState<{ id: string; nummer: number; bild: Blob } | null>(null);

  const laden = useMutation({
    mutationFn: async ({ id, nummer }: { id: string; nummer: number }) => ({
      id,
      nummer,
      bild: await loadFleetPhoto(id),
    }),
    onSuccess: (ergebnis) => setOffen(ergebnis),
  });

  const loeschen = useMutation({
    mutationFn: (id: string) => deleteFleetPhoto(id),
    onSuccess: async () => {
      setOffen(null);
      await queryClient.invalidateQueries({ queryKey: FLOTTE_SCHLUESSEL });
    },
  });

  if (fotos.length === 0) return null;
  const offenesFoto = offen ? fotos.find((foto) => foto.id === offen.id) : undefined;

  return (
    <div className="pb-3">
      <div className="flex flex-wrap gap-2">
        {fotos.map((foto, index) => (
          <Button
            key={foto.id}
            type="button"
            variant="secondary"
            groesse="kompakt"
            disabled={laden.isPending}
            aria-pressed={offen?.id === foto.id}
            onClick={() =>
              offen?.id === foto.id
                ? setOffen(null)
                : laden.mutate({ id: foto.id, nummer: index + 1 })
            }
          >
            Foto {index + 1}
            <span className="sr-only"> {bezug}</span>
          </Button>
        ))}
      </div>
      {laden.isError ? (
        <Statusmeldung ton="fehler" className="mt-2">
          {laden.error.message}
        </Statusmeldung>
      ) : null}
      {offen ? (
        <>
          <Dateiansicht
            bild={offen.bild}
            name={`Foto ${offen.nummer} ${bezug}`}
            onSchliessen={() => setOffen(null)}
          />
          {offenesFoto?.may_delete ? (
            <div className="mt-3">
              <Rueckfrage
                ausloeser="Foto löschen"
                ausloeserVariante="quiet"
                bezeichnung={`Foto ${offen.nummer} ${bezug} löschen – Rückfrage`}
                bestaetigen="Ja, Foto löschen"
                bestaetigenLaeuft="Wird gelöscht …"
                fehler={loeschen.isError ? loeschen.error.message : undefined}
                onBestaetigen={() => loeschen.mutateAsync(offen.id)}
                onAbbrechen={() => loeschen.reset()}
              >
                <p>Das Foto wird gelöscht. Das lässt sich nicht rückgängig machen.</p>
              </Rueckfrage>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
