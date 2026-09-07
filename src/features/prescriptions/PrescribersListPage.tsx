import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Field } from '@/components/ui/Field';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/Feedback';
import { fetchPrescribers, prescriberName, type Prescriber } from './api';

function trifft(prescriber: Prescriber, suche: string): boolean {
  const gesucht = suche.trim().toLowerCase();
  if (gesucht === '') return true;
  return [
    prescriber.family_name,
    prescriber.given_name,
    prescriber.practice_name,
    prescriber.speciality,
    prescriber.city,
  ]
    .filter(Boolean)
    .some((wert) => wert!.toLowerCase().includes(gesucht));
}

/**
 * Kartei der Verordner:innen (VER-001).
 *
 * Sie enthält keine Patientendaten; die Suche läuft deshalb im Browser über
 * die bereits geladene Liste. Für eine Praxis mit einigen Dutzend Ärzt:innen
 * ist das die einfachere Lösung als eine serverseitige Suche.
 */
export function PrescribersListPage() {
  const [suche, setSuche] = useState('');

  const { data, isPending, isError } = useQuery({
    queryKey: ['prescribers'],
    queryFn: fetchPrescribers,
    retry: false,
  });

  const sichtbar = useMemo(() => (data ?? []).filter((p) => trifft(p, suche)), [data, suche]);

  return (
    <>
      <PageHeader
        title="Verordner:innen"
        description="Ärzt:innen und Praxen, die Verordnungen ausstellen."
        actions={
          <Link
            to="/verordner/neu"
            className="bg-accent hover:bg-accent-hover inline-flex min-h-11 items-center justify-center rounded-lg px-4 text-[0.9375rem] font-medium text-white transition-colors"
          >
            Verordner:in anlegen
          </Link>
        }
      />

      <div className="mb-5 max-w-sm">
        <Field
          label="Suche"
          type="search"
          placeholder="Name, Praxis, Fachrichtung, Ort"
          value={suche}
          onChange={(event) => setSuche(event.target.value)}
        />
      </div>

      {isPending ? <LoadingState label="Verordner:innen werden geladen …" /> : null}
      {isError ? (
        <ErrorState
          title="Die Verordner:innen konnten nicht geladen werden."
          description="Bitte später erneut versuchen. Sind Sie noch angemeldet?"
        />
      ) : null}

      {data && sichtbar.length === 0 ? (
        <EmptyState
          title={data.length === 0 ? 'Noch keine Verordner:innen' : 'Keine Treffer'}
          description={
            data.length === 0
              ? 'Die erste Verordner:in entsteht beim Erfassen einer Verordnung oder hier.'
              : 'Suche anpassen.'
          }
        />
      ) : null}

      {sichtbar.length > 0 ? (
        <ul className="divide-line border-line divide-y border-y">
          {sichtbar.map((prescriber) => (
            <li key={prescriber.id}>
              <Link
                to={`/verordner/${prescriber.id}/bearbeiten`}
                className="hover:bg-surface-sunken flex min-h-16 items-center justify-between gap-4 py-3 transition-colors"
              >
                <span className="min-w-0">
                  <span className="text-ink block truncate text-[0.9375rem] font-medium">
                    {prescriberName(prescriber)}
                  </span>
                  <span className="text-ink-muted mt-0.5 block text-sm">
                    {[prescriber.practice_name, prescriber.speciality, prescriber.city]
                      .filter(Boolean)
                      .join(' · ') || 'Ohne weitere Angaben'}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}
