import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Field } from '@/components/ui/Field';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { storniereZahlung } from './api';

/**
 * Eine Zahlung stornieren (ABR-004).
 *
 * Es gibt keinen Löschknopf, und das ist die Entscheidung: Eine falsch
 * erfasste Zahlung wird storniert und bleibt mit ihrem Grund sichtbar
 * (ADR-009 Punkt 9 sinngemäß). Der Grund ist deshalb Pflicht — ein Storno
 * ohne Grund wäre eine Buchung ohne Beleg.
 *
 * **Seit UXR-010 eine eigene Datei (ABR-07).** Bis dahin stand der Knopf nur
 * unter „Zahlungen"; wer eine Rechnung mit gebuchter Zahlung stornieren
 * wollte, musste die Zahlung dort per Nummer suchen. Jetzt steht derselbe
 * Knopf auch an der Zahlung auf der Rechnung. Aufruf und Regel bleiben
 * dieselben (`void_payment`, ANN-079) - nur der Ort kommt dazu.
 *
 * Nach dem Storno lädt die Seite neben den Listen auch die Rechnung selbst
 * neu (ABR-01): Aus ihr kommt der offene Betrag, und der ändert sich mit.
 */
export function Zahlungsstorno({
  zahlungId,
  invoiceId,
  ausloeser = 'Stornieren',
}: {
  zahlungId: string;
  /** Die Rechnung der Zahlung - ihr offener Betrag ändert sich mit dem Storno. */
  invoiceId: string;
  /** Beschriftung des Auslösers; an der Rechnung „Zahlung stornieren". */
  ausloeser?: string;
}) {
  const queryClient = useQueryClient();
  const [grund, setGrund] = useState('');
  const [fehler, setFehler] = useState<string | undefined>(undefined);

  const stornieren = useMutation({
    mutationFn: () => storniereZahlung(zahlungId, grund.trim()),
    onSuccess: async () => {
      setGrund('');
      await queryClient.invalidateQueries({ queryKey: ['zahlungen'] });
      await queryClient.invalidateQueries({ queryKey: ['offene-posten'] });
      await queryClient.invalidateQueries({ queryKey: ['rechnungen'] });
      await queryClient.invalidateQueries({ queryKey: ['rechnung', invoiceId] });
      await queryClient.invalidateQueries({ queryKey: ['rechnungszahlungen', invoiceId] });
    },
  });

  return (
    <Rueckfrage
      ausloeser={ausloeser}
      ausloeserVariante="quiet"
      bestaetigen="Storno buchen"
      bestaetigenLaeuft="Wird storniert …"
      laeuft={stornieren.isPending}
      fehler={fehler ?? (stornieren.isError ? stornieren.error.message : undefined)}
      onBestaetigen={() => {
        if (grund.trim().length < 3) {
          setFehler('Bitte einen Grund angeben – das Storno bleibt dauerhaft sichtbar.');
          // Abgewiesen, nicht ausgeführt: Der Kasten muss offen bleiben,
          // damit der Hinweis am Feld steht, in dem er gilt.
          return Promise.reject(new Error('Grund fehlt'));
        }
        setFehler(undefined);
        return stornieren.mutateAsync();
      }}
      onAbbrechen={() => {
        setGrund('');
        setFehler(undefined);
        stornieren.reset();
      }}
    >
      <p className="text-ink-muted text-sm">
        Die Buchung bleibt sichtbar stehen und fällt aus der Summe. Geändert oder gelöscht wird eine
        Zahlung nie.
      </p>
      {/* Eine Zeile Grund, keine Seitenbreite (ABR-23). */}
      <div className="mt-2 max-w-xl">
        <Field label="Grund" value={grund} onChange={(e) => setGrund(e.target.value)} />
      </div>
    </Rueckfrage>
  );
}
