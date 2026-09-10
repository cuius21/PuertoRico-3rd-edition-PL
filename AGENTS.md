# Puerto Rico

Projekt gry znajduje się w tym katalogu. Komunikuj się z użytkownikiem po polsku.
Wzorce silnika i polecenia projektu opisuje CLAUDE.md.

## Publikacja po zmianach

Użytkownik 9 września 2026 upoważnił do publikowania ukończonych zmian tej gry
w osobnym projekcie Cloudflare Pages `puerto-rico-3rd-edition`, pod adresem
https://puerto-rico-3rd-edition.pages.dev/.
Projekt jest obecnie publiczny; nie ma bramy hasła.
Po zmianach wpływających na działanie gry wykonaj kontrole i publikację jako
część zadania. Nie pytaj ponownie o samo wdrożenie w tym upoważnionym zakresie.
Nie publikuj niedokończonych zmian ani niesprawdzonych modeli neuronowych.

Polecenie `npm run deploy` wykonuje kolejno kontrolę typów, testy, build Pages,
publikację na produkcyjną gałąź main i weryfikację plików pod adresem strony.
Nie wdrażaj na przypadkową gałąź podglądu. Jeżeli środowisko blokuje procesy
pomocnicze npm, te same kroki można wykonać kolejno osobnymi poleceniami:

```
node node_modules/typescript/bin/tsc --noEmit
npm test
node --import ./tools/register-typescript.mjs tools/build-pages.mjs
node tools/deploy-pages-direct.mjs
node tools/verify-pages.mjs
```

Po publikacji sprawdź także interfejs strony. Błąd wdrożenia lub weryfikacji
zgłoś użytkownikowi; nie deklaruj aktualizacji produkcji wyłącznie po buildzie.
Stan uwierzytelniania obsługuje Wrangler. Nie zapisuj tokenów ani haseł w kodzie,
raportach, logach rozmowy ani katalogu wdrożenia.

Do Cloudflare trafia wyłącznie `dist-pages`. Pliki EXE, źródła, backupy,
raporty turniejów i dane treningowe nie są częścią publikacji.
Wersja Pages uruchamia grę lokalnie w przeglądarce (boty lub wspólny ekran).
Tryb LAN wymaga osobnego serwera i jest ukryty w buildzie Pages; pozostaje
w wariantach lokalnych. Nie zmieniaj projektu Cloudflare Wojny o Pierścień.
Zmiany wyłącznie dokumentacji i eksperymenty z treningiem nie wymagają
ponownego wdrożenia niezmienionej gry.
