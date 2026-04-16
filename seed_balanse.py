"""
Komplett demo-datasett for 2025.
Kjøres etter at postering/transaksjon-tabellene er tømt.
Forutsetter at kunder (boliger) med id 1-6 finnes.
"""
import sqlite3

conn = sqlite3.connect("regnskap.db")
conn.row_factory = sqlite3.Row

def tx(dato, beskrivelse, posteringer, faktura_ref=None):
    cur = conn.execute(
        "INSERT INTO transaksjon (dato, beskrivelse, faktura_ref) VALUES (?,?,?)",
        (dato, beskrivelse, faktura_ref)
    )
    tid = cur.lastrowid
    for kode, belop in posteringer:
        conn.execute("INSERT INTO postering (transaksjon_id, konto_kode, belop) VALUES (?,?,?)", (tid, kode, belop))

# --- Åpningsbalanse ---
tx("2025-01-01", "Åpningsbalanse 2025", [
    ("1920", 180000),   # Bankinnskudd IB (debet)
    ("2050", -120000),  # Egenkapital IB (kredit)
    ("2200", -60000),   # Langsiktig gjeld IB (kredit)
])

# --- Husleie-fakturaer (6 enheter × 12 måneder = 4 550 kr/mnd inkl. mva) ---
# Forenklet: 2 runder à 6 fakturaer (jan og jul)
kunder = [1, 2, 3, 4, 5, 6]
navn   = ["Lise Johansen", "Erik Pedersen", "Anna Olsen",
          "Tor Hansen", "Mette Sørensen", "Jonas Berg"]

for i, (kid, knavn) in enumerate(zip(kunder, navn), start=1):
    for mnd, dato in enumerate(["2025-01-01","2025-02-01","2025-03-01",
                                  "2025-04-01","2025-05-01","2025-06-01",
                                  "2025-07-01","2025-08-01","2025-09-01",
                                  "2025-10-01","2025-11-01","2025-12-01"], start=1):
        tx(dato, f"Husleie {knavn} {dato[:7]}", [
            ("1500",  4550),   # Kundefordring (debet)
            ("3600", -4550),   # Leieinntekt (kredit)
        ])

# --- Innbetalinger husleie (alle betaler innen den 15. hver måned) ---
for i, (kid, knavn) in enumerate(zip(kunder, navn), start=1):
    for mnd in range(1, 13):
        dato = f"2025-{mnd:02d}-15"
        tx(dato, f"Innbetaling husleie {knavn} {dato[:7]}", [
            ("1500", -4550),   # Lukker fordring (kredit)
            ("1920",  4550),   # Bank (debet)
        ])

# --- Driftskostnader ---
# Forsikringspremie (jan)
tx("2025-01-15", "Faktura forsikring 2025", [("7500", 14000), ("2400", -14000)])
tx("2025-01-20", "Betaling forsikring 2025", [("2400", 14000), ("1920", -14000)])

# Leie lokaler (garasje/bod) — kvartal
for dato in ["2025-01-02","2025-04-01","2025-07-01","2025-10-01"]:
    tx(dato, f"Faktura leie lokaler {dato[:7]}", [("6300", 4000), ("2400", -4000)])
    bdat = dato[:8] + "20"
    tx(bdat, f"Betaling leie lokaler {dato[:7]}", [("2400", 4000), ("1920", -4000)])

# Regnskapsfører — kvartal
for dato in ["2025-01-25","2025-04-25","2025-07-25","2025-10-25"]:
    tx(dato, f"Faktura regnskapsfører {dato[:7]}", [("6700", 1375), ("2400", -1375)])
    bdat = dato[:8] + str(int(dato[8:]) + 5)
    tx(bdat, f"Betaling regnskapsfører {dato[:7]}", [("2400", 1375), ("1920", -1375)])

# Vedlikehold — betalt november
tx("2025-11-05", "Faktura reparasjon og vedlikehold", [("6600", 7000), ("2400", -7000)])
tx("2025-11-20", "Betaling vedlikehold", [("2400", 7000), ("1920", -7000)])

# Reparasjon desember — skyldig ved årslutt
tx("2025-12-10", "Faktura reparasjon desember (skyldig)", [("6600", 3500), ("2400", -3500)])

# Bankgebyr
tx("2025-12-31", "Bankgebyr 2025", [("7770", 180), ("1920", -180)])

# --- Finansposter ---
tx("2025-12-31", "Renteinntekter 2025", [("1920", 2100), ("8050", -2100)])

# --- Avdrag langsiktig lån ---
tx("2025-06-30", "Avdrag lån H1 2025", [("2200", 10000), ("1920", -10000)])
tx("2025-12-31", "Avdrag lån H2 2025", [("2200", 10000), ("1920", -10000)])

conn.commit()
conn.close()

# Verifisering
conn2 = sqlite3.connect("regnskap.db")
ant_tx = conn2.execute("SELECT COUNT(*) FROM transaksjon").fetchone()[0]
ant_post = conn2.execute("SELECT COUNT(*) FROM postering").fetchone()[0]
print(f"Ferdig: {ant_tx} transaksjoner, {ant_post} posteringer.")

# Sjekk dobbelt bokholderi
diff = conn2.execute("SELECT t.id, t.beskrivelse, SUM(p.belop) as sum FROM transaksjon t JOIN postering p ON p.transaksjon_id=t.id GROUP BY t.id HAVING ABS(SUM(p.belop)) > 0.01").fetchall()
if diff:
    print(f"ADVARSEL: {len(diff)} transaksjoner balanserer ikke:")
    for r in diff: print(f"  ID {r[0]}: {r[1]} sum={r[2]}")
else:
    print("OK: Alle transaksjoner balanserer.")
conn2.close()
