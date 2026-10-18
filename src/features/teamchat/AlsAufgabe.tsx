import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { Dialogfenster } from '@/components/ui/Dialogfenster';
import { Field } from '@/components/ui/Field';
import { Formularfuss } from '@/components/ui/Formularfuss';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { TextArea } from '@/components/ui/TextArea';
import { Textlink } from '@/components/ui/Textlink';
import { TASKS_KEY, createTask } from '@/features/open-points/tasks-api';
import { NOTIZ_MAX, TITEL_MAX, aufgabeAus } from './aufgabe';

/**
 * „Als Aufgabe übernehmen“ (TEAM-002, ANN-650): Dauerhaft Relevantes gehört in
 * den Fachprozess (§10) - hier in die Offenen Punkte. Titel und Notiz kommen
 * aus der Nachricht und lassen sich vor dem Anlegen ändern; die Aufgabe hat
 * ihre eigene Frist (ANN-142), die Nachricht behält ihre zwölf Monate.
 * Ohne Bezug auf eine Person: Wer eine Patient:in meint, ergänzt das in den
 * Offenen Punkten.
 */
export function AlsAufgabe({
  text,
  herkunft,
  eigeneId,
  onSchliessen,
}: {
  text: string;
  /** „Aus dem Teamchat, # Allgemein, 18.10.“ - Gespräch und Tag, kein Name. */
  herkunft: string;
  eigeneId: string | null;
  onSchliessen: () => void;
}) {
  const queryClient = useQueryClient();
  const vorlage = aufgabeAus(text, herkunft);
  const [titel, setTitel] = useState(vorlage.titel);
  const [notiz, setNotiz] = useState(vorlage.notiz);
  const [faellig, setFaellig] = useState('');
  const [mir, setMir] = useState(true);
  const anlegen = useMutation({
    mutationFn: () =>
      createTask({
        title: titel,
        note: notiz,
        dueOn: faellig,
        assignedStaffMemberId: mir && eigeneId ? eigeneId : '',
        patientId: null,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: TASKS_KEY }),
  });

  function absenden(e: FormEvent) {
    e.preventDefault();
    if (titel.trim() && !anlegen.isPending) anlegen.mutate();
  }

  return (
    <Dialogfenster titel="Als Aufgabe übernehmen" onSchliessen={onSchliessen}>
      {anlegen.isSuccess ? (
        <div className="flex flex-col gap-4">
          <Statusmeldung ton="erfolg">Die Aufgabe steht in den Offenen Punkten.</Statusmeldung>
          <Formularfuss>
            <Button onClick={onSchliessen}>Fertig</Button>
            <Textlink to="/offen" alleinstehend>
              Zu den Offenen Punkten
            </Textlink>
          </Formularfuss>
        </div>
      ) : (
        <form onSubmit={absenden} className="flex flex-col gap-4">
          <Field
            label="Titel"
            value={titel}
            maxLength={TITEL_MAX}
            required
            onChange={(e) => setTitel(e.target.value)}
          />
          <TextArea
            label="Notiz"
            value={notiz}
            rows={4}
            maxLength={NOTIZ_MAX}
            onChange={(e) => setNotiz(e.target.value)}
          />
          <Field
            label="Fällig am (freiwillig)"
            type="date"
            value={faellig}
            onChange={(e) => setFaellig(e.target.value)}
          />
          {eigeneId ? (
            <Checkbox
              label="Mir zuweisen"
              checked={mir}
              onChange={(e) => setMir(e.target.checked)}
            />
          ) : null}
          {anlegen.isError ? (
            <Statusmeldung ton="fehler">{anlegen.error.message}</Statusmeldung>
          ) : null}
          <Formularfuss>
            <Button type="submit" disabled={!titel.trim() || anlegen.isPending}>
              {anlegen.isPending ? 'Wird angelegt …' : 'Aufgabe anlegen'}
            </Button>
            <Button variant="quiet" onClick={onSchliessen}>
              Abbrechen
            </Button>
          </Formularfuss>
        </form>
      )}
    </Dialogfenster>
  );
}
