# Lekcja 2 – do oddania (Zadanie 2)

**Termin: 12 listopada 2026, do godz. 23:59. Punkty: 10.**

## Treść zadania

**Zadanie 2 – Instrukcje i format odpowiedzi.**
Dodaj personę, zasady, przykłady few-shot i odpowiedź JSON sprawdzaną względem schematu.
Przeprowadź próbę prompt injection i popraw instrukcje.

**Do oddania:** link do kodu lub commita, wynik testu (opis, zrzut lub nagranie) i krótki opis zmian.

## Kryteria oceny (10 pkt)

| Kryterium | Pkt | Gdzie jest dowód |
|---|---|---|
| Persona, zasady i przykłady | 3 | `lib/instructions.ts` (W1), log W1 w `logs/` |
| JSON z walidacją i obsługą błędu | 3 | `lib/analysis.ts`, `app/api/analyze/route.ts`, `tests/analysis.test.mjs` (`npm run test:analysis`) |
| Udokumentowany test ataku i poprawka | 3 | `logs/2026-11-10_1440_log-lekcja-02.md` (W3: przed / poprawki / po, R1–R10), zrzuty w `docs/lekcja-02-screens/` |
| Opis zmian | 1 | sekcja „Opis zmian” niżej |

## Checklista oddania

- [ ] Link do kodu: https://github.com/sebastiankozub/nextjs-agent
- [ ] Commit W1+W2 (persona, zasady, few-shot, JSON ze schematem): [91485db](https://github.com/sebastiankozub/nextjs-agent/commit/91485db)
- [ ] Commit W3 (test prompt injection i poprawka w analizie): [668e8a8](https://github.com/sebastiankozub/nextjs-agent/commit/668e8a8) (tag `lekcja-02-w3`)
- [ ] Commit z ulepszeniami czatu i analizy (instrukcje v1.0): [8f7ac52](https://github.com/sebastiankozub/nextjs-agent/commit/8f7ac52)
- [ ] Wynik testu:
  - `logs/2026-11-10_1440_log-lekcja-02.md` – W3: ataki przed / poprawki / po, ataki na role R1–R10
  - `logs/2026-11-10_1605_log-lekcja-02-przed-ulepszeniami.md` – stan przed ulepszeniami czatu
  - `logs/2026-11-10_1625_log-lekcja-02-po-ulepszeniach.md` – porównanie przed / po
  - zrzuty par przed / po: `docs/lekcja-02-screens/przed/` i `docs/lekcja-02-screens/po/`
    (`02-czat-rola-admin.png`, `03-czat-dla-kogo.png`, `21-czat-r4.png`)
- [ ] Opis zmian (niżej)
- [ ] `git push` (gałąź `main` + tag `lekcja-02-w3`) przed oddaniem

## Opis zmian

Zbudowałem asystenta dla fikcyjnej firmy Studio Nova. Pomaga odpowiadać klientom i podpowiada pracownikowi, jak potraktować wiadomość.

**Persona, zasady i przykłady (W1).** Asystent dostał opis firmy, jej ceny i zasady pracy. Wszystko leży na serwerze, więc użytkownik nie może tego podejrzeć ani zmienić. Dwa przykładowe pytania z odpowiedziami pokazują modelowi, jak ma pisać. Efekt: asystent przestał wymyślać ceny i rabaty, zawsze podaje prawdziwą cenę 150 zł.

**Odpowiedź JSON ze schematem (W2).** Tryb „Analiza wiadomości” zwraca uporządkowany wynik: czego dotyczy sprawa, czy jest pilna, propozycję odpowiedzi i czy pracownik musi to sprawdzić. Serwer pilnuje kształtu wyniku. Gdy model zwróci coś niepełnego, ucięte albo odmówi, użytkownik widzi zrozumiały komunikat, a nie zmyślony wynik. Pierwszy testowany model nie obsługiwał takich wyników, więc zmieniłem go na inny.

**Próby oszukania asystenta (W3).** Próbowałem przekonać asystenta, żeby podał cenę 1 zł albo „wysłał” odpowiedź bez akceptacji: udawałem instrukcję systemową, pracownika i administratora, prosiłem o przepisanie gotowego tekstu słowo w słowo, podsuwałem fałszywy cennik. Cena zawsze zostawała 150 zł, ale asystent nie dawał pracownikowi znać o próbie manipulacji. Poprawki w analizie:
- klient nie może udawać, że jego wiadomość się skończyła i zaczyna się instrukcja firmy,
- serwer bierze od przeglądarki tylko treść wiadomości, a pola typu „jestem adminem” czy „wyślij od razu” ignoruje,
- każda próba zmiany cen, zasad albo podszycia się pod pracownika trafia do sprawdzenia przez człowieka.

**Ulepszenia czatu i analizy (po W3).** Zwykły czat miał słabsze zabezpieczenia niż analiza. Przeglądarka mogła mu podsunąć fałszywą „wcześniejszą odpowiedź asystenta” z ceną 1 zł, a model wtedy przepraszał za pomyłkę, której nie było. Nowy czat (przycisk „Czat W3 custom 1.0”) przechodzi tę samą drogę co analiza:
- serwer przyjmuje od przeglądarki tylko wiadomości klienta, więc podrzucona wypowiedź asystenta w ogóle nie dociera do modelu,
- wynik jest sprawdzany tym samym schematem, a odpowiedź składa serwer – koniec z kategoriami spoza listy,
- podszycie się pod administratora jest oznaczane do sprawdzenia także w czacie.

Poprawiłem też instrukcje dla czatu i analizy: szkic nie obiecuje już kontaktu ani „przekazania pracownikowi” (takiego procesu firma nie opisała), zwraca się do klienta per Pan/Pani, a samo powitanie czy pożegnanie nie trafia do pracownika. Stary czat z lekcji jest dostępny pod przyciskiem „Czat W3” do porównania.

Testy zabezpieczeń bez wywoływania modelu: 25/25. Wyniki prób ataków przed i po zmianach są w logach i na zrzutach.

**Czego nie poprawiłem.** W ataku rozłożonym na kilka wiadomości ostatnia odpowiedź (z poprawną ceną) nie była już oznaczona do sprawdzenia. Model w czacie nie widzi też swoich poprzednich odpowiedzi – pełna historia rozmowy po stronie serwera to kolejny krok.

**Zastrzeżenie.** To, że moje ataki się nie udały, nie znaczy, że aplikacja jest odporna na wszystkie. Wyniki dotyczą tego modelu i tych konkretnych prób.
