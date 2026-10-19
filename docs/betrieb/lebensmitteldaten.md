# Lebensmitteldaten: Lizenzen und Import

Stand 2026-10-19 (ERN-004, ADR-027 Punkte 7 und 8, ANN-656 bis ANN-659). Eine Betriebsaufgabe:
Die Anwendung fragt zur Laufzeit keinen fremden Dienst nach einem Lebensmittel; der Katalog liegt in
der eigenen Datenbank (`public.food_catalog`).

## Nutzungsbedingungen (vor dem Import geprüft)

| Quelle                                               | Lizenz                                                                     | Was sie verlangt                                                                                                                                                                                   | Wo erfüllt                                                          |
| ---------------------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Bundeslebensmittelschlüssel 4.0, Max Rubner-Institut | CC BY 4.0, seit 2025-12-16 lizenzkostenfrei                                | Nennung „Max Rubner-Institut (2025): Bundeslebensmittelschlüssel (BLS), Version 4.0 – Deutsche Nährstoffdatenbank. Karlsruhe. DOI: 10.25826/Data20251217-134202-0“, Lizenz, Hinweis auf Änderungen | `public.food_sources.attribution`, in der Anwendung unter „Quellen“ |
| Open Food Facts                                      | Open Database License 1.0 (ODbL); Bilder CC BY-SA, werden nicht übernommen | Nennung und Lizenz; Weitergabe eines abgeleiteten Datenbestands nur unter ODbL                                                                                                                     | wie oben; unser Auszug wird nicht weitergegeben                     |

Geprüft am 2026-10-19 über blsdb.de (Download, FAQ), mri.bund.de und opendatacommons.org. Die
rechtliche Bestätigung steht im Prüfpaket (ANN-657). Ändert eine Quelle ihre Bedingungen, wird
diese Tabelle und `food_sources` per Migration angepasst, bevor neu importiert wird.

## Import

Nur im Betrieb, gegen die Datenbank der jeweiligen Umgebung als `postgres`. Die Skripte brauchen
keine weiteren Abhängigkeiten.

```bash
# BLS: das ZIP von https://www.blsdb.de/download (BLS_4_0_2025_DE.zip)
node scripts/lebensmittel/bls.mjs BLS_4_0_2025_DE.zip > bls.ndjson
DATABASE_URL=postgresql://… node scripts/lebensmittel/laden.mjs bls 4.0 bls.ndjson

# Open Food Facts: der CSV-Export, gefiltert auf in Deutschland verkaufte Produkte
curl -O https://static.openfoodfacts.org/data/en.openfoodfacts.org.products.csv.gz
node scripts/lebensmittel/off.mjs en.openfoodfacts.org.products.csv.gz > off.ndjson
DATABASE_URL=postgresql://… node scripts/lebensmittel/laden.mjs off 2026-10 off.ndjson
```

- Die Umwandler melden auf stderr, wie viele Zeilen sie gelesen, übernommen und mit welchem Grund
  übersprungen haben. Eine unerwartete Einheit im BLS bricht ab.
- `laden.mjs` lädt in einer Transaktion. Was im neuen Stand fehlt, wird zurückgezogen
  (`retired_at`), nicht gelöscht. Stand und Anzahl stehen danach an der Quelle.
- Portionen für allgemeine Lebensmittel kommen aus `scripts/lebensmittel/portionen.json`
  (Startinhalt, pflegbar); Marken bringen die Portion der Verpackung mit.
- Rhythmus für Open Food Facts: vierteljährlich (OPS-001); der BLS bei einer neuen Version.

## Seed

Lokal, in der CI und in der Test-Umgebung steht ein **synthetischer** Katalog (`supabase/seed.sql`,
Stand „Seed synthetisch“): keine Daten des BLS und keine von Open Food Facts. Der echte Import
zieht ihn über den Stand zurück.
