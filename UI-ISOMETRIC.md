# Interfejs izometryczny Puerto Rico

Nowa prezentacja zachowuje istniejący silnik, boty, zapisy i protokół LAN. Gra działa lokalnie w przeglądarce; Cloudflare udostępnia pliki aplikacji.

## Podział kodu

- `src/presentation/iso/projection.ts`: projekcja siatki i układ 12 pól plantacji oraz 12 miejsc miasta. Duże budynki zajmują dwa sąsiednie pola prezentacji; kluczem pozostaje identyfikator budynku.
- `adapter/buildSceneSnapshot.ts`: kopia publicznego stanu w postaci prostych danych. Nie kopiuje talii zakrytych plantacji ani nie wywołuje RNG.
- `renderer/WorldRenderer.ts`: PixiJS 8 / WebGL, kamera, grafika terenu, kolejność rysowania według wysokości podstawy obiektu i animacje. Działa na osobnym zegarze, maksymalnie 30 FPS.
- `interaction/actionBridge.ts`: klucz klikniętego obiektu → aktualne legalne akcje silnika. Kliknięcie przycisku ponownie wyszukuje obiekt Action w bieżącej liście. Nie tworzy własnych reguł.
- `ui/WorldGame.tsx`, `ui/WorldViewport.tsx`, `ui/world.css`: React, panel graczy, szczegóły, legalne ruchy, historia, ustawienia i cykl życia renderera.
- `assets/registry.ts`: nazwy i ramki grafik. Źródłowe pliki PNG są w `src/assets/isometric`.

GameScreen oraz MultiplayerGameScreen korzystają ze wspólnej prezentacji. Pozostają dotychczasowe useGameRunner, useMultiplayerGame, GameRunner, ServerGameRunner i GameSerializer. Zakończenie gry nadal korzysta z dotychczasowej tabeli wyników.

## Świat i obsługa

San Juan to wspólna wyspa: budynki i targ, plantacje do wyboru, magistrat oraz trzy statki. Włączenie dodatków pokazuje Festyn, Korsarza i szlachtę. Nowe budynki trafiają do wspólnego katalogu; kupione egzemplarze pojawiają się na wyspie właściciela.

Przyciski graczy przenoszą kamerę do odpowiednich wysp. Można przeciągać mapę, przybliżać kółkiem myszy, gestem dwóch palców lub przyciskami +/−. Wszystkie miejsca i obiekty są też dostępne przez przyciski HTML. Panel dostępnych ruchów zawsze zawiera pełną aktualną listę, niezależnie od otwartych szczegółów.

Animacje: fale, kołysanie palm i statków oraz chód robotników i szlachty. Trasa pracownika biegnie po wizualnej siatce; dotarcie do celu niczego nie uruchamia w silniku. Stan obsady obowiązuje od razu. Przełącznik „Animacje / Spokój” zapisuje tylko osobną preferencję interfejsu; domyślnie respektuje prefers-reduced-motion.

## Walidacja

- Kontrola TypeScript.
- 415 testów / 36 plików, w tym 8 testów granicy prezentacji: projekcja, duże budynki, 3–5 graczy i dodatki, brak mutacji/RNG, zgodność zapisu, odrzucenie nieaktualnych akcji i pełna deterministyczna partia bota z prezentacją oraz bez.
- Kontrola SHA-256 139 istniejących plików actions, core, domain, state, server, src/bots, src/game i src/hooks: bez zmian.
- Testy w przeglądarce: uruchomienie, zapis/odczyt, zakup, rozmieszczenie robotnika, ruchy botów, mapa i dodatki; sprawdzenie desktop/mobile i konsoli przed publikacją.

## Granice obecnej wersji

To renderer 2.5D ze sprite’ami, bez obracania kamery w pełnym 3D. Grafiki są wygenerowane i można je niezależnie zastępować w rejestrze. Sześć źródłowych PNG waży około 14 MB; pierwsze otwarcie mapy wymaga ich pobrania. Przy braku WebGL panel ruchów i szczegółów pozostaje dostępny.

Dalsze kosmetyczne ulepszenia (nowe animacje, bardziej szczegółowe brzegi, efekty zakupu i produkcji) można dodawać wewnątrz presentation bez trenowania botów lub zmiany zasad.
