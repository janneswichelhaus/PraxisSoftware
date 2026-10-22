import { useEffect, useState, type ReactNode } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { Disclosure } from '@/components/ui/Card';
import { Dialogfenster } from '@/components/ui/Dialogfenster';
import { DetailList, DetailRow } from '@/components/ui/DetailList';
import { Filterleiste } from '@/components/ui/Filterleiste';
import { Kleingedrucktes } from '@/components/ui/Kleingedrucktes';
import { Listenabschnitt } from '@/components/ui/Listenabschnitt';
import { ListRow } from '@/components/ui/ListRow';
import { SearchField } from '@/components/ui/SearchField';
import { Section } from '@/components/ui/Section';
import { Textlink } from '@/components/ui/Textlink';
import {
  bezug,
  eigeneFiltern,
  energieFuer,
  gramm,
  MINDESTLAENGE,
  portionText,
  QUELLENNAME,
  suchschluessel,
  trefferMeta,
  type Lebensmittel,
  type Quelle,
} from './lebensmittel';
import { zahl } from './texte';

/**
 * Lebensmittel suchen und nachschlagen (ERN-EPIC-002) - für Beratung und
 * Plattform; das Tagebuch (ERN-EPIC-003) nutzt dieselbe Suche.
 *
 * Gesucht wird nach einer kurzen Pause im Tippen am Server; eigene
 * Lebensmittel der Person stehen gefiltert darüber. Ein Tipp auf einen
 * Treffer zeigt die Nährwerte je 100 g bzw. ml und die Portionen. Keine
 * Bewertung eines Lebensmittels (ADR-006 Punkt 14).
 */
/** Der letzte Begriff je Suche, nur im Arbeitsspeicher dieses Tabs. */
const LETZTER_BEGRIFF = new Map<string, string>();

export function LebensmittelSuche({
  suchen,
  schluessel,
  eigene = [],
  ohneBegriff,
  detailAktion,
  fensterInhalt,
  ohneZahlen = false,
}: {
  suchen: (begriff: string) => Promise<Lebensmittel[]>;
  /** Anfang des Abfrageschlüssels; der Begriff kommt dazu. */
  schluessel: readonly unknown[];
  /** Eigene Lebensmittel der Person, aus ihrem Profil. */
  eigene?: readonly Lebensmittel[];
  /**
   * Was ohne Suchbegriff unter dem Feld steht; als Funktion mit dem Weg, ein
   * Lebensmittel im Fenster zu öffnen (etwa „zuletzt“ im Tagebuch).
   */
  ohneBegriff?: ReactNode | ((oeffnen: (f: Lebensmittel) => void) => ReactNode);
  /** Ein Knopf im Fenster eines Treffers, etwa „Bearbeiten“. */
  detailAktion?: (f: Lebensmittel) => ReactNode;
  /** Statt der Nährwerte ein eigener Inhalt im Fenster, etwa die Menge (ERN-007). */
  fensterInhalt?: (f: Lebensmittel, schliessen: () => void) => ReactNode;
  /** „Zahlen ausblenden“ der Person (ADR-027 Punkt 11): Treffer ohne Energie. */
  ohneZahlen?: boolean;
}) {
  // Der Begriff bleibt im Arbeitsspeicher, nie in der Adresse (ADR-011,
  // ADR-027 Punkt 8: er verriete, was eine Person isst). Zurück aus einem
  // Lebensmittel findet die Treffer wieder; Neuladen beginnt leer.
  const ablage = JSON.stringify(schluessel);
  const [eingabe, setEingabe] = useState(() => LETZTER_BEGRIFF.get(ablage) ?? '');
  const begriff = useVerzoegert(eingabe.trim(), 250);
  useEffect(() => {
    LETZTER_BEGRIFF.set(ablage, begriff);
  }, [ablage, begriff]);
  const [offen, setOffen] = useState<Lebensmittel | null>(null);
  const aktiv = suchschluessel(begriff).length >= MINDESTLAENGE;
  const abfrage = useQuery({
    queryKey: [...schluessel, 'suche', begriff],
    queryFn: () => suchen(begriff),
    enabled: aktiv,
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000,
  });
  const passende = aktiv ? eigeneFiltern(eigene, begriff) : [];

  return (
    <>
      <Filterleiste
        beschriftung="Lebensmittelsuche"
        suche={
          <SearchField
            label="Lebensmittel suchen"
            placeholder="etwa Haferflocken"
            maxLength={100}
            value={eingabe}
            onChange={setEingabe}
          />
        }
      />
      {!aktiv ? (
        typeof ohneBegriff === 'function' ? (
          ohneBegriff(setOffen)
        ) : (
          ohneBegriff
        )
      ) : (
        <div className="flex flex-col gap-8 [&>*]:mt-0">
          {passende.length > 0 ? (
            <Listenabschnitt titel="Eigene" anzahl={passende.length}>
              {passende.map((f) => (
                <Trefferzeile key={f.id} f={f} onOeffnen={setOffen} ohneZahlen={ohneZahlen} />
              ))}
            </Listenabschnitt>
          ) : null}
          <Abfragezustand
            abfrage={abfrage}
            laden="Es wird gesucht …"
            fehler="Die Suche hat nicht geklappt."
            inKarte
            leer={{
              wenn: (treffer) => treffer.length === 0,
              titel: `Nichts gefunden für „${begriff}“.`,
            }}
          >
            {(treffer) => (
              <Listenabschnitt titel="Treffer" anzahl={treffer.length}>
                {treffer.map((f) => (
                  <Trefferzeile
                    key={`${f.kind}-${f.id}`}
                    f={f}
                    onOeffnen={setOffen}
                    ohneZahlen={ohneZahlen}
                  />
                ))}
              </Listenabschnitt>
            )}
          </Abfragezustand>
        </div>
      )}
      {offen ? (
        <Dialogfenster
          titel={offen.name}
          beschreibung={[offen.brand, QUELLENNAME[offen.source]].filter(Boolean).join(' · ')}
          onSchliessen={() => setOffen(null)}
        >
          {fensterInhalt ? (
            fensterInhalt(offen, () => setOffen(null))
          ) : (
            <>
              <LebensmittelDetail f={offen} />
              {detailAktion ? <div className="mt-6">{detailAktion(offen)}</div> : null}
            </>
          )}
        </Dialogfenster>
      ) : null}
    </>
  );
}

