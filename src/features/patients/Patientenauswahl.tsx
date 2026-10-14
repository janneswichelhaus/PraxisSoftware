import { useMemo, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { Filterchips } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/Feedback';
import { Filterleiste } from '@/components/ui/Filterleiste';
import { ListRow, ListRows } from '@/components/ui/ListRow';
import { SearchField } from '@/components/ui/SearchField';
import { Segment } from '@/components/ui/Segment';
import { StatusMark } from '@/components/ui/StatusMark';
import { formatEuro } from '@/lib/geld';
import { ageInYears } from './api';
import {
  PATIENT_OVERVIEW_KEY,
  SORTIERUNGEN,
  fetchPatientOverview,
  leseSortierung,
  leseZeigen,
  merkmal,
  passtZuZeigen,
  passtZurSuche,
  sortieren,
  zeigenWahlen,
  type Patienteneintrag,
  type Sortierung,
  type Zeigen,
} from './uebersicht';

/** „12.10.“ im laufenden Jahr, sonst „12.10.25“ - kurz genug für die Zeile am Telefon. */
function kurzesDatum(iso: string, heute: Date): string {
  const [jahr, monat, tag] = iso.split('-');
  if (!jahr || !monat || !tag) return iso;
  return Number(jahr) === heute.getFullYear()
    ? `${tag}.${monat}.`
    : `${tag}.${monat}.${jahr.slice(2)}`;
}

function metaZeile(eintrag: Patienteneintrag, heute: Date): string {
  const alter = ageInYears(eintrag.date_of_birth);
  return [
    alter !== null ? `${alter} Jahre` : 'Geburtsdatum unbekannt',
    eintrag.city,
    eintrag.last_visit_on ? `zuletzt ${kurzesDatum(eintrag.last_visit_on, heute)}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/**
 * Die Patientenliste zum Filtern und Sortieren (B10, BEF-160) - statt der
 * Suche ab drei Zeichen. Eine Komponente für die Kartei und für „Termin
 * anlegen“: dieselbe Suche (ab dem ersten Zeichen), dieselbe Sortierung
 * (zuletzt behandelt, offene Verordnung zuerst, A–Z) und dieselben
 * Karteileichen (B1): Termine fehlen, Haken oder Doku fehlt, abrechnen, in
 * der Abrechnung - für owner und office dazu zu mahnen und offene Rechnungen.
 *
 * Sortierung und Auswahl stehen in der Adresszeile (UX-012), damit die Akte
 * in genau diese Ansicht zurückführt; andere Parameter der Seite bleiben
 * stehen. Der Suchbegriff - meist ein Name - nur dort, wo die Kartei ihn schon
 * so führte (`sucheInAdresse`); beim Anlegen eines Termins bleibt er im
 * Zustand der Seite und wandert nicht mit der Kennung der Person in die
 * nächste Adresse (ANN-061, ADR-011). Rechte und RLS bleiben, wie sie sind:
 * Die Liste zeigt, was der Server liefert.
 */
export function Patientenauswahl({
  ziel,
  suchbeschriftung = 'Patient:in suchen',
  leer,
  sucheInAdresse = false,
}: {
  /** Wohin eine Zeile führt. */
  ziel: (patientId: string) => string;
  suchbeschriftung?: string;
  /** Leerzustand ohne jede Akte. */
  leer: { titel: string; beschreibung?: string };
  /** Den Suchbegriff als `q` in der Adresse führen (nur die Kartei, wie bisher). */
  sucheInAdresse?: boolean;
}) {
  const [parameter, setParameter] = useSearchParams();
  const navigate = useNavigate();
  const [lokalerBegriff, setLokalerBegriff] = useState('');
  const begriff = sucheInAdresse ? (parameter.get('q') ?? '') : lokalerBegriff;
  const sortierung = leseSortierung(parameter.get('sort'));
  const zeigen = leseZeigen(parameter.get('zeigen'));

  const abfrage = useQuery({
    queryKey: PATIENT_OVERVIEW_KEY,
    queryFn: fetchPatientOverview,
    retry: false,
  });
  const { data } = abfrage;

  const sichtbar = useMemo(
    () =>
      sortieren(
        (data ?? []).filter(
          (eintrag) => passtZuZeigen(eintrag, zeigen) && passtZurSuche(eintrag, begriff),
        ),
        sortierung,
      ),
    [data, begriff, sortierung, zeigen],
  );
  const wahlen = useMemo(() => zeigenWahlen(data ?? []), [data]);
  const heute = new Date();

  function setzen(schluessel: 'q' | 'sort' | 'zeigen', wert: string | null) {
    setParameter(
      (bisher) => {
        const neu = new URLSearchParams(bisher);
        if (wert) neu.set(schluessel, wert);
        else neu.delete(schluessel);
        return neu;
      },
      { replace: true },
    );
  }

  /** Die Eingabetaste öffnet, wenn genau eine Akte übrig ist. */
  function absenden(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const [einzige, ...weitere] = sichtbar;
    if (begriff.trim() && einzige && weitere.length === 0) void navigate(ziel(einzige.id));
  }

  const eingeschraenkt = begriff.trim() !== '' || zeigen !== null;

  return (
    <>
      <Filterleiste
        beschriftung="Patient:innen durchsuchen"
        suche={
          <form onSubmit={absenden} noValidate>
            <SearchField
              label={suchbeschriftung}
              placeholder="Name, Ort, Telefon, E-Mail"
              value={begriff}
              onChange={(wert) =>
                sucheInAdresse ? setzen('q', wert.trim() ? wert : null) : setLokalerBegriff(wert)
              }
            />
          </form>
        }
        ergebnis={
          data && data.length > 0 && eingeschraenkt
            ? `${sichtbar.length} von ${data.length}`
            : undefined
        }
      />
      <div className="mb-4 flex flex-col gap-3">
        <Segment<Sortierung>
          beschriftung="Sortieren"
          wahlen={SORTIERUNGEN}
          gewaehlt={sortierung}
          onWaehlen={(wert) => setzen('sort', wert === 'zuletzt' ? null : wert)}
        />
        {wahlen.length > 0 ? (
          <Filterchips<Zeigen>
            beschriftung="Zeigen"
            mehrfach={false}
            wahlen={wahlen.map((wahl) => ({
              wert: wahl.wert,
              text: `${wahl.text} (${wahl.anzahl})`,
            }))}
            gewaehlt={zeigen ? [zeigen] : []}
            onAendern={(gewaehlt) => setzen('zeigen', gewaehlt[0] ?? null)}
          />
        ) : null}
      </div>

      <Abfragezustand
        abfrage={abfrage}
        laden="Patientenliste wird geladen …"
        fehler="Die Patientenliste konnte nicht geladen werden."
        inKarte
        leer={{ wenn: (liste) => liste.length === 0, ...leer }}
      >
        {() =>
          sichtbar.length === 0 ? (
            <EmptyState inKarte title="Keine Treffer" description="Suche oder Auswahl anpassen." />
          ) : (
            <ListRows>
              {sichtbar.map((eintrag) => {
                const zeichen = merkmal(eintrag);
                const offen = eintrag.outstanding_cents ?? 0;
                return (
                  <ListRow
                    key={eintrag.id}
                    to={ziel(eintrag.id)}
                    // BEF-067: „Nachname, Vorname“, der Nachname hervorgehoben;
                    // am Telefon bricht der Name um, statt abgeschnitten zu werden.
                    titel={
                      <span className="wrap-anywhere">
                        {eintrag.family_name}
                        {eintrag.given_name ? (
                          <span className="font-normal">, {eintrag.given_name}</span>
                        ) : null}
                      </span>
                    }
                    meta={metaZeile(eintrag, heute)}
                    status={
                      zeichen ? (
                        <StatusMark ton={zeichen.ton}>{zeichen.text}</StatusMark>
                      ) : undefined
                    }
                    betrag={
                      eintrag.billing_visible && offen > 0 ? (
                        <span>
                          {formatEuro(offen)}
                          <span className="sr-only"> offen</span>
                        </span>
                      ) : undefined
                    }
                  />
                );
              })}
            </ListRows>
          )
        }
      </Abfragezustand>
    </>
  );
}
