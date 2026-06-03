# Puerto Rico — gra przeglądarkowa

Cyfrowa wersja gry planszowej _Puerto Rico_ (3. edycja, Lacerta), gra podstawowa, 3–5 graczy.

## Jak uruchomić lokalnie

### Wymagania

- Node.js ≥ 18 (sprawdź: `node -v`)
- npm (dołączony do Node.js)

### Pierwsze uruchomienie

```bash
npm install
```

### Uruchomienie dev-serwera

```bash
npm run dev
```

Otworzy się pod adresem **http://localhost:5173** — wpisz go w przeglądarce.

### Udostępnienie innym osobom w tej samej sieci (LAN / Wi-Fi)

```bash
npm run dev -- --host
```

Vite wypisze dwa adresy, np.:

```
Local:   http://localhost:5173/
Network: http://192.168.1.42:5173/
```

Adres `Network` wyślij znajomemu — pod warunkiem, że jesteście w tej samej sieci (ten sam router / Wi-Fi). Komputery na różnych sieciach nie mają do siebie dostępu tą metodą (do tego potrzebny byłby deployment na serwer publiczny).

### Budowanie wersji produkcyjnej (opcjonalnie)

```bash
npm run build:app    # buduje statyczne pliki do katalogu dist/
```

Pliki z `dist/` można wrzucić na dowolny hosting statyczny (GitHub Pages, Netlify, itp.).

---

## Zapis i wczytywanie gry

Kliknij **💾 Zapisz** w górnym pasku podczas gry. Stan zostaje zapisany w `localStorage` przeglądarki.

- Zapis **nie wygasa** — trzyma się dopóki ręcznie nie wyczyścisz danych strony w ustawieniach przeglądarki.
- Istnieje zawsze **jeden slot zapisu** (nowe nadpisuje poprzednie).
- Przy kolejnym wejściu na stronę pojawi się przycisk **Wczytaj zapisaną grę** z datą zapisu.

---

## Tryby gry

- **Człowiek** — sterowany przez gracza siedzącego przy klawiaturze (hot-seat)
- **Bot losowy** — wybiera losowy legalny ruch (🎲)
- **Bot inteligentny** — heurystyczny bot greedy, ocenia każdy ruch punktowo (🧠)

---

## Komendy deweloperskie

```bash
npm run dev          # dev-serwer z hot-reload
npm run dev -- --host  # dev-serwer dostępny w sieci LAN
npm run build:app    # build produkcyjny (Vite → dist/)
npm run check        # sprawdzenie typów TypeScript (tsc --noEmit)
npm run build        # kompilacja samego backendu TypeScript (tsc)
```

## Struktura projektu

```
/
├── src/                    # frontend React + Vite
│   ├── components/         # komponenty UI
│   ├── hooks/              # useGameRunner (integracja gry z Reactem)
│   ├── game/               # GameRunner, GameSerializer, etykiety akcji
│   ├── bots/               # RandomBot, GreedyBot
│   └── styles/             # global.css
├── core/                   # enumy, stałe, Result<T,E>
├── domain/                 # encje gry (Player, Island, Supply, Ship…)
│   └── buildings/catalog/  # konkretne klasy 23 budynków
├── state/                  # GameState, GameFactory
│   └── phases/             # 10 faz gry (RoleSelection, Mayor, Captain…)
└── actions/                # 11 klas akcji (Command pattern)
```
