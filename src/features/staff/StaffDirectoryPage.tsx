import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Field } from '@/components/ui/Field';
import { Badge } from '@/components/ui/Badge';
import { Card, CardGrid } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/Feedback';
import { isOwner, type CurrentUser } from '@/features/session/types';
import { useVorschau } from '@/features/preview/vorschauContext';
import { Abschnitt, OffeneEntscheidung, VorschauBanner } from '@/features/preview/ui';
import type { Personalkategorie } from '@/features/preview/types';

/**
 * Teamverzeichnis.
 *
 * Die öffentliche Sicht auf den gemeinsamen Mitarbeiterstamm: wer gehört zum
 * Team, welche Aufgabe hat die Person, wie ist sie erreichbar.
 *
 * Ausdrücklich NICHT hier: Geburtsdatum, Eintrittsdatum, Urlaubsanspruch,
 * Notfallkontakt und interne Notizen. Das sind geschützte Personalangaben und
 * gehören in die Personalakte unter „Betrieb", nicht in ein Verzeichnis, das
 * das ganze Team sieht (PROJECT_PRINCIPLES.md 20).
 */

const kategorien: Personalkategorie[] = ['Leitung', 'Physiotherapie', 'Office'];

export function StaffDirectoryPage({ user }: { user: CurrentUser }) {
  const { zustand } = useVorschau();
  const [suche, setSuche] = useState('');

  const nadel = suche.trim().toLowerCase();
  const treffer = zustand.mitarbeitende.filter((person) =>
    `${person.name} ${person.rolle} ${person.kategorie}`.toLowerCase().includes(nadel),
  );

  return (
    <>
      <PageHeader
        title="Teamverzeichnis"
        description="Wer gehört zum Team und wie ist die Person erreichbar."
      />

      <VorschauBanner
        bereich="Teamverzeichnis"
        beschreibung="Synthetische Personen. Es gibt noch keine Anbindung an den echten Mitarbeiterstamm."
      />

      <div className="mb-5 max-w-sm">
        <Field
          label="Suche"
          type="search"
          placeholder="Name oder Aufgabe"
          value={suche}
          onChange={(event) => setSuche(event.target.value)}
        />
      </div>

      {treffer.length === 0 ? <EmptyState title="Keine Treffer" /> : null}

      {kategorien.map((kategorie) => {
        const personen = treffer.filter((person) => person.kategorie === kategorie);
        if (personen.length === 0) return null;
        return (
          <Abschnitt key={kategorie} titel={kategorie}>
            <CardGrid>
              {personen.map((person) => (
                <Card key={person.id}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-ink truncate text-[0.9375rem] font-semibold">
                        {person.name}
                      </p>
                      <p className="text-ink-muted mt-0.5 text-sm">{person.rolle}</p>
                    </div>
                    {person.stufe ? <Badge>{person.stufe}</Badge> : null}
                  </div>
                  {/* Bewusst ohne tel:- und mailto:-Verknuepfung: Die Kontakte
                      sind synthetisch, ein Anruf oder eine Mail daraus waere
                      eine vorgetaeuschte Funktion. Die Verknuepfung kommt mit
                      der echten Anbindung. */}
                  <p className="text-ink-muted mt-3 text-sm">{person.telefon}</p>
                  <p className="text-ink-muted text-sm break-all">{person.email}</p>
                </Card>
              ))}
            </CardGrid>
          </Abschnitt>
        );
      })}

      <OffeneEntscheidung titel="Verzeichnis und Personalakte sind zwei Sichten">
        Dieses Verzeichnis zeigt bewusst nur dienstliche Kontaktdaten. Geburtsdatum,
        Beschäftigungsdaten, Urlaubsanspruch und Notfallkontakt liegen in der Personalakte und sind
        gesondert berechtigt.{' '}
        {isOwner(user.roles) || user.roles.includes('team_lead') ? (
          <Link to="/betrieb/personal" className="text-accent hover:text-accent-hover underline">
            Zur Personalakte
          </Link>
        ) : (
          'Für Ihre Rolle ist die Personalakte nicht vorgesehen.'
        )}
      </OffeneEntscheidung>
    </>
  );
}
