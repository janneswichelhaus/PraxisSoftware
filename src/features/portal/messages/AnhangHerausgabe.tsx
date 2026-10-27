import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { Section } from '@/components/ui/Section';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import {
  anhangDateiname,
  fetchAnhaengeZurHerausgabe,
  gibRueckfrageAnhangHeraus,
  kurzesDatum,
  type HerausgabeAnhang,
  type Verhaeltnisart,
} from './api';
import { zeitmarke } from './zeitmarke';

/**
 * Fotos und Videos an Rückfragen an die Person herausgeben (BEF-188,
 * ADR-017 Punkt 96).
 *
 * Wie die Fotos der Akte (`FotoHerausgabe`): auf der Seite der
 * Betroffenenrechte, nur für `owner`, je Anhang eine Kopie, jede
 * protokolliert - auch von einem gesperrten Anhang, solange er vorhanden ist.
 * An der Rückfrage selbst bleibt es beim Ansehen ohne Download (Punkt 54).
 * Verbindlich prüft die Datenbank. Keine Erfolgsmeldung ohne Erfolg (DAT-19):
 * Ob der Browser die Datei speichert, sieht die Seite nicht.
 */
function sichern(name: string, datei: Blob): void {
  const adresse = URL.createObjectURL(datei);
  const anker = document.createElement('a');
  anker.href = adresse;
  anker.download = name;
  anker.click();
  URL.revokeObjectURL(adresse);
}

function titel(a: HerausgabeAnhang, zeitzone: string): string {
  const art = a.media_kind === 'photo' ? 'Foto' : `Video, ${zeitmarke(a.duration_seconds ?? 0)}`;
  return `${art} vom ${kurzesDatum(a.taken_at, zeitzone)}`;
}

function Zeile({ anhang, zeitzone }: { anhang: HerausgabeAnhang; zeitzone: string }) {
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [erledigt, setErledigt] = useState(false);
  const beschriftung = titel(anhang, zeitzone);

  async function herausgeben() {
    setFehler(null);
    setLaeuft(true);
    try {
      sichern(anhangDateiname(anhang, zeitzone), await gibRueckfrageAnhangHeraus(anhang.id));
      setErledigt(true);
    } catch (ursache) {
      setFehler((ursache as Error).message);
    } finally {
      setLaeuft(false);
    }
  }

  return (
    <li className="border-line border-t py-3 first:border-t-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-ink text-liste min-w-0 font-medium wrap-anywhere">
          {beschriftung}
          <span className="text-ink-muted font-normal">
            {' '}
            · {anhang.author_kind === 'self' ? 'selbst' : 'rechtliche Vertretung'}
          </span>
          {/* Gesperrt oder abgelaufen heißt: nicht mehr für die Arbeit - für
              die Auskunft an die Person selbst bleibt es da (BEF-188). */}
          {anhang.locked ? <span className="text-ink-muted font-normal"> · gesperrt</span> : null}
        </p>
        <Button
          type="button"
          variant="secondary"
          groesse="kompakt"
          onClick={() => void herausgeben()}
          disabled={laeuft || anhang.object_missing}
        >
          {laeuft ? 'Wird heruntergeladen …' : 'Kopie für die Person herunterladen'}
          <span className="sr-only">: {beschriftung}</span>
        </Button>
      </div>
      {anhang.object_missing ? (
        <Statusmeldung ton="warnung" className="mt-2">
          Die Aufnahme fehlt in der Ablage; die Kopie kann sie nicht enthalten.
        </Statusmeldung>
      ) : null}
      {erledigt ? (
        <Statusmeldung className="mt-2">
          Kopie zum Speichern übergeben und protokolliert. Bitte prüfen, ob die Datei angekommen
          ist.
        </Statusmeldung>
      ) : null}
      {fehler ? (
        <Statusmeldung ton="fehler" className="mt-2">
          {fehler}
        </Statusmeldung>
      ) : null}
    </li>
  );
}

export function AnhangHerausgabe({
  art,
  verhaeltnisId,
  zeitzone = 'Europe/Berlin',
}: {
  art: Verhaeltnisart;
  verhaeltnisId: string;
  zeitzone?: string;
}) {
  const anhaenge = useQuery({
    queryKey: ['platform-messages', 'herausgabe', art, verhaeltnisId],
    queryFn: () => fetchAnhaengeZurHerausgabe(art, verhaeltnisId),
    retry: false,
  });

  return (
    <Section titel="Fotos und Videos an Rückfragen" rahmen>
      <Abfragezustand
        abfrage={anhaenge}
        laden="Fotos und Videos werden geladen …"
        fehler="Die Fotos und Videos konnten nicht geladen werden."
        leer={{
          wenn: (liste) => liste.length === 0,
          titel: 'Keine Fotos oder Videos',
          beschreibung: 'An den Rückfragen dieser Person hängt keine Aufnahme.',
        }}
      >
        {(liste) => (
          <ul className="flex flex-col">
            {liste.map((anhang) => (
              <Zeile key={anhang.id} anhang={anhang} zeitzone={zeitzone} />
            ))}
          </ul>
        )}
      </Abfragezustand>
    </Section>
  );
}
