# Neural dla 3, 4 i 5 graczy — analiza i rozwój

Stan poranny, 12 września 2026. **Nie ma jeszcze potwierdzonego następcy Hardcore.** Kod obsługi sieci dla 3–5 graczy i nowa ścieżka treningowa działają eksperymentalnie. Produkcyjny bot, silnik i modele na Cloudflare pozostają niezmienione.

## Co ograniczało obecną wersję

1. **Brak obsługi 4–5 graczy był rzeczywisty.** `NeuralBot` sprawdza `supportsNeuralState`; w tych wariantach wybiera dokładnego Hardcore. Dotychczasowy zapis ma trzy wyspy i nie zawiera kart Poszukiwacza. W grze pięcioosobowej trzeba rozróżnić dwie takie karty, również ich osobne monety.
2. **Wersja w menu uczyła polityki, ale nie używała wyuczonej oceny pozycji.** Sieć wskazuje priorytety i ruchy podczas symulacji w czterech fazach. Po horyzoncie dwóch rund wynik ocenia `evaluateHardcoreState`; `evaluatorWeight` wynosi zero. Robotników rozmieszcza dotychczasowy algorytm.
3. **Nauczyciel nie był wystarczająco wyraźnie mocniejszy od przeciwnika.** Stare etykiety pochodzą głównie z 96 iteracji. W wielu pozycjach najlepsze ruchy dzieliło niewiele wizyt. Podniesienie wizyt do czwartej potęgi wyostrza odpowiedź, lecz nie poprawia samej analizy. Starsza ponowna analiza 384×2 poprawiła stabilność części etykiet, ale obejmowała tylko 318 pozycji i sama nie przyniosła dowodu silniejszej gry.
4. **Trener polityki pomijał zapisane oceny alternatyw i wyniki partii.** Uczył się rozkładu wizyt, a nie bezpośrednio poprawki do wyboru ruchu z jego ocen Q ani zwycięzcy. Samo dopisanie epok do tych samych danych nie rozwiązuje tego ograniczenia.
5. **Koszt sieci to głównie przygotowanie jej wejścia.** W starym profilu sama warstwa neuronowa zajmowała około 39 µs, cała polityka około 427 µs. Najpierw warto ograniczać powtarzane odczyty i kosztowne obliczanie priorytetów; większa sieć nie jest automatycznie lepszym wydatkiem czasu.

Ostatni wcześniejszy pełny test wersji z cache obejmował 180 partii kandydata i 180 kontroli przy 650 ms. Uzyskano 66/180 kredytu zwycięstwa wobec 59,5/180: różnica +3,61 punktu procentowego, przedział 95% [−6,67; +13,61]. Wynik nie potwierdził przewagi. Źródło: `reports/neural-policy/policy-active-cached-production-result.json`.

## Nowe porównanie: MCTS czy przeszukiwanie tylko pierwszej decyzji

Ukończono **204 partie**; dwa wątki, limit 24 symulacji, cztery nowe losowania na każdą liczbę graczy i pełna rotacja miejsc. To mały screening, a nie test siły przy docelowych 650 ms. Przed uruchomieniem zapisano konfigurację i skróty źródeł; po zakończeniu wszystkie zgadzały się z planem.

| Graczy | Hardcore — kontrola | Obecny Neural | MCTS z mniejszą losowością | 1-ply z heurystyką | 1-ply z obecną siecią |
|---|---:|---:|---:|---:|---:|
| 3 | 3/12 | 3/12 | 2/12 | 2/12 | **6/12** |
| 4 | 10/16 | 10/16 | 5/16 | 4,5/16 | nieobsługiwany stary model |
| 5 | 1/20 | 1/20 | 2/20 | 5/20 | nieobsługiwany stary model |

