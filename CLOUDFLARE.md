# Puerto Rico na Cloudflare Pages

Adres produkcyjny: https://puerto-rico-3rd-edition.pages.dev/

Projekt: `puerto-rico-3rd-edition`, gałąź produkcyjna: `main`.
Osobny projekt Pages, publikowany bezpośrednio przez Wrangler. Źródła pozostają
w tym katalogu; nie jest wymagane repozytorium GitHub. Projekt Wojny o Pierścień
ma własną konfigurację i nie jest zmieniany podczas publikacji Puerto Rico.

Aktualna strona jest publiczna. Obsługuje boty oraz grę kilku osób przy jednym
ekranie. Zapis partii jest lokalny dla przeglądarki i tej domeny. Dotychczasowy
tryb LAN korzysta z oddzielnego serwera Node/WebSocket; przycisk LAN jest
ukryty wyłącznie w wersji Pages, ponieważ sam hosting statyczny go nie obsługuje.

Po ukończeniu zmian gry, z katalogu projektu uruchom:

```powershell
npm run deploy
```

To polecenie sprawdza typy, uruchamia testy, buduje `dist-pages`, publikuje na
produkcję i porównuje wersję oraz skróty plików udostępnianych przez Cloudflare
z lokalnym buildem. Przerywa przy błędzie dowolnego kroku. Zawsze wdrażana jest
jawnie gałąź `main`, dzięki czemu aktualizacja trafia pod główny adres strony.
Po publikacji należy również sprawdzić menu, opisy botów i wykonanie ruchu
Hardcore w przeglądarce. Gdy propagacja chwilowo opóźnia weryfikację, ponów
`npm run pages:verify`; nie trzeba ponownie wysyłać tych samych plików.

Jest to publikacja po zakończeniu zadania, nie proces śledzący każde zapisanie
pliku w edytorze. Zasada wykonywania wdrożenia po kolejnych zmianach gry jest
zapisana w `AGENTS.md`. Pojedyncze kroki są również dostępne osobno:

```powershell
npm run check
npm test
npm run build:pages
npm run pages:upload
npm run pages:verify
```

Skrypt publikacji korzysta z lokalnego logowania Wrangler i potrafi odświeżyć
jego sesję; w razie wygaśnięcia tokenu odświeżającego uruchom `npx wrangler login`.
Żaden token nie jest zapisany w źródłach projektu.
Logi wdrożeń pozostają w `.hardcore-work/cloudflare`. Do serwera wysyłany jest
wyłącznie `dist-pages`: HTML, skompilowany JavaScript, CSS, publiczny identyfikator
wersji i reguły pamięci podręcznej. Dane treningowe, raporty, kopie zapasowe i EXE
pozostają na komputerze.

Strona startowa wymaga ponownej walidacji pamięci podręcznej, a pliki JS/CSS
mają nazwy zależne od treści. Umożliwia to pobieranie nowych wersji po wdrożeniu.
Już otwarta partia korzysta ze swojej wczytanej wersji do czasu odświeżenia.

Wersje lokalne buduje się oddzielnie: `npm run build:html` tworzy samodzielny
HTML, a wariant Electron korzysta z `npm run build:app`. Publikacja Pages nie
zastępuje plików lokalnej dystrybucji.
