import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { Button } from '@/components/ui/Button';
import { Disclosure } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';
import { Formularfuss } from '@/components/ui/Formularfuss';
import { ListRow } from '@/components/ui/ListRow';
import { Listenabschnitt } from '@/components/ui/Listenabschnitt';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import type { CurrentUser } from '@/features/session/types';
import { PERSONEN_KEY, TEAMCHAT_KEY, fetchPersonen, legeKanalAn, oeffneDirekt } from './api';
import { gespraechPfad } from './pfade';

/**
 * Neue Nachricht im Teamchat (TEAM-001): eine Person antippen öffnet die
 * Direktnachricht - die bestehende, sonst eine neue. Kein Suchfeld: Bei drei
 * bis acht Personen steht das ganze Team in einer Liste. owner und
 * Teamleitung legen darunter, eingeklappt, einen Kanal an (ANN-611).
 */
export function NeuPage({ user }: { user: CurrentUser }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const personen = useQuery({ queryKey: PERSONEN_KEY, queryFn: fetchPersonen });
  const oeffnen = useMutation({
    mutationFn: (staffMemberId: string) => oeffneDirekt(staffMemberId),
    onSuccess: async (id) => {
      await queryClient.invalidateQueries({ queryKey: TEAMCHAT_KEY });
      void navigate(gespraechPfad(id));
    },
  });
  const darfKanal = user.roles.some((r) => r === 'owner' || r === 'team_lead');

  return (
    <>
      <Rueckweg standard="/team" beschriftung="Zurück zum Teamchat" />
      <PageHeader title="Neue Nachricht" />
      {oeffnen.isError ? <Statusmeldung ton="fehler">{oeffnen.error.message}</Statusmeldung> : null}
      <Abfragezustand
        abfrage={personen}
        laden="Das Team wird geladen …"
        fehler="Das Team konnte nicht geladen werden."
      >
        {(daten) => (
          <Listenabschnitt
            titel="Direktnachricht an"
            anzahl={daten.length}
            leer={{ titel: 'Außer dir ist noch niemand im Teamchat.' }}
          >
            {daten.map((person) => (
              <ListRow
                key={person.staff_member_id}
                titel={person.name}
                onClick={() => {
                  if (!oeffnen.isPending) oeffnen.mutate(person.staff_member_id);
                }}
              />
            ))}
          </Listenabschnitt>
        )}
      </Abfragezustand>
      {darfKanal ? <KanalAnlegen /> : null}
    </>
  );
}

function KanalAnlegen() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [beschreibung, setBeschreibung] = useState('');
  const anlegen = useMutation({
    mutationFn: () => legeKanalAn({ name, beschreibung }),
    onSuccess: async (id) => {
      await queryClient.invalidateQueries({ queryKey: TEAMCHAT_KEY });
      void navigate(gespraechPfad(id));
    },
  });

  function absenden(e: FormEvent) {
    e.preventDefault();
    if (name.trim()) anlegen.mutate();
  }

  return (
    <div className="mt-8">
      <Disclosure summary="Kanal anlegen">
        <form onSubmit={absenden} className="max-w-formular flex flex-col gap-4 pt-2">
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
          <Formularfuss>
            <Button type="submit" disabled={!name.trim() || anlegen.isPending}>
              {anlegen.isPending ? 'Wird angelegt …' : 'Kanal anlegen'}
            </Button>
          </Formularfuss>
        </form>
      </Disclosure>
    </div>
  );
}