Licznik oznacza udział w zwycięstwach, dzielony przy remisie. Każdy wariant gra przeciw pozostałym niezmienionym Hardcore. Wariant MCTS z mniejszą losowością używa Championa, który również usuwa identyczne akcje budowania; porównanie z kontrolą nie izoluje samej losowości. Wyjątkowo wysoki wynik kontroli przy 4 osobach i niski przy 5 pokazują, dlaczego nie wolno wnioskować z samych tych małych próbek. Wynik 1-ply + sieć przy 3 osobach ma różnicę +25 pp, lecz przedział 95% [−16,67; +58,33] nadal obejmuje zero. Dla 4–5 graczy przebiegi obecnego Neurala i kontroli były identyczne, a wywołań sieci było zero.

**1-ply nie oznacza tutaj oceny natychmiast po jednej akcji.** Rozgałęziamy tylko bieżący wybór, następnie symulujemy jego dalsze skutki do tego samego horyzontu rund co MCTS. Wszystkie alternatywy w kompletnym bloku dostają wspólne ziarno losowania i po jednej próbce; niekompletnego bloku nie używamy do rankingu. Pozostali gracze nadal wykonują swoje działania. Wybieramy średnią ocenę ruchu, bez rozbudowywania głębszego drzewa. To osobna metoda przeszukiwania; self-play jest sposobem tworzenia danych treningowych, więc oba pojęcia nie są zamienne.

Wniosek: warto dalej sprawdzić **1-ply + sieć dla 3 osób przy równym czasie**. Nie ma podstaw do zastępowania MCTS we wszystkich konfiguracjach. Przy 4 osobach prosty wariant 1-ply w tej próbie był gorszy.

Wyniki, partie i plan: `reports/neural-multiplayer-20260912/screening/`. Zamrożona wersja sterownika z momentu badania: `work/neural-multiplayer-20260912/screening-driver-frozen.ts`. Po badaniu poprawiono w aktualnym sterowniku wyłącznie odczyt metadanych przez publiczny interfejs oraz jawne typy opcji dodatków; wcześniejsze raporty zachowują oryginalne hashe.

## Co zostało zaimplementowane

- Osobny schemat **543 cech publicznych**: do pięciu wysp w kolejności względem gracza, maski nieobecnych miejsc, liczba graczy, pojemności statków oraz osobne karty Poszukiwacza.
- Polityka **543 → 64 → 101 rodzajów akcji**, z normalizacją tylko wśród legalnych ruchów. Przenoszenie starych wag odbywa się po nazwach cech i akcji. Nowe wejścia zaczynają z wagą zero, a nowy optymalizator zaczyna od początku. Testy potwierdzają zachowanie starych przewidywań dla 3 osób przed dalszą nauką.
- Oddzielna sieć wartości: wspólny model dla kolejnych perspektyw graczy i rozkład zwycięstwa o długości 3, 4 lub 5. Uczy korekty istniejącej oceny na podstawie rzeczywistych końcowych zwycięzców; remisy zachowują ułamkowy udział.
- Eksperymentalny adapter faktycznie wywołujący politykę i opcjonalną sieć wartości przy każdej liczbie graczy. Nie jest podłączony do fabryki botów w menu.
- Zapisywanie pełnych trajektorii, próbek stanu, źródeł, rozkładów wizyt, ocen Q oraz wyników końcowych. Ponowna analiza nie modyfikuje zapisanej pozycji. Dane są dzielone całymi partiami i osobno dla każdej liczby graczy.
- Dwa oddzielne treningi polityki: dotychczasowy cel oparty na wizytach oraz cel oparty na ocenach alternatyw Q. Sieć wartości jest trzecią ablacją. To porównanie hipotez, nie deklaracja, że Q musi być lepsze.
- Wznawialny sterownik pracy z zapisem każdej ukończonej partii i kontrolą niezmienności kodu. Modele i eksperymenty mają osobne formaty; stara wersja nie może przypadkowo załadować nowych wag.

