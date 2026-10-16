import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Dialogfenster } from '@/components/ui/Dialogfenster';
import { Field } from '@/components/ui/Field';
import { Formularfuss } from '@/components/ui/Formularfuss';
import { Kleingedrucktes } from '@/components/ui/Kleingedrucktes';
import { Rueckmeldung } from '@/components/ui/Rueckmeldung';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import {
  PRAXISVORLAGEN_SCHLUESSEL,
  fetchPraxisvorlagen,
  savePraxisvorlage,
  type Plan,
  type VorlagenUebung,
} from './api';
import { standardTitel } from './fassung';
import { vorlagenUebungen } from './vorlagen';

/**
 * „Als Vorlage speichern“ (UEB-014, K12): Die Übungen des Plans mit ihrer
 * Dosierung werden eine Vorlage der Praxis, die „Aus Vorlage“ danach neben
 * den mitgelieferten anbietet. Ein leiser Knopf, ein Fenster mit Name und
 * Ziel. Nur, wer Vorlagen anlegen darf (`can_create`); verbindlich prüft der
 * Server.
 */
export function AlsVorlageSpeichern({ plan }: { plan: Plan }) {
  const vorlagen = useQuery({
    queryKey: PRAXISVORLAGEN_SCHLUESSEL,
    queryFn: fetchPraxisvorlagen,
    retry: false,
  });
  const [offen, setOffen] = useState(false);
  const [gespeichert, setGespeichert] = useState<string | null>(null);
  const uebungen = vorlagenUebungen(plan);
  if (!vorlagen.data?.can_create || uebungen.length === 0) return null;

  return (
    <>
      {gespeichert ? (
        <Rueckmeldung className="mb-3">
          Als Vorlage „{gespeichert}“ gespeichert. Sie steht jetzt unter „Aus Vorlage“.
        </Rueckmeldung>
      ) : null}
      <Button type="button" variant="quiet" groesse="kompakt" onClick={() => setOffen(true)}>
        Als Vorlage speichern
      </Button>
      {offen ? (
        <Speichern
          plan={plan}
          uebungen={uebungen}
          onSchliessen={() => setOffen(false)}
          onGespeichert={(name) => {
            setOffen(false);
            setGespeichert(name);
          }}
        />
      ) : null}
    </>
  );
}

function Speichern({
  plan,
  uebungen,
  onSchliessen,
  onGespeichert,
}: {
  plan: Plan;
  uebungen: VorlagenUebung[];
  onSchliessen: () => void;
  onGespeichert: (name: string) => void;
}) {
  const queryClient = useQueryClient();
  // Der Titel des Plans ist nach Thema benannt (aus einer Vorlage oder von
  // Hand); der Standardtitel sagt nichts und bleibt leer.
  const [name, setName] = useState(standardTitel(plan) ? '' : plan.title);
  const [ziel, setZiel] = useState('');
  const [fehler, setFehler] = useState<string | undefined>();
  const speichern = useMutation({
    mutationFn: () => savePraxisvorlage({ id: null, name, ziel, uebungen }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: PRAXISVORLAGEN_SCHLUESSEL });
      onGespeichert(name.trim());
    },
  });
  const anzahl = uebungen.length === 1 ? '1 Übung' : `${uebungen.length} Übungen`;

  return (
    <Dialogfenster titel="Als Vorlage speichern" onSchliessen={onSchliessen}>
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!name.trim()) {
            setFehler('Bitte einen Namen angeben.');
            return;
          }
          setFehler(undefined);
          if (!speichern.isPending) speichern.mutate();
        }}
      >
        <Field
          label="Name *"
          maxLength={80}
          value={name}
          error={fehler}
          hint="Nach Region und Ziel, etwa „Knie, Kräftigung“ – ohne Namen von Personen."
          onChange={(event) => setName(event.target.value)}
        />
        <Field
          label="Ziel"
          maxLength={200}
          value={ziel}
          onChange={(event) => setZiel(event.target.value)}
        />
        <Kleingedrucktes>
          Mit kommen {anzahl} mit ihrer Dosierung, keine Hinweise zur Person. Die Vorlage steht
          danach der ganzen Praxis zur Wahl.
        </Kleingedrucktes>
        {speichern.isError ? (
          <Statusmeldung ton="fehler">{speichern.error.message}</Statusmeldung>
        ) : null}
        <Formularfuss>
          <Button type="submit" disabled={speichern.isPending}>
            {speichern.isPending ? 'Wird gespeichert …' : 'Speichern'}
          </Button>
          <Button type="button" variant="quiet" onClick={onSchliessen}>
            Abbrechen
          </Button>
        </Formularfuss>
      </form>
    </Dialogfenster>
  );
}
