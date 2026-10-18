import { useEffect, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Filterleiste } from '@/components/ui/Filterleiste';
import { Formularfuss } from '@/components/ui/Formularfuss';
import { ListRow } from '@/components/ui/ListRow';
import { Listenabschnitt } from '@/components/ui/Listenabschnitt';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { SearchField } from '@/components/ui/SearchField';
import { Select } from '@/components/ui/Select';
import { mitRueckweg } from '@/lib/rueckweg';
import {
  KANAELE_KEY,
  PERSONEN_KEY,
  fetchKanaele,
  fetchPersonen,
  kanalTitel,
  ordneKanaele,
  sucheKey,
  sucheNachrichten,
  type Suchfilter,
} from './api';
import { vorschau } from './formatierung';
import { SUCHE, TEAMCHAT, stellePfad } from './pfade';
import { useTeamchat } from './rahmen';
import { Rand } from './Rand';
import { LEERE_SUCHE, sucheMoeglich, sucheSetzen, useSuche } from './suche';
import { nachrichtenzeit } from './zeit';

/**
 * Teamchat → Suche (TEAM-002, ANN-651): ein Wort in allen Gesprächen, die man
 * liest, dazu „In“ (ein Gespräch), „Von“ (eine Person, nur mit Suchwort) und
 * „Ab“ (ein Tag). Ohne Wort geht nur der Blick in ein Gespräch. Der Suchtext
 * bleibt im Arbeitsspeicher - nie in der Adresse, im Verlauf des Browsers oder
 * in einem Schlüssel (ADR-011).
 */
export function SuchePage() {
  const { user, spalten } = useTeamchat();
  const zeitzone = user.organizationTimeZone ?? 'Europe/Berlin';
  const { filter, lauf } = useSuche();
  const [entwurf, setEntwurf] = useState<Suchfilter>(filter);
  // Eine neue Suche aus der Liste der Gespräche füllt die Felder neu.
  useEffect(() => setEntwurf(filter), [filter, lauf]);
  const kanaele = useQuery({ queryKey: KANAELE_KEY, queryFn: fetchKanaele });
  const personen = useQuery({ queryKey: PERSONEN_KEY, queryFn: fetchPersonen });
  const treffer = useQuery({
    queryKey: sucheKey(lauf),
    queryFn: () => sucheNachrichten(filter),
    enabled: sucheMoeglich(filter),
  });
  const titel = (kanalId: string) => {
    const kanal = kanaele.data?.find((k) => k.id === kanalId);
    return kanal ? kanalTitel(kanal) : 'Gespräch';
  };
  const gesetzt = [entwurf.kanalId, entwurf.personId, entwurf.ab].filter((x) => x !== null).length;
  const personOhneWort = entwurf.personId !== null && entwurf.text.trim().length < 2;

  function suchen(e?: FormEvent) {
    e?.preventDefault();
    if (sucheMoeglich(entwurf)) sucheSetzen({ ...entwurf, text: entwurf.text.trim() });
  }

  const gespraeche = kanaele.data ? ordneKanaele(kanaele.data) : null;

  return (
    <Rand>
      {spalten === 1 ? (
        <Rueckweg standard={TEAMCHAT} beschriftung="Zurück zu den Gesprächen" />
      ) : null}
      <PageHeader title="Suche" />
      <form onSubmit={suchen}>
        <Filterleiste
          beschriftung="Nachrichten durchsuchen"
          gesetzt={gesetzt}
          onZuruecksetzen={() => setEntwurf({ ...LEERE_SUCHE, text: entwurf.text })}
          suche={
            <SearchField
              label="In Nachrichten suchen"
              placeholder="Wort, mindestens zwei Zeichen"
              maxLength={100}
              value={entwurf.text}
              onChange={(text) => setEntwurf({ ...entwurf, text })}
            />
          }
        >
          <Select
            label="In"
            value={entwurf.kanalId ?? ''}
            onChange={(e) => setEntwurf({ ...entwurf, kanalId: e.target.value || null })}
          >
            <option value="">Allen Gesprächen</option>
            {gespraeche
              ? [
                  ...gespraeche.favoriten,
                  ...gespraeche.kanaele,
                  ...gespraeche.direkt,
                  ...gespraeche.archiviert,
                ].map((k) => (
                  <option key={k.id} value={k.id}>
                    {kanalTitel(k)}
                  </option>
                ))
              : null}
          </Select>
          <Select
            label="Von"
            value={entwurf.personId ?? ''}
            error={personOhneWort ? 'Nach einer Person nur mit Suchwort.' : undefined}
            onChange={(e) => setEntwurf({ ...entwurf, personId: e.target.value || null })}
          >
            <option value="">Allen</option>
            {(personen.data ?? []).map((p) => (
              <option key={p.staff_member_id} value={p.staff_member_id}>
                {p.name}
              </option>
            ))}
          </Select>
          <Field
            label="Ab"
            type="date"
            value={entwurf.ab ?? ''}
            onChange={(e) => setEntwurf({ ...entwurf, ab: e.target.value || null })}
          />
        </Filterleiste>
        {/* Am Telefon in voller Breite (Grundsatz 1, `Formularfuss`). */}
        <Formularfuss dicht>
          <Button type="submit" disabled={!sucheMoeglich(entwurf)}>
            Suchen
          </Button>
        </Formularfuss>
      </form>

      {sucheMoeglich(filter) ? (
        <div className="mt-8">
          <Abfragezustand
            abfrage={treffer}
            laden="Es wird gesucht …"
            fehler="Die Suche hat nicht geklappt."
            leer={{
              wenn: (daten) => daten.length === 0,
              titel: 'Nichts gefunden',
              beschreibung: 'Gesucht wird in allen Gesprächen, die du lesen kannst.',
            }}
          >
            {(daten) => (
              <Listenabschnitt titel="Treffer" anzahl={daten.length}>
                {daten.map((t) => (
                  <ListRow
                    key={t.id}
                    to={mitRueckweg(
                      stellePfad({ id: t.channel_id, kind: t.channel_kind }, t),
                      SUCHE,
                    )}
                    titel={<span className="line-clamp-2">{vorschau(t.body)}</span>}
                    meta={`${titel(t.channel_id)} · ${t.author_name ?? 'Ehemaliges Teammitglied'} · ${nachrichtenzeit(
                      t.created_at,
                      zeitzone,
                    )}`}
                  />
                ))}
              </Listenabschnitt>
            )}
          </Abfragezustand>
        </div>
      ) : null}
    </Rand>
  );
}
