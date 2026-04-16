"""
Legger inn fiktive boliger, fakturaer, innbetalinger og bankposter for testing.
"""
import sys, os, datetime, csv, io
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from regnskap import (
    RegnskapsSystem, ReskontroManager, FakturaManager,
    SelskapManager, AvtaleManager, FakturaLinje, SelskapInfo, KontoType, Postering
)

def main():
    db_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "regnskap.db")
    print(f"Database: {db_path}")

    system = RegnskapsSystem()
    reskontro = ReskontroManager(system.db)
    selskap_mgr = SelskapManager(system.db)
    avtale_mgr = AvtaleManager(system.db)
    faktura_modul = FakturaManager(system.db, system, reskontro, selskap_mgr, avtale_mgr)

    system.importer_standard_kontoplan()

    # Selskapsinformasjon
    selskap_mgr.lagre_info(SelskapInfo(
        navn="Storgata Sameie",
        adresse="Storgata 10, 0155 Oslo",
        orgnr="987 654 321 MVA",
        bankkonto="1503.12.34567",
        epost_avsender="styret@storgataSameie.no",
        epost_passord=""
    ))
    print("✓ Selskapsinformasjon lagret")

    # --- Boliger ---
    boliger_data = [
        ("Lise Johansen",    "lise@example.com",  "91234567", "Storgata 10A, 0155 Oslo", "S01", 0.12, 68.0),
        ("Erik Pedersen",    "erik@example.com",  "92345678", "Storgata 10B, 0155 Oslo", "S02", 0.14, 82.0),
        ("Anna Olsen",       "anna@example.com",  "93456789", "Storgata 10C, 0155 Oslo", "S03", 0.11, 61.0),
        ("Tor Hansen",       "tor@example.com",   "94567890", "Storgata 10D, 0155 Oslo", "S04", 0.15, 90.0),
        ("Mette Sørensen",   "mette@example.com", "95678901", "Storgata 10E, 0155 Oslo", "S05", 0.13, 75.0),
        ("Jonas Berg",       "jonas@example.com", "96789012", "Storgata 10F, 0155 Oslo", "S06", 0.10, 58.0),
    ]
    boliger = []
    for navn, epost, tlf, adr, snr, brok, areal in boliger_data:
        k = reskontro.registrer_kunde(navn, epost, tlf, adr, snr, brok, areal)
        boliger.append(k)
        print(f"  + Bolig: {navn} ({snr})")
    print(f"✓ {len(boliger)} boliger opprettet")

    # --- Fakturaer (2 måneder) ---
    fakturaer = []
    for mnd_navn, mnd in [("januar", 1), ("februar", 2)]:
        for k in boliger:
            fid = faktura_modul.opprett_faktura(k.id, [
                FakturaLinje(f"Felleskostnader {mnd_navn} 2025", 4200.0, "3000", 0),
                FakturaLinje(f"Internett {mnd_navn} 2025",         350.0, "3000", 0),
            ])
            fakturaer.append((fid, k, mnd))
        print(f"✓ {len(boliger)} fakturaer for {mnd_navn}")

    # --- Innbetalinger ---
    # Januar: alle betaler
    jan_fakturaer = [(fid, k, mnd) for fid, k, mnd in fakturaer if mnd == 1]
    for fid, k, mnd in jan_fakturaer:
        faktura_modul.registrer_innbetaling(
            k.id, 4550.0,
            datetime.date(2025, 1, 28),
            f"Innbetaling jan - {k.navn}",
            fid
        )

    # Februar: 4 av 6 betaler, 2 har restanse
    feb_fakturaer = [(fid, k, mnd) for fid, k, mnd in fakturaer if mnd == 2]
    for i, (fid, k, mnd) in enumerate(feb_fakturaer):
        if i < 4:
            faktura_modul.registrer_innbetaling(
                k.id, 4550.0,
                datetime.date(2025, 2, 25),
                f"Innbetaling feb - {k.navn}",
                fid
            )
        # Siste 2 (Jonas og Mette) har ikke betalt
    print(f"✓ Innbetalinger registrert (2 med restanse for februar)")

    # --- Kostnader ---
    kostnader = [
        (datetime.date(2025, 1, 10), "Strøm januar 2025",          "6300",  8200.0),
        (datetime.date(2025, 1, 15), "Vaktmester januar 2025",      "6600",  3500.0),
        (datetime.date(2025, 1, 20), "Forsikring årsavgift 2025",   "7500", 14000.0),
        (datetime.date(2025, 2, 10), "Strøm februar 2025",          "6300",  7800.0),
        (datetime.date(2025, 2, 15), "Vaktmester februar 2025",     "6600",  3500.0),
        (datetime.date(2025, 2, 20), "Revisjon og regnskap",        "6700",  5500.0),
        (datetime.date(2025, 2, 28), "Bankgebyr februar",           "7770",   180.0),
    ]
    for dato, beskr, konto, belop in kostnader:
        system.bokfor_transaksjon(dato, beskr, [
            Postering(konto, belop),
            Postering("1920", -belop),
        ])
    print(f"✓ {len(kostnader)} kostnadsposteringer bokført")

    # --- Bankposter (simulert DNB CSV importert direkte i DB) ---
    conn = system.db.conn
    conn.execute("""
        CREATE TABLE IF NOT EXISTS bankpost (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            dato TEXT NOT NULL,
            tekst TEXT,
            belop REAL NOT NULL,
            import_dato TEXT NOT NULL,
            periode TEXT NOT NULL
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS bank_matching (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            bankpost_id INTEGER NOT NULL,
            postering_id INTEGER NOT NULL,
            matchet_dato TEXT NOT NULL
        )
    """)
    conn.commit()

    import_dato = datetime.datetime.now().isoformat()

    bankposter_data = [
        # Januar innbetalinger fra beboere
        ("2025-01-28", "Nettbank fra LISE JOHANSEN S01",          4550.0,  "2025-01"),
        ("2025-01-28", "Nettbank fra ERIK PEDERSEN S02",           4550.0,  "2025-01"),
        ("2025-01-29", "Nettbank fra ANNA OLSEN S03",              4550.0,  "2025-01"),
        ("2025-01-29", "Nettbank fra TOR HANSEN S04",              4550.0,  "2025-01"),
        ("2025-01-30", "Nettbank fra METTE SØRENSEN S05",          4550.0,  "2025-01"),
        ("2025-01-30", "Nettbank fra JONAS BERG S06",              4550.0,  "2025-01"),
        # Januar kostnader
        ("2025-01-10", "HAFSLUND STRØM Jan",                      -8200.0, "2025-01"),
        ("2025-01-15", "VAKTMESTER AS",                           -3500.0, "2025-01"),
        ("2025-01-20", "IF SKADEFORSIKRING",                     -14000.0, "2025-01"),
        # Februar innbetalinger (bare 4 av 6)
        ("2025-02-25", "Nettbank fra LISE JOHANSEN S01",          4550.0,  "2025-02"),
        ("2025-02-25", "Nettbank fra ERIK PEDERSEN S02",           4550.0,  "2025-02"),
        ("2025-02-26", "Nettbank fra ANNA OLSEN S03",              4550.0,  "2025-02"),
        ("2025-02-26", "Nettbank fra TOR HANSEN S04",              4550.0,  "2025-02"),
        # Februar kostnader
        ("2025-02-10", "HAFSLUND STRØM Feb",                      -7800.0, "2025-02"),
        ("2025-02-15", "VAKTMESTER AS",                           -3500.0, "2025-02"),
        ("2025-02-20", "REVISOR & REGNSKAPSBYRÅ AS",              -5500.0, "2025-02"),
        ("2025-02-28", "DNB BANKGEBYR",                            -180.0, "2025-02"),
    ]

    for dato, tekst, belop, periode in bankposter_data:
        conn.execute(
            "INSERT INTO bankpost (dato, tekst, belop, import_dato, periode) VALUES (?,?,?,?,?)",
            (dato, tekst, belop, import_dato, periode)
        )
    conn.commit()
    print(f"✓ {len(bankposter_data)} bankposter lagt inn")

    print("\n" + "="*50)
    print("DEMO DATA KLAR!")
    print("="*50)
    print(f"  Boliger:      {len(boliger)}")
    print(f"  Fakturaer:    {len(fakturaer)}")
    print(f"  Bankposter:   {len(bankposter_data)}")
    print(f"\nGå til http://localhost:3000/bankavstemming for å teste matching.")
    print("Januar er fullt betalt, februar har 2 med restanse (Mette og Jonas).")

if __name__ == "__main__":
    main()