export function Trefferzeile({
  f,
  onOeffnen,
  to,
  ohneZahlen = false,
}: {
  f: Lebensmittel;
  onOeffnen?: (f: Lebensmittel) => void;
  to?: string;
  ohneZahlen?: boolean;
}) {
  return (
    <ListRow
      titel={f.name}
      meta={trefferMeta(f, ohneZahlen)}
      {...(to ? { to } : { onClick: () => onOeffnen?.(f) })}
    />
  );
}

/** Die Nährwerte je 100 g bzw. ml und die Portionen mit ihrer Energie. */
export function LebensmittelDetail({ f }: { f: Lebensmittel }) {
  const n = f.per_100;
  return (
    <div className="flex flex-col gap-6">
      <Section titel={`Je ${bezug(f.base_unit)}`} ebene={3}>
        <DetailList>
          <DetailRow label="Energie">{`${zahl(n.energy_kcal)} kcal`}</DetailRow>
          <DetailRow label="Eiweiß">{gramm(n.protein_g)}</DetailRow>
          <DetailRow label="Fett">{gramm(n.fat_g)}</DetailRow>
          {n.saturated_fat_g !== null ? (
            <DetailRow label="davon gesättigte Fettsäuren">{gramm(n.saturated_fat_g)}</DetailRow>
          ) : null}
          <DetailRow label="Kohlenhydrate">{gramm(n.carbohydrate_g)}</DetailRow>
          {n.sugar_g !== null ? (
            <DetailRow label="davon Zucker">{gramm(n.sugar_g)}</DetailRow>
          ) : null}
          {n.fibre_g !== null ? (
            <DetailRow label="Ballaststoffe">{gramm(n.fibre_g)}</DetailRow>
          ) : null}
          {n.salt_g !== null ? <DetailRow label="Salz">{gramm(n.salt_g, 2)}</DetailRow> : null}
        </DetailList>
      </Section>
      {f.portions.length > 0 ? (
        <Listenabschnitt titel="Portionen" ebene={3} rahmen={false}>
          {f.portions.map((p) => (
            <ListRow
              key={p.label}
              titel={portionText(p, f.base_unit)}
              betrag={`${zahl(energieFuer(f, p.amount))} kcal`}
            />
          ))}
        </Listenabschnitt>
      ) : null}
    </div>
  );
}

/**
 * Die Quellenangabe, die BLS (CC BY 4.0) und Open Food Facts (ODbL) verlangen
 * (ANN-657): je Quelle Titel und Lizenz sichtbar, die volle Zitierung mit DOI,
 * dem Hinweis auf Änderungen und dem Lizenztext auf Abruf (DESIGN.md Regel 6).
 *
 * Einmal (DR-146): Titel und Lizenz sind der Kopf des Aufklappers. Bis dahin
 * stand dieselbe Zeile als Kleingedrucktes und darunter noch ein Aufklapper
 * „Quellenangabe“ mit denselben Namen.
 */
export function Quellenangabe({ laden }: { laden: () => Promise<Quelle[]> }) {
  const { data } = useQuery({
    queryKey: ['lebensmittel', 'quellen'],
    queryFn: laden,
    staleTime: 60 * 60_000,
  });
  if (!data || data.length === 0) return null;
  return (
    <div className="mt-8">
      <Disclosure
        summary={`Nährwerte: ${data.map((q) => `${q.title} (${q.license})`).join(' · ')}`}
      >
        {data.map((q) => (
          <Kleingedrucktes key={q.source} className="mb-2">
            {q.attribution}
            {q.version ? ` Stand: ${q.version}.` : ''}{' '}
            <Textlink href={q.license_url} target="_blank" rel="noreferrer">
              Lizenz im Wortlaut
            </Textlink>
          </Kleingedrucktes>
        ))}
      </Disclosure>
    </div>
  );
}

/** Der Wert, wenn er sich `ms` lang nicht geändert hat. */
function useVerzoegert<T>(wert: T, ms: number): T {
  const [stand, setStand] = useState(wert);
  useEffect(() => {
    const zeit = setTimeout(() => setStand(wert), ms);
    return () => clearTimeout(zeit);
  }, [wert, ms]);
  return stand;
}
