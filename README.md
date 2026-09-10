# Puerto Rico — gra przeglądarkowa

Cyfrowa wersja gry planszowej _Puerto Rico_ (3. edycja, Lacerta), gra podstawowa, 3–5 graczy.

## Jak uruchomić lokalnie

### Wymagania

- Node.js ≥ 22.12 (sprawdź: `node -v`)
- npm (dołączony do Node.js)

### Pierwsze uruchomienie

```bash
cd files2
npm ci
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

- **Człowiek** — wspólna gra przy jednym ekranie.
- **Łatwy** — losowe legalne ruchy.
- **Trudny** — heurystyczna ocena ruchów.
- **AI** — przeszukiwanie MCTS.
- **Hardcore** — rozbudowane przeszukiwanie i heurystyki ekonomii gry.
- **Neural (eksperymentalny)** — sieć polityki ruchów wspiera symulacje MCTS. Dla podstawowej gry trzyosobowej; przy 4–5 graczach lub dodatkach korzysta z Hardcore. Przewaga nad Hardcore nie została potwierdzona.

Przy poziomach trudności są opisy pod ikoną pytajnika.

[Zagraj na Cloudflare](https://puerto-rico-3rd-edition.pages.dev/). Publikację opisuje [CLOUDFLARE.md](CLOUDFLARE.md). Push do GitHuba sam nie wdraża gry; służy do tego proces `npm run deploy`.

Rozwój botów został wstrzymany na prośbę użytkownika 10 września 2026. Wyniki i kierunki ewentualnego powrotu: [NEURAL-STATUS.md](NEURAL-STATUS.md).

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
files2/
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