Sprawdzenie typów aplikacji i nowych narzędzi zakończyło się powodzeniem. **506 testów w 44 plikach przechodzi**, w tym 17 nowych testów obsługi 3–5 graczy, przenoszenia wag, uczenia nowych akcji, sieci wartości, legalności i braku mutacji. Techniczna próba całego przepływu ukończyła 6 partii, ich analizę, trzy treningi oraz 40 krótkich gier testujących różne adaptery. Próbę przerwano świadomie przed pełnym turniejem; jej maleńkie modele nie są kandydatami do wydania.

## Właściwa seria treningowa — stan i plan

Duża seria **nie rozpoczęła się przed końcem nocnego okna**. Pierwsze uruchomienie rano rozpoznało przekroczony termin i bezpiecznie zatrzymało się z zerem nowych partii. Ten fakt pozostaje zapisany w `nightly-v1/status.json`. Nie należy zaliczać planowanych gier do wykonanych.

Około 09:08 czasu Warszawy uruchomiono dalszą pracę w **`nightly-v2`**:

1. 108 nowych pełnych partii — po 36 dla 3, 4 i 5 graczy; Hardcore po 64 iteracje generuje trajektorie.
2. Do 24 pozycji z partii, równomiernie między czterema aktywnymi fazami. Każda dostaje niezależną analizę Championa po 512 iteracji, z niezmienioną oceną Hardcore. To mocniejsza analiza stanów, a nie 108 partii rozegranych w całości po 512 iteracji.
3. Dwie polityki oraz korekcyjna sieć wartości, do 24 epok z early stopping. Wspólny model uczy się wszystkich liczebności; jakość raportujemy osobno dla każdej z nich.
4. Pilot przy jednakowym limicie 100 ms: kontrola, przeniesiona stara polityka, nowa polityka wizyt, polityka Q i polityka wizyt z wartością. Cztery pełne rotacje na konfigurację — łącznie 240 partii.
5. Wybrany według zapisanej reguły wariant, jeśli pokona kontrolę w pilocie, trafia do osobnego porównania przy 650 ms i nowych losowaniach. Po dziesięć rotacji daje 30/40/50 gier na ramię. Wynik nie jest podstawą automatycznego wdrożenia; potrzebne są ocena niepewności i potwierdzenie zakresu.

Nowy limit uruchamiania pracy: 17:40 czasu Warszawy. Już rozpoczęte gry kończą się poprawnie. Aktualny stan należy odczytać z `work/neural-multiplayer-20260912/nightly-v2/status.json`; jeśli obliczenia zakończą się wcześniej, zostanie tam zapisany wynik. Limit chroni przed niekontrolowanym ciągłym obciążeniem; można wznowić kolejny etap na podstawie artefaktów.

## Kolejność dalszych decyzji

1. Najpierw ocenić jakość mocniejszych etykiet i wyniki trzech nowych sieci, osobno dla 3/4/5 graczy.
2. Równolegle koncepcyjnie zachować MCTS jako punkt odniesienia, a obiecujące 1-ply + sieć sprawdzić na nowych ziarnach i przy tym samym czasie. Nie mieszać jednocześnie zmian przeszukiwania, ocen i robotników w jednej nieczytelnej próbie.
3. Po wybraniu działającej polityki generować następną ligę z nowym modelem, Hardcore i starszymi modelami. Nowe wyniki muszą wracać do treningu wartości, a mocniejsze przeszukiwanie dostarczać politykę. To właściwa pętla dalszego self-play.
4. Dopiero po wykazaniu słabości konkretnej fazy poprawiać heurystykę robotników, handlu czy statków jako osobny wariant. Zwiększenie warstwy sieci i wydłużenie rolloutów mają niższy priorytet od jakości danych i rankingu legalnych ruchów.
5. Za sukces uznać powtarzalną przewagę przy porównywalnym czasie dla każdej liczby graczy. Naturalny udział jednego z równych graczy w zwycięstwach wynosi około 1/3, 1/4 i 1/5; wygranie ponad połowy wszystkich gier przeciw kilku równoczesnym Hardcore byłoby znacznie silniejszym wymaganiem. Dodatki pozostają osobnym zakresem do nauki i weryfikacji.

