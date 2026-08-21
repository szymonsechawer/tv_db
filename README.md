# tv_db_

Prosta aplikacja PWA (Progressive Web App) do prowadzenia własnej bazy
obejrzanych/oglądanych filmów i seriali: statusy, oceny, tagi, postęp
odcinków, notatki, statystyki oraz integracja z TMDb (The Movie Database)
do automatycznego pobierania czasów trwania, opisów i nazw odcinków.

Aplikacja działa w całości w przeglądarce — dane trzymane są lokalnie
(localStorage) i/lub w pliku JSON, który można otworzyć/zapisać ręcznie.
Nie wymaga backendu ani procesu budowania (brak bundlera, brak `npm install`).

## Struktura projektu

```
index.html              punkt wejścia — tylko znaczniki HTML
css/
  styles.css             wszystkie style aplikacji
js/
  config.js               stałe aplikacji i globalny stan
  utils.js                funkcje pomocnicze (formatowanie, daty, notatki)
  storage.js               zapis/odczyt bazy (localStorage + plik JSON)
  tmdb.js                  integracja z API TMDb
  dialogs.js               generyczne okna modalne (alert/confirm/prompt)
  tables.js                renderowanie tabel filmów/seriali/nadchodzących
  item-dialog.js           okno podglądu i edycji pozycji (film/serial)
  notes.js                 zakładka notatek
  search.js                pasek wyszukiwania i podpowiedzi tagów
  stats.js                 zakładka statystyk
  settings.js              zakładka ustawień, aktualizacje aplikacji/danych
  tabs.js                  przełączanie zakładek
  main.js                  logika dodawania/edycji/usuwania + start aplikacji
icons/                    ikony PWA i przycisków
manifest.webmanifest      manifest PWA
service-worker.js         cache "app shell" na potrzeby trybu offline
```

Pliki w katalogu `js/` są zwykłymi skryptami (bez modułów ES/bundlera) —
`index.html` ładuje je w kolejności zależności poprzez osobne znaczniki
`<script src="...">`. Kolejność ma znaczenie tylko dla `main.js`, który
musi być wczytany jako ostatni, bo zawiera wywołania startowe aplikacji.

## Uruchomienie

To statyczna aplikacja — wystarczy otworzyć `index.html` w przeglądarce
albo wystawić katalog przez dowolny serwer plików statycznych (np. GitHub
Pages, jak w oryginalnej konfiguracji w `.github/workflows/`).

## TMDb

Aby korzystać z automatycznego pobierania czasów trwania, opisów i nazw
odcinków, w zakładce Ustawienia trzeba podać własny klucz API TMDb
(API Key v3 lub token v4). Klucz zapisywany jest lokalnie w przeglądarce
oraz w pliku bazy danych.
