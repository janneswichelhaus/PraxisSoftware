import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { Field } from '@/components/ui/Field';
import { Formularfuss } from '@/components/ui/Formularfuss';
import { Kleingedrucktes } from '@/components/ui/Kleingedrucktes';
import { ListRow } from '@/components/ui/ListRow';
import { Listenabschnitt } from '@/components/ui/Listenabschnitt';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { Segment } from '@/components/ui/Segment';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Zwischentitel } from '@/components/ui/Zwischentitel';
import {
  PERSONEN_KEY,
  TEAMCHAT_KEY,
  fetchPersonen,
  legeKanalAn,
  oeffneDirekt,
  oeffneGruppe,
  type Person,
} from './api';
import { TEAMCHAT, gespraechPfad } from './pfade';
import { useTeamchat } from './rahmen';
import { Rand } from './Rand';

type Art = 'direkt' | 'gruppe' | 'kanal';

/** Drei bis neun mit der Person selbst (ANN-642). */
const GRUPPE_MAX_ANDERE = 8;

/**
 * Teamchat → Neu (TEAM-002): eine Person antippen öffnet die Direktnachricht
 * (die bestehende, sonst eine neue - drei Tipps bis zum Senden). „Gruppe“
 * wählt zwei bis acht weitere Personen; dieselben Personen öffnen dasselbe
 * Gespräch. owner und Teamleitung legen Kanäle an, offen oder privat mit
 * Mitgliedern (ANN-611, ANN-642) - das prüft auch der Server.
 */
export function NeuPage() {
  const { user, spalten } = useTeamchat();
  const darfKanal = user.roles.some((r) => r === 'owner' || r === 'team_lead');
  const [art, setArt] = useState<Art>('direkt');
  const personen = useQuery({ queryKey: PERSONEN_KEY, queryFn: fetchPersonen });
  const arten: { wert: Art; text: string }[] = [
    { wert: 'direkt', text: 'Direkt' },
    { wert: 'gruppe', text: 'Gruppe' },
    ...(darfKanal ? [{ wert: 'kanal' as const, text: 'Kanal' }] : []),
  ];

  return (
    <Rand>
      {spalten === 1 ? (
        <Rueckweg standard={TEAMCHAT} beschriftung="Zurück zu den Gesprächen" />
      ) : null}
      <PageHeader title="Neu" />
      <div className="mb-6">
        <Segment beschriftung="Was" wahlen={arten} gewaehlt={art} onWaehlen={setArt} />
      </div>
      <Abfragezustand
        abfrage={personen}
        laden="Das Team wird geladen …"
        fehler="Das Team konnte nicht geladen werden."
      >
        {(daten) =>
          art === 'direkt' ? (
            <Direkt personen={daten} />
          ) : art === 'gruppe' ? (
            <Gruppe personen={daten} />
          ) : (
            <KanalAnlegen personen={daten} />
          )
        }
      </Abfragezustand>
    </Rand>
  );
}

function useOeffnen<T>(oeffnen: (wert: T) => Promise<string>, art: 'direct' | 'group' | 'channel') {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: oeffnen,
    onSuccess: async (id) => {
      await queryClient.invalidateQueries({ queryKey: TEAMCHAT_KEY });
      void navigate(gespraechPfad({ id, kind: art }));
    },
  });
}

function Direkt({ personen }: { personen: Person[] }) {
  const oeffnen = useOeffnen((id: string) => oeffneDirekt(id), 'direct');
  return (
    <>
      {oeffnen.isError ? <Statusmeldung ton="fehler">{oeffnen.error.message}</Statusmeldung> : null}
      <Listenabschnitt
        titel="Direktnachricht an"
        anzahl={personen.length}
        leer={{ titel: 'Außer dir ist noch niemand im Teamchat.' }}
      >
        {personen.map((person) => (
          <ListRow
            key={person.staff_member_id}
            titel={person.name}
            onClick={() => {
              if (!oeffnen.isPending) oeffnen.mutate(person.staff_member_id);
            }}
          />
        ))}
      </Listenabschnitt>
    </>
  );
}