Nie ma podstaw, aby ogłaszać sufit tej metody. Nie ma też gwarancji, że samo dłuższe trenowanie obecnych wag da przewagę. Najważniejsze zmiany to pełny opis pozycji dla 3–5 graczy, mocniejsze etykiety i połączenie uczenia decyzji z wynikiem partii.

## Odniesienia metodyczne

Połączenie polityki, wartości i przeszukiwania uczonych w self-play jest opisane w pracy autorów [AlphaZero](https://arxiv.org/abs/1712.01815). Puerto Rico jest grą wieloosobową z częściowo ukrytym losowaniem, dlatego nie przenosimy automatycznie gwarancji lub wyników z szachów.

[Policy improvement by planning with Gumbel](https://openreview.net/pdf?id=bERaNdoegnO) analizuje poprawę polityki przy małej liczbie symulacji. Może inspirować późniejszy wybór gałęzi, lecz nasz obecny eksperyment 1-ply nie implementuje Gumbel AlphaZero i nie dziedziczy jego gwarancji.


## Aktualizacja 12 września, 10:00 Warszawa

Ukończono wszystkie 108/108 partii przygotowujących dane, po 36 dla 3, 4 i 5 graczy. To o 76 więcej niż w ostatnim raporcie (32/108). Wszystkie zakończyły się prawidłowo. Trwa ponowna analiza wybranych pozycji po 512 symulacji: ukończono zestawy z 12/108 partii, czyli 282/2562 pozycji. Zweryfikowano zgodność źródeł i pochodzenie dotychczasowych etykiet; nie ma zapisanego błędu procesu. Następny krok po zakończeniu analizy: dwa treningi polityki ruchów oraz trening sieci wartości, następnie niezależne turnieje. To nadal przygotowanie modeli, a nie nowy wynik przewagi nad Hardcore.


## Aktualizacja 12 września, 10:30 Warszawa

Analiza 512-iteracyjna obejmuje już 88/108 ukończonych zestawów partii: 2088/2562 pozycji (81%). Od ostatniego raportu przybyło 76 zestawów i 1806 pozycji. Wszystkie 108 partii źródłowych są ukończone. Sprawdzono skróty zamrożonych źródeł, pochodzenie etykiet, kompletność budżetu i poprawność rozkładów treningowych. Brak błędu procesu. Po zakończeniu tej analizy sterownik przejdzie do treningu; nowe wyniki siły gry jeszcze nie powstały.


## Aktualizacja 12 września, 11:00 Warszawa

Zakończono analizę wszystkich 2562/2562 pozycji (+474 od poprzedniego raportu) i wszystkie trzy próby treningowe. Dwie polityki zachowały wyuczone wagi: wariant wizyt wybrał epokę 4/9, wariant Q epokę 12/17. Ich straty walidacyjne względem początkowego przeniesionego modelu wynoszą odpowiednio 1.0892 → 1.0691 oraz 1.5290 → 1.4652. To metryki różnych celów, więc nie należy porównywać ich bezpośrednio między modelami. Podział: 87 całych gier treningowych i 21 walidacyjnych (po 7 walidacyjnych na liczebność).

**Sieć wartości nie poprawiła walidacji:** po 5 epokach pozostała epoka 0, z zerową korektą oceny Hardcore. Wariant visitsValue w zaplanowanej arenie pozostaje dla zachowania zamrożonego planu, lecz ewentualnego jego wyniku nie wolno przypisywać uczeniu wartości. Dodatkowe obliczenia tej sieci mogą zmieniać liczbę symulacji przy limicie czasu. Trwa pilot: 130/240 ukończonych gier przy 100 ms na decyzję. Nie wyciągamy wniosków z częściowych wyników. Po pełnym pilocie sterownik wybierze warianty według zapisanej reguły do osobnego testu 650 ms. Zweryfikowano hashe źródeł i wszystkich trzech zamrożonych modeli; brak zgłoszonego błędu.


## Aktualizacja 12 września, 11:30 Warszawa

Pilot zakończony: 240/240 poprawnych gier (+110 od ostatniego raportu), równy limit 100 ms. Zgodnie z regułą zapisaną przed turniejem wybrano oddzielny wariant dla każdej liczebności:

| Graczy | Wariant | Zwycięstwa kandydata | Kontrola Hardcore | Sparowany przedział 95% różnicy |
|---|---|---:|---:|---|
| 3 | q | 8/12 | 3/12 | [33.33; 58.33] pp |
| 4 | visits | 8/16 | 2/16 | [25.00; 50.00] pp |
| 5 | visitsValue | 8/20 | 5/20 | [-10.00; 35.00] pp |

To wybór modeli na małej próbie: tylko cztery niezależne losowania z rotacjami na liczebność i kilka porównywanych wariantów. Nawet dodatnie przedziały 3/4 osób nie są niezależnym dowodem przewagi wybranego modelu. Przy 5 osobach visitsValue nadal używa niewyuczonej, zerowej korekty wartości; jego wyniku nie można przypisywać nowej umiejętności sieci wartości.

Rozpoczęto oddzielny test przy 650 ms i nowych losowaniach: 12/240 ukończonych gier. Plan: po 30, 40 i 50 gier kandydata oraz tyle samo kontroli dla 3/4/5 osób. Wariantów ani modeli nie zmieniamy w trakcie. Audyt wszystkich 240 zapisów potwierdził wyniki i marże punktów, kompletność partii, aktywne wywołania polityki u kandydatów oraz brak ich u kontroli. Hashe źródeł i modeli zgadzają się z zamrożonym planem. Produkcja pozostaje bez zmian.


## Cichy monitoring 12 września, 12:45 Warszawa

Zgodnie z nową prośbą użytkownika raportowanie ograniczono do jednego zbiorczego raportu około 17:45. Proces działa: test potwierdzający ukończył 90/240 partii (78 więcej niż w ostatnim raporcie 11:30), przy niezmienionych 650 ms na decyzję. Sprawdzono 140 skrótów źródeł, trzy modele oraz zgodność planu turnieju; wszystkie są niezmienione. Brak failure.json. Nie odczytywano częściowych zwycięstw ani nie zmieniano planu na ich podstawie. Dodatkowych obciążających eksperymentów nie uruchamiano, aby zachować warunki pomiaru czasu. Snapshot: progress-1245.json.


## Cichy monitoring 12 września, 13:45 Warszawa

Test potwierdzający postępuje: 154/240 partii (+64 od poprzedniego monitoringu). Hashe 140 źródeł, trzech modeli i planu nadal zgodne; brak zapisanego błędu. Nie analizowano częściowych zwycięstw. Przed poznaniem końcowego wyniku zapisano plan osobnego testu 1-ply + dotychczasowa sieć dla 3 osób: 10 nowych losowań z rotacjami, 30 partii kandydata i 30 kontroli, 650 ms. Plan: flat-followup-plan.json. Test nie jest uruchomiony; wymaga zakończenia bieżącej serii, sprawdzenia ziaren i gotowego sterownika. Raport użytkownika pozostaje zaplanowany na 17:45.


## Cichy monitoring 12 września, 14:45 Warszawa

Test potwierdzający ukończył 218/240 partii (+64 od poprzedniej kontroli), bez zmiany 140 źródeł i trzech modeli. Brak błędu; częściowych zwycięstw nadal nie analizowano.

Przygotowano osobny sterownik tools/neural-flat-confirmation.ts, który wykorzystuje ten sam sprawdzony worker i zamrożony wariant 1-ply. Lekki preflight przeszedł: 145 źródeł zgodnych, 10 nowych ziaren nie koliduje z danymi treningu/walidacji, screeningiem ani głównymi turniejami. Pełne sprawdzenie typów jest odroczone do zakończenia bieżącego testu.

**Kolejka kolejnego etapu jest uruchomiona w sesji exec 8563**: work/neural-multiplayer-20260912/start-flat-after-confirmation.ps1. Czeka co 30 sekund na ukończenie nightly-v2, następnie wykonuje typecheck sterownika i dopiero po jego powodzeniu uruchamia 60 partii 1-ply przy 650 ms. Nie uruchamiać drugiej kopii. Stan przejścia: work/neural-multiplayer-20260912/flat-650-v1/handoff.json; stan samego badania po starcie: status.json; wynik dopiero po całych 60 grach: result.json. W razie błędu sprawdzić handoff/failure oraz sesję 8563. Do startu nie są wykonywane nowe symulacje. Polecenie ręcznego wznowienia ukończonego preflightu, wyłącznie gdy kolejka nie działa: node --import ./tools/register-typescript.mjs tools/neural-flat-confirmation.ts. Plan ma limit dyspozycji 15:40 UTC, bez dobierania gier pod wynik. Nadal żadnego wdrożenia.


## Ukończone potwierdzenie 650 ms — monitoring 15:45 Warszawa

Główna seria zakończyła się o 15:17:36 czasu Warszawy. **Całe 240/240 partii testu potwierdzającego nie wykazało przewagi żadnego wybranego wariantu z wystarczającą pewnością.**

| Graczy | Wariant | Zwycięstwa Neurala | Kontrola Hardcore | Różnica | Sparowany przedział 95% |
|---|---|---:|---:|---:|---|
| 3 | q | 15/30 | 13/30 | 6.67 pp | [-16.67; 36.67] pp |
| 4 | visits | 13/40 | 14/40 | -2.50 pp | [-25.00; 17.50] pp |
| 5 | visitsValue | 11/50 | 10/50 | 2.00 pp | [-14.00; 20.00] pp |

Każda liczebność ma 10 nowych niezależnych losowań i pełne rotacje miejsc; wszyscy grają przy 650 ms na decyzję i maksymalnie 1500 iteracjach. Wszystkie przedziały obejmują zero. Średnia poprawa marży punktów jest mała: +0,43 / +0,83 / +0,48 dla 3/4/5 osób. Dużych przewag z pilotażu 100 ms nie udało się odtworzyć przy docelowym czasie; nie wolno wyciągać z tego dowodu sufitu sieci. Nowe polityki wykonują wywołania neuronowe dla każdej liczebności i w tej konfiguracji mieszczą średnio więcej symulacji niż kontrola (314 vs 300, 209 vs 169, 144 vs 120 na wyszukiwanie), lecz nie zamieniło się to w potwierdzoną siłę gry. Różnią się także polityką i eksploracją, więc to pomiar całego bota.

Zweryfikowano niezależnie wszystkie 240 zapisów: kompletność, zgodność punktów i rozstrzygnięć remisów z kodem gry, udział zwycięstw i marże, wywołania sieci, limit iteracji oraz sumy raportów. Hashe 140 źródeł i trzech modeli są zgodne. Korekta sieci wartości nadal wynosi zero. Artefakty: confirmation-result.json i confirmation-audit.json.

Drugi, niezależnie zaplanowany test 1-ply rozpoczął się automatycznie po zakończeniu pierwszego i pomyślnym sprawdzeniu typów sterownika. Obecnie 50/60 partii, sesja 8563, bez odczytywania częściowych wyników. Jego 145 źródeł pozostaje zamrożonych.

### Kolejna liga danych — przygotowana, jeszcze bez symulacji

Dodano tools/multiplayer-value-league.ts i worker. Preflight przeszedł. **Sesja exec 1936** uruchamia work/neural-multiplayer-20260912/start-league-after-flat.ps1: czeka na ukończenie wszystkich 60 partii 1-ply, następnie wykonuje typecheck i dopiero wtedy generuje 180 gier (po 60 dla 3/4/5) przy stałych 64 iteracjach. Jedna trzecia gier to Hardcore, jedna trzecia mieszana liga Hardcore/Q/visits, jedna trzecia self-play zamrożonego Q dla 3 osób albo visits dla 4/5. Brak równoległego obciążania testów mierzonych czasem.

Cel ligi to sprawdzić, czy sieć wartości potrzebuje większej różnorodności ukończonych partii zamiast kolejnych epok na tej samej małej próbie. 144 nowe gry dołączą do 87 starych treningowych; dawne 21 walidacyjnych wybierze epokę i jedną z dwóch szybkości uczenia (0,0001 / 0,0003). Nowe 36 całych gier (po 12 na liczebność, odłożone z góry) posłuży wyłącznie do oceny gotowego wybranego modelu. Nie będzie to test siły bota. Sterownik zapisuje także stratę treningową, aby odróżnić brak uczenia od pogorszenia uogólnienia. Epoka zerowa nadal może wygrać wybór; bez wymuszania wyuczonej korekty.

Katalog ligi: work/neural-multiplayer-20260912/value-league-v1. Kolejka: handoff.json; generacja/trening: status.json; błędy: failure.json lub sesja 1936. Nie uruchamiać drugiej kopii. Deadline 15:40 UTC zatrzymuje dyspozycję nowych gier i kolejnych epok; raport o 17:45 ma uczciwie rozróżnić ukończone i nieukończone etapy. Produkcja nadal bez zmian.


## Cichy monitoring 12 września, 16:45 Warszawa

**1-ply + dotychczasowa sieć dla 3 osób zakończył pełne 60 partii o 16:00:55 i wyraźnie przegrał z kontrolą w tym badaniu.** Kandydat wygrał 3/30, kontrola uzyskała 13⅓/30 kredytu zwycięstwa (13 samodzielnych zwycięstw oraz udział ⅓ w remisie). Różnica −34,44 pp, sparowany przedział 95% [−47,78; −21,11] pp; średnia różnica marży punktów −5,03. Budżet obu stron 650 ms, 10 niezależnych losowań z rotacjami. Średnio 187 symulacji na wyszukiwanie wobec 303 kontroli. To negatywny wynik konkretnego wariantu równomiernego przeszukiwania pierwszej decyzji; nie dowodzi, że każda metoda 1-ply jest gorsza.

Sprawdzono wszystkie 60 zapisów, punkty, kredyt remisów, legalne zakończenia, wywołania sieci, limit iteracji oraz 145 skrótów źródeł. Wyniki z małego screeningu 24 iteracji nie powtórzyły się przy pełnym limicie czasu. Ten wariant odrzucamy bez dobierania kolejnych partii pod wynik. Artefakty: flat-confirmation-result.json i flat-confirmation-audit.json.

Liga ruszyła po zakończeniu tego turnieju i pomyślnym sprawdzeniu typów, o 16:01:24. **Aktualnie 92/180 pełnych gier**, sesja exec 1936. W audycie 89 wcześniejszych ukończonych zapisów sprawdzono poprawne zakończenia, 2136 przykładów wartości, 543 cechy w każdej perspektywie, zgodność celu ze zwycięzcami i działanie sieci w ligach neuronowych. 147 źródeł i używane modele nadal niezmienione. Bez błędów. Nie obliczano metryk odłożonego holdoutu.

Pozostaje około godziny do raportu. Przy bieżącym tempie generacja może zużyć większość tego okna; nie należy obiecywać ukończenia treningów przed odczytem artefaktów. Sterownik sam zatrzyma nowe zadania i epoki przy ustalonym deadline 15:40 UTC. Po 17:45 należy ocenić realny stan i dokończyć raport, a nie dopisywać planowane wyniki.

Zebrano plany i raport treningu w katalogu reports do późniejszego pushu. Remote main nadal wskazuje 29d3948f7d436ddbe2c595455174912820dc6c64. Dodatkowe sterowniki i uzupełnione raporty nie zostały jeszcze wysłane; po końcowym raporcie należy wykonać autoryzowany push przez Git Data API i zweryfikować hashe. Żadnego wdrożenia produkcyjnego.
