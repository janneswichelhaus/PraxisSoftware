import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Datenliste, type Datenspalte } from '@/components/ui/Datenliste';
import { EmptyState } from '@/components/ui/Feedback';
import { Filterleiste } from '@/components/ui/Filterleiste';
import { PageHeader } from '@/components/ui/PageHeader';
import { SearchField } from '@/components/ui/SearchField';
import { Textlink } from '@/components/ui/Textlink';
import { fetchPrescribers, prescriberName, type Prescriber } from './api';
import { Kontaktwege } from './Kontaktwege';

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
 * Die Spalten der Kartei (Design-Rollout B1): ab 1024 px nebeneinander,
 * darunter jede Verordner:in als Zeile - Name oben, Praxis und Kontaktwege
 * darunter.
 */
const SPALTEN: readonly Datenspalte<Prescriber>[] = [
  {
    titel: 'Verordner:in',
    breite: 'minmax(0,1.2fr)',
    // Der Name führt zum Bearbeiten. Umbrechen statt abschneiden (VER-09):
    // Gekürzt fiel am Ende genau der Nachname weg - das unterscheidende
    // Merkmal.
    inhalt: (prescriber) => (
      <Textlink
        to={`/verordner/${prescriber.id}/bearbeiten`}
        className="text-liste font-semibold break-words"
      >
        {prescriberName(prescriber)}
      </Textlink>
    ),
  },
  {
    titel: 'Praxis',
    breite: 'minmax(0,1.4fr)',
    inhalt: (prescriber) =>
      [prescriber.practice_name, prescriber.speciality, prescriber.city]
        .filter(Boolean)
        .join(' · ') || null,
  },
  {
    // Telefon und E-Mail als Wege, das Fax als Text (BEF-060).
    titel: 'Kontakt',
    breite: 'minmax(0,1.4fr)',
    inhalt: (prescriber) => <Kontaktwege verordner={prescriber} />,
  },
];

/**
 * Kartei der Verordner:innen (VER-001), Seitentyp „Liste“ (DESIGN.md).
 *
 * Sie enthält keine Patientendaten; die Suche läuft deshalb im Browser über
 * die bereits geladene Liste. Für eine Praxis mit einigen Dutzend Ärzt:innen
 * ist das die einfachere Lösung als eine serverseitige Suche.
 */
export function PrescribersListPage() {
  const [suche, setSuche] = useState('');

  const abfrage = useQuery({
    queryKey: ['prescribers'],
    queryFn: fetchPrescribers,
    retry: false,
  });

  const sichtbar = useMemo(
    () => (abfrage.data ?? []).filter((p) => trifft(p, suche)),
    [abfrage.data, suche],
  );

  return (
    <>
      {/* „Anlegen“ steht am Telefon neben dem Titel statt darunter; der
          zugängliche Name sagt, was angelegt wird. */}
      <PageHeader
        title="Verordner:innen"
        actions={
          <ButtonLink to="/verordner/neu" aria-label="Verordner:in anlegen">
            Anlegen
          </ButtonLink>
        }
      />

      <Filterleiste
        beschriftung="Verordner:innen durchsuchen"
        suche={
          <SearchField
            placeholder="Name, Praxis, Fachrichtung, Ort"
            value={suche}
            onChange={setSuche}
          />
        }
      />

      <Abfragezustand
        abfrage={abfrage}
        laden="Verordner:innen werden geladen …"
        fehler="Die Verordner:innen konnten nicht geladen werden."
        inKarte
        leer={{
          wenn: (liste) => liste.length === 0,
          titel: 'Noch keine Verordner:innen',
          beschreibung: 'Die erste Verordner:in entsteht beim Erfassen einer Verordnung oder hier.',
        }}
      >
        {() =>
          sichtbar.length === 0 ? (
            <EmptyState inKarte title="Keine Treffer" description="Suche anpassen." />
          ) : (
            <Datenliste
              beschriftung="Verordner:innen"
              spalten={SPALTEN}
              zeilen={sichtbar}
              schluessel={(prescriber) => prescriber.id}
            />
          )
        }
      </Abfragezustand>
    </>
  );
}