/** Personen zum Ankreuzen - für Gruppe und privaten Kanal. */
function Auswahl({
  personen,
  gewaehlt,
  grenze,
  onAendern,
}: {
  personen: Person[];
  gewaehlt: readonly string[];
  grenze?: number;
  onAendern: (neu: string[]) => void;
}) {
  return (
    <fieldset className="flex flex-col">
      <legend className="sr-only">Personen</legend>
      {personen.map((p) => {
        const an = gewaehlt.includes(p.staff_member_id);
        return (
          <Checkbox
            key={p.staff_member_id}
            label={p.name}
            checked={an}
            disabled={!an && grenze !== undefined && gewaehlt.length >= grenze}
            onChange={(e) =>
              onAendern(
                e.target.checked
                  ? [...gewaehlt, p.staff_member_id]
                  : gewaehlt.filter((id) => id !== p.staff_member_id),
              )
            }
          />
        );
      })}
    </fieldset>
  );
}

function Gruppe({ personen }: { personen: Person[] }) {
  const [gewaehlt, setGewaehlt] = useState<string[]>([]);
  const oeffnen = useOeffnen((ids: string[]) => oeffneGruppe(ids), 'group');

  function absenden(e: FormEvent) {
    e.preventDefault();
    if (gewaehlt.length >= 2 && !oeffnen.isPending) oeffnen.mutate(gewaehlt);
  }

  return (
    <form onSubmit={absenden} className="max-w-formular flex flex-col gap-4">
      <Zwischentitel>Mit wem? Zwei bis acht Personen</Zwischentitel>
      <Auswahl
        personen={personen}
        gewaehlt={gewaehlt}
        grenze={GRUPPE_MAX_ANDERE}
        onAendern={setGewaehlt}
      />
      {oeffnen.isError ? <Statusmeldung ton="fehler">{oeffnen.error.message}</Statusmeldung> : null}
      <Formularfuss>
        <Button type="submit" disabled={gewaehlt.length < 2 || oeffnen.isPending}>
          {oeffnen.isPending ? 'Wird geöffnet …' : `Gruppe öffnen (${gewaehlt.length + 1})`}
        </Button>
      </Formularfuss>
      <Kleingedrucktes>
        Lesen können nur die Personen der Gruppe, auch die Praxisleitung nicht.
      </Kleingedrucktes>
    </form>
  );
}

function KanalAnlegen({ personen }: { personen: Person[] }) {
  const [name, setName] = useState('');
  const [beschreibung, setBeschreibung] = useState('');
  const [privat, setPrivat] = useState(false);
  const [mitglieder, setMitglieder] = useState<string[]>([]);
  const anlegen = useOeffnen(
    () => legeKanalAn({ name, beschreibung, privat, mitglieder: privat ? mitglieder : [] }),
    'channel',
  );

  function absenden(e: FormEvent) {
    e.preventDefault();
    if (name.trim() && !anlegen.isPending) anlegen.mutate(undefined);
  }

  return (
    <form onSubmit={absenden} className="max-w-formular flex flex-col gap-4">
      <Field
        label="Name"
        value={name}
        maxLength={40}
        required
        error={anlegen.isError ? anlegen.error.message : undefined}
        onChange={(e) => setName(e.target.value)}
      />
      <Field
        label="Worum es geht (freiwillig)"
        value={beschreibung}
        maxLength={200}
        onChange={(e) => setBeschreibung(e.target.value)}
      />
      <Checkbox
        label="Privat – nur Mitglieder lesen"
        checked={privat}
        onChange={(e) => setPrivat(e.target.checked)}
      />
      {privat ? (
        <>
          <Zwischentitel>Mitglieder außer dir</Zwischentitel>
          <Auswahl personen={personen} gewaehlt={mitglieder} onAendern={setMitglieder} />
        </>
      ) : null}
      <Formularfuss>
        <Button type="submit" disabled={!name.trim() || anlegen.isPending}>
          {anlegen.isPending ? 'Wird angelegt …' : 'Kanal anlegen'}
        </Button>
      </Formularfuss>
      <Kleingedrucktes>
        {privat
          ? 'Einen privaten Kanal lesen nur seine Mitglieder, auch die Praxisleitung nicht.'
          : 'Einen offenen Kanal liest das ganze Team.'}
      </Kleingedrucktes>
    </form>
  );
}
