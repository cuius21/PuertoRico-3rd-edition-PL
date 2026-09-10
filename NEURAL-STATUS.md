# Stan prac nad botami — 10 września 2026

Prace badawcze są zaparkowane na prośbę użytkownika. Nie uruchamiać kolejnych treningów ani turniejów bez wznowienia prac przez użytkownika. Celu potwierdzonej przewagi nad zamrożonym Hardcore nie osiągnięto.

## Wydana wersja

Na https://puerto-rico-3rd-edition.pages.dev/ jest testowana opcja Neural, jawnie oznaczona jako eksperymentalna. Sieć NN456active podpowiada ruchy w symulacjach wyboru ról, budowania, handlu i plantacji. Pamięć wyników sieci ogranicza koszt powtarzanych obliczeń. Dotychczasowy Hardcore pozostał niezmieniony. Neural działa w grze podstawowej dla 3 graczy; pozostałe konfiguracje używają Hardcore.

Przed publikacją: 407/407 testów, kontrola typów, build Pages, weryfikacja wszystkich plików wdrożenia oraz próba rozgrywki w przeglądarce. Szczegóły: [raport wdrożenia](reports/neural-policy/cloudflare-experimental-release-20260910.json). EXE i samodzielny HTML zostały wycofane z zakresu na prośbę użytkownika.

## Wyniki

Mały screening przy 24 iteracjach na decyzję: NN456active 10/18 zwycięstw, kontrola Hardcore 8/18, wariant reanalysis 7/18. Te 54 partie nie stanowiły dowodu przewagi.

Niezależny zamknięty test: dwie serie po 90 partii Neural przeciw dwóm Hardcore i 90 partii kontrolnych z samymi Hardcore. Łącznie 360 ukończonych legalnych partii, 60 niezależnych układów, rotacje wszystkich miejsc. Oba warianty miały miękki limit 650 ms na przeszukiwaną decyzję i maksymalnie 1500 iteracji.

Neural: 66/180 punktów za zwycięstwa (36,67%). Kontrolny Hardcore: 59,5/180 (33,06%). Remisy na pierwszym miejscu liczone proporcjonalnie. Różnica +3,61 pp, 95% przedział ufności od −6,67 do +13,61 pp (sparowany bootstrap całych grup układów). Średnia poprawa marginesu punktów +0,689. Obie serie były dodatnie, ale przedział obejmuje zero: przewaga pozostaje niepotwierdzona. Sieć wykonała 14 626 221 predykcji bez błędów.

Zachowane są [plan](reports/neural-policy/policy-active-cached-production-plan.json), [pierwsza seria](reports/neural-policy/policy-active-cached-confirm-650ms.json), [druga seria](reports/neural-policy/policy-active-cached-replication-650ms.json) oraz [wynik końcowy](reports/neural-policy/policy-active-cached-production-result.json). Nie dopisywać partii do zamkniętego testu aż do uzyskania istotności. Duże zbiory treningowe i wcześniejsze raporty pozostają lokalne; plan odwołuje się również do tych niepublikowanych plików.

## Czy osiągnięto sufit sieci?

Nie mamy dowodu osiągnięcia sufitu możliwości sieci neuronowych w tej grze. Nie ma też gwarancji, że dalszy trening poprawi siłę. Obecna polityka uczy się rozkładów wizyt przeszukiwania nauczyciela — najpierw Hardcore, potem ligi z udziałem wersji neuronowej. Mniejszy błąd na takich etykietach nie musi oznaczać większej szansy na zwycięstwo. Kolejne epoki na tych samych danych mogą tylko lepiej odtwarzać ograniczenia nauczyciela.

Przy ewentualnym powrocie warto zbadać całą pętlę uczenia: nowe partie przeciw różnym wcześniejszym wersjom, cele oceny oparte na końcowym wyniku oraz lepsze przeszukiwanie. Łączenie oceny wygranej, polityki ruchów, przeszukiwania i self-play sprawdziło się w AlphaGo Zero; nie stanowi to obietnicy wyniku w wieloosobowym Puerto Rico. [Opis metody przez autorów](https://deepmind.google/blog/alphago-zero-starting-from-scratch/).

Osobnym niewypróbowanym kierunkiem jest porównywanie kompletnych planów rozmieszczenia pracowników Burmistrza. [Archiwum prototypu](research/parked-mayor/README.md) pozostaje poza grą. Przeszedł tylko kontrolę typów; jego testów ani partii siły nie uruchomiono. Zebrano 36 pozycji z 9 partii kontrolnych Hardcore przy 24 iteracjach. Dane pozycji pozostają lokalne.

Przy wznowieniu najpierw sprawdzić poprawność prototypu, następnie wykonać osobny pilotaż i niezależne potwierdzenie przy takim samym budżecie namysłu jak Hardcore. Nową wersję określać jako mocniejszą dopiero po potwierdzeniu przewagi. Obecnie prace są wstrzymane decyzją użytkownika, niezależnie od wcześniejszych ograniczeń środowiska Windows.
