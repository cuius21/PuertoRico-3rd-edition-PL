# Bieżąca praca — 12 września 2026

Użytkownik w nocy udzielił zgody na dalszą analizę, trening i symulacje Neurala dla 3/4/5 graczy; oczekiwał raportu rano. Raport początkowy: `reports/neural-multiplayer-20260912/raport.md`. Nie ma nowego potwierdzonego zwycięskiego modelu i niczego nie wdrożono.

## Aktywne obliczenia

- **Aktualny katalog: `work/neural-multiplayer-20260912/nightly-v2`**, nie nightly-v1.
- Uruchomiona sesja exec **24473**; Node: `tools/multiplayer-nightly.ts`.
- W `status.json` są aktualny etap i liczba ukończonych zadań; w `failure.json` ewentualny błąd. Brak failure.json jest normalny.
- Parametry: 36 gier na liczebność, trajektorie 64 iteracje, etykiety 512, do 6 próbek na każdą z 4 faz, 2 wątki, do 24 epok, pilot 4 rotacje/100 ms, potwierdzenie 10 rotacji/650 ms. Deadline **2026-09-12T15:40:00Z** (17:40 Warszawa).
- Polecenie: `node --import ./tools/register-typescript.mjs tools/multiplayer-nightly.ts --output work/neural-multiplayer-20260912/nightly-v2 --games-per-count 36 --trajectory-iterations 64 --teacher-iterations 512 --samples-per-phase 6 --workers 2 --epochs 24 --pilot-rotations 4 --pilot-budget 100 --confirm-rotations 10 --deadline 2026-09-12T15:40:00Z`
- Plan i hashe zamrożone przed startem. Nie edytować źródeł z planu podczas pracy. Nie uruchamiać drugiej kopii. Wznowienie tego samego planu wykorzystuje ukończone pliki; zmiana planu/źródeł wymaga nowego katalogu eksperymentu.

## Co jest ukończone

- 204 partie screeningu: `reports/neural-multiplayer-20260912/screening/result.json`; źródła potwierdzone po turnieju.
- 3 osoby: flatNeural 6/12, kontrola 3/12, obecny Neural 3/12. CI różnicy flatNeural [−16,67; +58,33] pp — sygnał, nie dowód. Flat heurystyczny 2/12.
- 4 osoby: kontrola i obecny Neural po 10/16, flat 4,5/16. 5 osób: kontrola i obecny Neural po 1/20, flat 5/20. Tylko 4 środowiska na liczebność; wyniki kontroli mocno niestabilne.
- Przy 4/5 obecny Neural wykonał zero wywołań sieci i miał identyczne traceHash jak Hardcore.
- 17 nowych testów; łącznie **506/506 w 44 plikach**, sprawdzenie typów aplikacji i nowych narzędzi.
- Techniczna próba w `pipeline-smoke`: 6 gier, etykiety, trzy treningi, 40 gier adapterów. Celowo przerwana przed całym turniejem; nie jest dowodem siły.
- Próba startu `nightly-v1` około 09:07 zatrzymała się natychmiast po przekroczeniu starego nocnego deadline. 0 gier w tym katalogu. Duża seria wystartowała dopiero rano jako v2 — w raporcie trzeba to powiedzieć wprost.

## Kolejna decyzja

Po zakończeniu właściwej serii odczytać modele, trening per liczebność, pilot i ewentualne potwierdzenie. Zaktualizować raport danymi rzeczywistymi. Po obiecującym screeningu warto niezależnie sprawdzić flatNeural dla 3 osób przy 650 ms; nie uruchamiać dodatkowych obciążających testów jednocześnie z głównymi turniejami mierzonymi czasem. Nie wydawać nowego bota bez potwierdzonej przewagi i testów przeglądarki.

Produkcja i modele w menu nie zmieniły się. Nowe moduły są w `src/bots/neural/multiplayer`, nowy 1-ply wyłącznie w `tools/experiments/RootRolloutBot.ts`. Zmienione lub nowe pliki dotyczą eksperymentu, nie reguł gry. Stary Hardcore i silnik mają zachowane hashe z `work/neural-multiplayer-20260912/frozen-source-hashes.json`.
