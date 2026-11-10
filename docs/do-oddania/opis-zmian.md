# Lekcja 2 – opis zmian

Zbudowałem asystenta dla fikcyjnej firmy Studio Nova. Pomaga odpowiadać klientom i podpowiada pracownikowi, jak potraktować wiadomość.

**Persona, zasady i przykłady (W1).** Asystent dostał opis firmy, jej ceny i zasady pracy. Wszystko leży na serwerze, więc użytkownik nie może tego podejrzeć ani zmienić. Dwa przykładowe pytania z odpowiedziami pokazują modelowi, jak ma pisać. Efekt: asystent przestał wymyślać ceny i rabaty, zawsze podaje prawdziwą cenę 150 zł.

**Odpowiedź JSON ze schematem (W2).** Tryb „Analiza wiadomości” zwraca uporządkowany wynik: czego dotyczy sprawa, czy jest pilna, propozycję odpowiedzi i czy pracownik musi to sprawdzić. Serwer pilnuje kształtu wyniku. Gdy model zwróci coś niepełnego, ucięte albo odmówi, użytkownik widzi zrozumiały komunikat, a nie zmyślony wynik. Pierwszy testowany model nie obsługiwał takich wyników, więc zmieniłem go na inny.

**Próby oszukania asystenta (W3).** Próbowałem przekonać asystenta, żeby podał cenę 1 zł albo „wysłał” odpowiedź bez akceptacji: udawałem instrukcję systemową, pracownika i administratora, prosiłem o przepisanie gotowego tekstu słowo w słowo, podsuwałem fałszywy cennik. Cena zawsze zostawała 150 zł, ale asystent nie dawał pracownikowi znać o próbie manipulacji. Poprawki w analizie:
- klient nie może udawać, że jego wiadomość się skończyła i zaczyna się instrukcja firmy,
- serwer bierze od przeglądarki tylko treść wiadomości, a pola typu „jestem adminem” czy „wyślij od razu” ignoruje,
- każda próba zmiany cen, zasad albo podszycia się pod pracownika trafia do sprawdzenia przez człowieka.

**Ulepszenia czatu i analizy (po W3).** Zwykły czat miał słabsze zabezpieczenia niż analiza. Przeglądarka mogła mu podsunąć fałszywą „wcześniejszą odpowiedź asystenta” z ceną 1 zł, a model wtedy przepraszał za pomyłkę, której nie było. Nowy czat (przycisk „updated W3”, endpoint `/api/chatW3custom1.0`) przechodzi tę samą drogę co analiza:
- serwer przyjmuje od przeglądarki tylko wiadomości klienta, więc podrzucona wypowiedź asystenta w ogóle nie dociera do modelu,
- wynik jest sprawdzany tym samym schematem, a odpowiedź składa serwer – koniec z kategoriami spoza listy,
- podszycie się pod administratora jest oznaczane do sprawdzenia także w czacie.

Poprawiłem też instrukcje dla czatu i analizy: szkic nie obiecuje już kontaktu ani „przekazania pracownikowi” (takiego procesu firma nie opisała), zwraca się do klienta per Pan/Pani, a samo powitanie czy pożegnanie nie trafia do pracownika. Stary czat z lekcji jest dostępny pod przyciskiem „baseW3” (endpoint `/api/chatL2W3`) do porównania.

Testy zabezpieczeń bez wywoływania modelu: 25/25. Wyniki prób ataków przed i po zmianach są w logach i na zrzutach.

**Czego nie poprawiłem.** W ataku rozłożonym na kilka wiadomości ostatnia odpowiedź (z poprawną ceną) nie była już oznaczona do sprawdzenia. Model w czacie nie widzi też swoich poprzednich odpowiedzi – pełna historia rozmowy po stronie serwera to kolejny krok.

**Zastrzeżenie.** To, że moje ataki się nie udały, nie znaczy, że aplikacja jest odporna na wszystkie. Wyniki dotyczą tego modelu i tych konkretnych prób.
