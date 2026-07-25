@echo off
REM ============================================================
REM  AIdeas - uruchamianie aplikacji jednym klikniciem
REM  Ten plik startuje serwer deweloperski Next.js i otwiera
REM  przegladarke na http://localhost:3000
REM ============================================================

REM Wymuszamy kodowanie UTF-8, zeby polskie znaki w konsoli byly czytelne
chcp 65001 >nul

REM Przechodzimy do katalogu, w ktorym znajduje sie ten plik .bat,
REM dzieki czemu START.bat dziala niezaleznie od miejsca uruchomienia
cd /d "%~dp0"

echo.
echo ============================================================
echo   AIdeas - Modul 1 (kreator agenta AI)
echo ============================================================
echo   Przygotowuje uruchomienie aplikacji...
echo.

REM ------------------------------------------------------------
REM  1) Sprawdzenie zaleznosci (folder node_modules)
REM ------------------------------------------------------------
if not exist "node_modules" (
    echo [KROK 1/3] Brak folderu node_modules - instaluje zaleznosci.
    echo            To moze potrwac kilka minut, prosze czekac...
    echo.
    call npm install
    if errorlevel 1 (
        echo.
        echo [BLAD] Instalacja zaleznosci nie powiodla sie.
        echo        Sprawdz polaczenie z internetem i czy Node.js jest zainstalowany.
        echo.
        pause
        exit /b 1
    )
    echo.
    echo [OK] Zaleznosci zainstalowane.
) else (
    echo [KROK 1/3] Zaleznosci juz sa zainstalowane - pomijam npm install.
)
echo.

REM ------------------------------------------------------------
REM  2) Sprawdzenie pliku .env.local i kluczy Supabase
REM ------------------------------------------------------------
echo [KROK 2/3] Sprawdzam konfiguracje .env.local...

if not exist ".env.local" (
    echo.
    echo [UWAGA] Nie znaleziono pliku .env.local.
    echo         Aplikacja wystartuje, ale polaczenie z Supabase nie zadziala.
    echo         Uzupelnij klucze w .env.local.
    echo.
) else (
    REM Szukamy placeholderow - jesli sa obecne, klucze nie zostaly uzupelnione.
    REM findstr zwraca 0 gdy znajdzie dopasowanie.
    findstr /C:"your-project.supabase.co" /C:"your-anon-key" ".env.local" >nul
    if not errorlevel 1 (
        echo.
        echo [UWAGA] Plik .env.local zawiera przykladowe placeholdery.
        echo         Uzupelnij klucze w .env.local ^(NEXT_PUBLIC_SUPABASE_URL
        echo         oraz NEXT_PUBLIC_SUPABASE_ANON_KEY^), aby Supabase dzialalo.
        echo         Uruchamiam mimo to...
        echo.
    ) else (
        echo [OK] Konfiguracja .env.local wyglada na uzupelniona.
    )
)
echo.

REM ------------------------------------------------------------
REM  3) Zwolnienie portu 3000, jesli jest zajety
REM     Aplikacja ma zawsze startowac na porcie 3000, wiec jesli
REM     jakis proces juz go trzyma (np. poprzedni serwer), musimy
REM     go zatrzymac. Dzieki temu adres w przegladarce zawsze
REM     zgadza sie z portem serwera.
REM ------------------------------------------------------------
echo [KROK 3/4] Sprawdzam, czy port 3000 jest wolny...

REM netstat listuje polaczenia; szukamy tych na porcie 3000 w stanie
REM LISTENING. Piaty token to PID procesu trzymajacego port.
set "PORT_ZAJETY="
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":3000 " ^| findstr "LISTENING"') do (
    set "PORT_ZAJETY=%%P"
    echo            Port 3000 jest zajety przez proces PID %%P - zatrzymuje go...
    taskkill /F /PID %%P >nul 2>&1
)

if defined PORT_ZAJETY (
    REM Dajemy systemowi chwile na faktyczne zwolnienie portu.
    timeout /t 2 /nobreak >nul
    echo [OK] Port 3000 zostal zwolniony.
) else (
    echo [OK] Port 3000 jest wolny.
)
echo.

REM ------------------------------------------------------------
REM  4) Otwarcie przegladarki PO starcie serwera
REM     Uruchamiamy osobny proces, ktory odczeka kilka sekund
REM     (az serwer wstanie) i dopiero wtedy otworzy adres URL.
REM     Dzieki temu uzytkownik nie zobaczy pustej strony bledu.
REM ------------------------------------------------------------
echo [KROK 4/4] Uruchamiam serwer deweloperski na porcie 3000...
echo            Przegladarka otworzy sie automatycznie za chwile.
echo            To okno musi pozostac otwarte - tu dzialaja logi serwera.
echo            Aby zatrzymac serwer: zamknij to okno lub nacisnij Ctrl+C.
echo.

REM start /b uruchamia w tle polecenie, ktore czeka 6 sekund (timeout),
REM a nastepnie otwiera domyslna przegladarke na adresie aplikacji.
start "" /b cmd /c "timeout /t 6 /nobreak >nul & start "" http://localhost:3000"

REM ------------------------------------------------------------
REM  Start serwera deweloperskiego w tym samym oknie.
REM  Flaga "-- -p 3000" wymusza stale uruchomienie Next.js na porcie
REM  3000 (-- przekazuje argument do "next dev"), wiec adres otwierany
REM  w przegladarce zawsze zgadza sie z portem serwera.
REM  npm run dev blokuje konsole - logi beda widoczne na biezaco,
REM  a okno pozostanie otwarte tak dlugo, jak dziala serwer.
REM ------------------------------------------------------------
call npm run dev -- -p 3000

REM Gdyby serwer sie zatrzymal (np. blad startu), zostawiamy okno otwarte,
REM zeby dalo sie odczytac komunikaty bledow.
echo.
echo Serwer zostal zatrzymany.
pause
