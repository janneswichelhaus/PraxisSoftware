import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { TextArea } from '@/components/ui/TextArea';
import { terminWuenschen, wuenscheSchluessel, type Plattformzugang, type Tageszeit } from './api';
import { PLATTFORM_PFAD } from './pfade';
import { Wunschfelder } from './Wunschfelder';

const NOTIZ_MAX = 500;

/**
 * „Termin wünschen" (POR-009, DSN-001 4.1): Welche Tage und Tageszeiten
 * passen, dazu eine freie Zeile. Ein Hauptknopf, Abbrechen immer sichtbar
 * (Abschnitt 7). Nach dem Senden steht der Wunsch in der Terminliste als
 * „angefragt – die Praxis meldet sich"; einen Termin macht daraus die
 * Praxis (§8).
 */
export function Terminwunsch({ zugang }: { zugang: Plattformzugang }) {
  const navigate = useNavigate();
  const [suche] = useSearchParams();
  const queryClient = useQueryClient();
  const zurueck = `${PLATTFORM_PFAD}/termine${suche.toString() ? `?${suche.toString()}` : ''}`;

  const [tage, setTage] = useState<string[]>([]);
  const [zeiten, setZeiten] = useState<Tageszeit[]>([]);
  const [notiz, setNotiz] = useState('');
  const [pruefung, setPruefung] = useState<string | null>(null);

  const senden = useMutation({
    mutationFn: () => terminWuenschen({ zugangId: zugang.access_id, tage, zeiten, notiz }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: wuenscheSchluessel(zugang.access_id) });
      void navigate(`${zurueck}${zurueck.includes('?') ? '&' : '?'}gesendet=1`, { replace: true });
    },
  });

  function absenden(e: React.FormEvent) {
    e.preventDefault();
    if (tage.length === 0) {
      setPruefung('Bitte wählen Sie mindestens einen Tag.');
      return;
    }
    if (notiz.trim().length > NOTIZ_MAX) {
      setPruefung(`Ihre Nachricht darf höchstens ${NOTIZ_MAX} Zeichen lang sein.`);
      return;
    }
    setPruefung(null);
    senden.mutate();
  }

  const fehler = pruefung ?? (senden.isError ? senden.error.message : null);

  return (
    <>
      <Link
        to={zurueck}
        className="text-ink-muted hover:text-ink mb-4 inline-flex min-h-11 items-center text-sm"
      >
        ← Zu den Terminen
      </Link>
      <h1 className="text-accent text-h3 font-bold">Termin wünschen</h1>
      <p className="text-ink mt-2 max-w-prose text-base leading-relaxed">
        Sagen Sie uns, wann es Ihnen passt. Die Praxis sucht einen Termin und meldet sich bei Ihnen.
        Ein vereinbarter Termin ist das noch nicht.
      </p>
      <form onSubmit={absenden} noValidate className="mt-6 flex flex-col gap-8">
        <Wunschfelder tage={tage} zeiten={zeiten} onTage={setTage} onZeiten={setZeiten} />

        <TextArea
          label="Was sollen wir noch wissen? (freiwillig)"
          hint={`${notiz.trim().length} von ${NOTIZ_MAX} Zeichen`}
          rows={3}
          value={notiz}
          onChange={(e) => setNotiz(e.target.value)}
        />

        {fehler ? <Statusmeldung ton="fehler">{fehler}</Statusmeldung> : null}

        <div className="flex flex-col gap-3 sm:flex-row">
          <Button type="submit" disabled={senden.isPending}>
            {senden.isPending ? 'Wird gesendet …' : 'Wunsch senden'}
          </Button>
          <Button type="button" variant="secondary" onClick={() => void navigate(zurueck)}>
            Abbrechen
          </Button>
        </div>
      </form>
    </>
  );
}
