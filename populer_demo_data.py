import sys
import os
import datetime

# Add parent directory to path to import regnskap module
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from regnskap import (
    RegnskapsSystem, ReskontroManager, FakturaManager, 
    SelskapManager, AvtaleManager, FakturaLinje, SelskapInfo, KontoType
)

def main():
    # Initialize system
    system = RegnskapsSystem()
    reskontro = ReskontroManager(system.db)
    selskap_mgr = SelskapManager(system.db)
    avtale_mgr = AvtaleManager(system.db)
    faktura_modul = FakturaManager(system.db, system, reskontro, selskap_mgr, avtale_mgr)
    
    # Import standard chart of accounts
    system.importer_standard_kontoplan()
    
    # Setup company info
    selskap_info = SelskapInfo(
        navn="ABC Sameie",
        adresse="Oslogata 1, 0151 Oslo",
        orgnr="123456789 MVA",
        bankkonto="1234.56.78901",
        epost_avsender="styret@abcsameie.no",
        epost_passord=""
    )
    selskap_mgr.lagre_info(selskap_info)
    
    # Create demo customers (boliger)
    print("--- Oppretter kunder ---")
    kunder = []
    
    kunde1 = reskontro.registrer_kunde(
        navn="Ola Nordmann",
        epost="ola.nordmann@example.com",
        tlf="99887766",
        adresse="Oslogata 1, 0101 Oslo",
        seksjonsnummer="A001",
        sameiebrok=0.05,
        areal=85.5
    )
    kunder.append(kunde1)
    print(f"Kunde opprettet: {kunde1.navn} (Seksjon {kunde1.seksjonsnummer})")
    
    kunde2 = reskontro.registrer_kunde(
        navn="Kari Hansen",
        epost="kari.hansen@example.com",
        tlf="99887755",
        adresse="Oslogata 2, 0101 Oslo",
        seksjonsnummer="B002",
        sameiebrok=0.04,
        areal=72.0
    )
    kunder.append(kunde2)
    print(f"Kunde opprettet: {kunde2.navn} (Seksjon {kunde2.seksjonsnummer})")
    
    kunde3 = reskontro.registrer_kunde(
        navn="Per Olsen",
        epost="per.olsen@example.com",
        tlf="99887744",
        adresse="Oslogata 3, 0101 Oslo",
        seksjonsnummer="C003",
        sameiebrok=0.06,
        areal=95.0
    )
    kunder.append(kunde3)
    print(f"Kunde opprettet: {kunde3.navn} (Seksjon {kunde3.seksjonsnummer})")
    
    kunde4 = reskontro.registrer_kunde(
        navn="Maria Berg",
        epost="maria.berg@example.com",
        tlf="99887733",
        adresse="Oslogata 4, 0101 Oslo",
        seksjonsnummer="D004",
        sameiebrok=0.03,
        areal=68.0
    )
    kunder.append(kunde4)
    print(f"Kunde opprettet: {kunde4.navn} (Seksjon {kunde4.seksjonsnummer})")
    
    # Create demo invoices
    print("\n--- Oppretter fakturaer ---")
    
    # Invoice for Ola
    faktura1_linjer = [
        FakturaLinje("Felleskostnader januar", 3500.0, "3000", 25),
        FakturaLinje("Parkering", 400.0, "3600", 25),
        FakturaLinje("Vaktmestertjenester", 600.0, "3000", 25)
    ]
    faktura1_id = faktura_modul.opprett_faktura(kunde1.id, faktura1_linjer)
    print(f"Faktura #{faktura1_id} opprettet for {kunde1.navn}")
    
    # Invoice for Kari
    faktura2_linjer = [
        FakturaLinje("Felleskostnader januar", 3200.0, "3000", 25),
        FakturaLinje("Felleskostnader februar", 3200.0, "3000", 25)
    ]
    faktura2_id = faktura_modul.opprett_faktura(kunde2.id, faktura2_linjer)
    print(f"Faktura #{faktura2_id} opprettet for {kunde2.navn}")
    
    # Invoice for Per
    faktura3_linjer = [
        FakturaLinje("Felleskostnader januar", 4000.0, "3000", 25),
        FakturaLinje("Garasjeleie", 500.0, "3600", 25),
        FakturaLinje("Snøbrøyting", 800.0, "3000", 25)
    ]
    faktura3_id = faktura_modul.opprett_faktura(kunde3.id, faktura3_linjer)
    print(f"Faktura #{faktura3_id} opprettet for {kunde3.navn}")
    
    # Invoice for Maria
    faktura4_linjer = [
        FakturaLinje("Felleskostnader januar", 3000.0, "3000", 25),
        FakturaLinje("Felleskostnader februar", 3000.0, "3000", 25),
        FakturaLinje("Felleskostnader mars", 3000.0, "3000", 25)
    ]
    faktura4_id = faktura_modul.opprett_faktura(kunde4.id, faktura4_linjer)
    print(f"Faktura #{faktura4_id} opprettet for {kunde4.navn}")
    
    # Register payments
    print("\n--- Registrerer innbetalinger ---")
    
    # Payment from Ola for invoice 1
    faktura_modul.registrer_innbetaling(
        kunde1.id, 
        4500.0, 
        datetime.date(2025, 1, 25), 
        "Innbetaling faktura",
        faktura1_id
    )
    print(f"Innbetaling registrert for {kunde1.navn}: 4500.00 kr")
    
    # Payment from Kari for invoice 2
    faktura_modul.registrer_innbetaling(
        kunde2.id, 
        6400.0, 
        datetime.date(2025, 2, 15), 
        "Innbetaling faktura",
        faktura2_id
    )
    print(f"Innbetaling registrert for {kunde2.navn}: 6400.00 kr")
    
    # Partial payment from Per
    faktura_modul.registrer_innbetaling(
        kunde3.id, 
        2650.0, 
        datetime.date(2025, 2, 10), 
        "Delinnbetaling",
        faktura3_id
    )
    print(f"Delinnbetaling registrert for {kunde3.navn}: 2650.00 kr")
    
    # Add some expense transactions
    print("\n--- Bokfører kostnader ---")
    
    from regnskap import Postering
    
    # Rent expense
    system.bokfor_transaksjon(
        datetime.date(2025, 1, 15),
        "Husleie Q1 2025",
        [
            Postering("6300", 15000.0),  # Debet: Leie lokaler
            Postering("1920", -15000.0)  # Kredit: Bank
        ]
    )
    
    # Insurance
    system.bokfor_transaksjon(
        datetime.date(2025, 1, 20),
        "Forsikring årlig",
        [
            Postering("7500", 8500.0),   # Debet: Forsikring
            Postering("1920", -8500.0)   # Kredit: Bank
        ]
    )
    
    # Phone and postage
    system.bokfor_transaksjon(
        datetime.date(2025, 2, 5),
        "Telefon og internett februar",
        [
            Postering("6900", 1200.0),   # Debet: Telefon og porto
            Postering("1920", -1200.0)   # Kredit: Bank
        ]
    )
    
    # Bank fees
    system.bokfor_transaksjon(
        datetime.date(2025, 2, 28),
        "Bankgebyr",
        [
            Postering("7770", 150.0),    # Debet: Bank og kortgebyr
            Postering("1920", -150.0)    # Kredit: Bank
        ]
    )
    
    print("\n--- Demo data opprettet! ---")
    print("\nNå kan du sjekke rapportene i nettleseren:")
    print("- Balanse")
    print("- Resultat")
    print("- Reskontro")
    print("- Åpne poster")

if __name__ == "__main__":
    main()
