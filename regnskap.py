import datetime
import sqlite3
import os
import sys
import smtplib
from fpdf import FPDF
from email.message import EmailMessage
from enum import Enum
from dataclasses import dataclass
from typing import List, Dict, Optional

# --- Datamodeller og Typer ---
class KontoType(Enum):
    EIENDEL = "Eiendel"       # Assets
    GJELD = "Gjeld"           # Liabilities
    EGENKAPITAL = "Egenkapital" # Equity
    INNTEKT = "Inntekt"       # Revenue
    KOSTNAD = "Kostnad"       # Expense

@dataclass
class Konto:
    kode: str
    navn: str
    type: KontoType

@dataclass
class Postering:
    konto_kode: str
    belop: float  # Positiv verdi for Debet, Negativ verdi for Kredit
    kunde_id: Optional[int] = None # Kobling mot reskontro (hvis relevant)

@dataclass
class Kunde:
    id: int
    navn: str
    epost: str
    telefon: str
    adresse: str
    seksjonsnummer: str = ""
    sameiebrok: float = 0.0
    areal: float = 0.0

@dataclass
class FakturaLinje:
    beskrivelse: str
    belop: float
    inntektskonto: str  # Hvilken konto skal krediteres (f.eks. 3000 eller 3600)
    mva_sats: int = 0   # Mva i prosent (0, 15, 25)

@dataclass
class SelskapInfo:
    navn: str
    adresse: str
    orgnr: str
    bankkonto: str
    epost_avsender: str
    epost_passord: str # Gmail App Password

@dataclass
class FakturaAvtale:
    id: int
    kunde_id: int
    seksjonsnummer: str
    frekvens: int # Antall måneder (1=Månedlig, 3=Kvartal, 12=Årlig)
    neste_forfall: datetime.date
    belop: float
    beskrivelse: str
    inntektskonto: str
    mva_sats: int
    aktiv: bool

# --- Database Håndtering ---
class Database:
    def __init__(self, db_navn="regnskap.db"):
        if getattr(sys, 'frozen', False):
            # Hvis kjørt som EXE, lagre DB i samme mappe som EXE-filen
            base_path = os.path.dirname(sys.executable)
        else:
            # Hvis kjørt som script, bruk scriptets mappe
            base_path = os.path.dirname(os.path.abspath(__file__))
            
        db_path = os.path.join(base_path, db_navn)
        self.conn = sqlite3.connect(db_path, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row  # Gjør at vi kan hente kolonner ved navn
        self.opprett_tabeller()

    def opprett_tabeller(self):
        cursor = self.conn.cursor()
        
        # Tabell: Konto
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS konto (
                kode TEXT PRIMARY KEY,
                navn TEXT,
                type TEXT
            )
        """)

        # Tabell: Transaksjon
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS transaksjon (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                dato TEXT,
                beskrivelse TEXT,
                faktura_ref INTEGER
            )
        """)

        # Tabell: Postering
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS postering (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                transaksjon_id INTEGER,
                konto_kode TEXT,
                belop REAL,
                kunde_id INTEGER,
                avstemt BOOLEAN DEFAULT 0,
                FOREIGN KEY(transaksjon_id) REFERENCES transaksjon(id),
                FOREIGN KEY(konto_kode) REFERENCES konto(kode)
            )
        """)

        # Tabell: Kunde (Reskontro)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS kunde (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                navn TEXT,
                epost TEXT,
                telefon TEXT,
                adresse TEXT,
                seksjonsnummer TEXT DEFAULT '',
                sameiebrok REAL DEFAULT 0,
                areal REAL DEFAULT 0
            )
        """)

        # Tabell: Innbetaling kobling
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS innbetaling_kobling (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                faktura_id INTEGER NOT NULL,
                transaksjon_id INTEGER NOT NULL,
                belop REAL NOT NULL,
                FOREIGN KEY(faktura_id) REFERENCES faktura(id),
                FOREIGN KEY(transaksjon_id) REFERENCES transaksjon(id)
            )
        """)

        # Tabell: Faktura
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS faktura (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                kunde_id INTEGER,
                dato TEXT,
                forfallsdato TEXT,
                total_belop REAL,
                status TEXT DEFAULT 'OPEN', -- OPEN, PAID, CREDITED
                FOREIGN KEY(kunde_id) REFERENCES kunde(id)
            )
        """)

        # Tabell: Selskap Info
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS selskap (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                navn TEXT,
                adresse TEXT,
                orgnr TEXT,
                bankkonto TEXT,
                epost_avsender TEXT,
                epost_passord TEXT
            )
        """)

        # Tabell: System Logg (Sporbarhet)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS system_logg (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tidspunkt TEXT,
                hendelse TEXT,
                beskrivelse TEXT
            )
        """)

        # Tabell: System Innstillinger (f.eks. låsedato)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS system_innstillinger (
                nokkel TEXT PRIMARY KEY,
                verdi TEXT
            )
        """)

        # Tabell: Faste Avtaler (Abonnement)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS faktura_avtale (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                kunde_id INTEGER,
                frekvens INTEGER, -- 1, 3, 6, 12
                neste_forfall TEXT,
                belop REAL,
                beskrivelse TEXT,
                inntektskonto TEXT,
                mva_sats INTEGER,
                aktiv BOOLEAN DEFAULT 1
            )
        """)
        
        self.conn.commit()
        
        # Migrering: Sjekk om kunde_id finnes i postering (for eksisterende baser)
        try:
            self.conn.execute("ALTER TABLE postering ADD COLUMN kunde_id INTEGER")
        except sqlite3.OperationalError:
            # Kolonnen finnes sannsynligvis allerede
            pass
        
        try:
            self.conn.execute("ALTER TABLE postering ADD COLUMN avstemt BOOLEAN DEFAULT 0")
        except sqlite3.OperationalError:
            pass

        try:
            self.conn.execute("ALTER TABLE kunde ADD COLUMN seksjonsnummer TEXT DEFAULT ''")
        except sqlite3.OperationalError:
            pass

        try:
            self.conn.execute("ALTER TABLE kunde ADD COLUMN sameiebrok REAL DEFAULT 0")
        except sqlite3.OperationalError:
            pass

        try:
            self.conn.execute("ALTER TABLE kunde ADD COLUMN areal REAL DEFAULT 0")
        except sqlite3.OperationalError:
            pass

        self.conn.execute("UPDATE kunde SET seksjonsnummer = CAST(id AS TEXT) WHERE COALESCE(seksjonsnummer, '') = ''")
        self.conn.commit()

# --- Tjenester / Moduler ---

class PDFGenerator:
    @staticmethod
    def lag_faktura_pdf(faktura_id: int, kunde: Kunde, linjer: List[FakturaLinje], selskap: SelskapInfo, dato, forfall, total) -> str:
        pdf = FPDF()
        pdf.set_auto_page_break(auto=True, margin=15)
        pdf.add_page()
        
        # --- Header Seksjon ---
        # Avsender (Venstre topp)
        pdf.set_xy(10, 10)
        pdf.set_font("Helvetica", "B", 14)
        pdf.cell(0, 5, selskap.navn, 0, 1, "L")
        pdf.set_font("Helvetica", "", 10)
        pdf.set_text_color(100, 100, 100) # Mørk grå
        pdf.cell(0, 5, selskap.adresse, 0, 1, "L")
        pdf.cell(0, 5, f"Org.nr: {selskap.orgnr} MVA", 0, 1, "L")
        pdf.cell(0, 5, selskap.epost_avsender, 0, 1, "L")
        pdf.set_text_color(0, 0, 0) # Tilbake til svart
        
        # Tittel (Høyre topp)
        pdf.set_xy(120, 10)
        pdf.set_font("Helvetica", "B", 20)
        pdf.cell(80, 10, "FAKTURA", 0, 1, "R")
        
        # --- Faktura Info Boks (Høyre side) ---
        pdf.set_xy(120, 30)
        pdf.set_font("Helvetica", "B", 10)
        pdf.cell(40, 6, "Fakturanummer:", 0, 0, "R")
        pdf.set_font("Helvetica", "", 10)
        pdf.cell(40, 6, str(faktura_id), 0, 1, "R")
        
        pdf.set_x(120)
        pdf.set_font("Helvetica", "B", 10)
        pdf.cell(40, 6, "Fakturadato:", 0, 0, "R")
        pdf.set_font("Helvetica", "", 10)
        pdf.cell(40, 6, str(dato), 0, 1, "R")
        
        pdf.set_x(120)
        pdf.set_font("Helvetica", "B", 10)
        pdf.cell(40, 6, "Forfallsdato:", 0, 0, "R")
        pdf.set_font("Helvetica", "", 10)
        pdf.cell(40, 6, str(forfall), 0, 1, "R")
        
        pdf.set_x(120)
        pdf.set_font("Helvetica", "B", 10)
        pdf.cell(40, 6, "Bankkonto:", 0, 0, "R")
        pdf.set_font("Helvetica", "", 10)
        pdf.cell(40, 6, selskap.bankkonto, 0, 1, "R")

        # --- Mottaker (Venstre side - tilpasset vinduskonvolutt) ---
        pdf.set_xy(10, 50)
        pdf.set_font("Helvetica", "B", 11)
        pdf.cell(0, 5, kunde.navn, 0, 1, "L")
        pdf.set_font("Helvetica", "", 10)
        pdf.cell(0, 5, kunde.adresse, 0, 1, "L")
        
        # --- Varelinjer Header ---
        pdf.set_y(90)
        pdf.set_fill_color(240, 240, 240) # Lys grå bakgrunn
        pdf.set_font("Helvetica", "B", 9)
        pdf.cell(95, 8, "Beskrivelse", 0, 0, "L", True)
        pdf.cell(20, 8, "Mva %", 0, 0, "C", True)
        pdf.cell(35, 8, "Netto", 0, 0, "R", True)
        pdf.cell(40, 8, "Total", 0, 1, "R", True)
        
        # --- Varelinjer Innhold ---
        pdf.set_font("Helvetica", "", 9)
        
        total_netto = 0.0
        total_mva = 0.0
        mva_oversikt = {} # For å summere per sats
        
        for linje in linjer:
            # Beregn netto og mva
            netto = linje.belop / (1 + (linje.mva_sats / 100.0))
            mva = linje.belop - netto
            
            total_netto += netto
            total_mva += mva
            
            # Samle til MVA-spesifikasjon
            if linje.mva_sats not in mva_oversikt:
                mva_oversikt[linje.mva_sats] = {"grunnlag": 0.0, "mva_belop": 0.0}
            mva_oversikt[linje.mva_sats]["grunnlag"] += netto
            mva_oversikt[linje.mva_sats]["mva_belop"] += mva
            
            pdf.cell(95, 8, linje.beskrivelse, "B", 0, "L")
            pdf.cell(20, 8, f"{linje.mva_sats}%", "B", 0, "C")
            pdf.cell(35, 8, f"{netto:.2f}", "B", 0, "R")
            pdf.cell(40, 8, f"{linje.belop:.2f}", "B", 1, "R")
            
        # --- Totaler og Betalingsinfo ---
        pdf.ln()
        
        y_pos = pdf.get_y()
        
        # Venstre side: MVA Spesifikasjon
        pdf.set_y(y_pos + 5)
        pdf.set_font("Helvetica", "B", 8)
        pdf.cell(30, 5, "MVA Spesifikasjon:", 0, 1)
        pdf.set_font("Helvetica", "", 8)
        pdf.cell(25, 5, "Sats", "B")
        pdf.cell(30, 5, "Grunnlag", "B", 0, "R")
        pdf.cell(30, 5, "MVA Beløp", "B", 1, "R")
        
        for sats, tall in mva_oversikt.items():
            pdf.cell(25, 5, f"{sats}%")
            pdf.cell(30, 5, f"{tall['grunnlag']:.2f}", 0, 0, "R")
            pdf.cell(30, 5, f"{tall['mva_belop']:.2f}", 0, 1, "R")
            
        # Høyre side: Totalsum boks
        pdf.set_xy(120, y_pos + 5)
        pdf.set_fill_color(230, 230, 230)
        pdf.rect(120, y_pos + 5, 80, 30, 'F') # Grå boks
        
        pdf.set_xy(125, y_pos + 10)
        pdf.set_font("Helvetica", "", 10)
        pdf.cell(35, 5, "Netto sum:", 0, 0)
        pdf.cell(35, 5, f"{total_netto:.2f}", 0, 1, "R")
        
        pdf.set_xy(125, y_pos + 16)
        pdf.cell(35, 5, "MVA totalt:", 0, 0)
        pdf.cell(35, 5, f"{total_mva:.2f}", 0, 1, "R")
        
        pdf.set_xy(125, y_pos + 24)
        pdf.set_font("Helvetica", "B", 14)
        pdf.cell(35, 8, "Å BETALE:", 0, 0)
        pdf.cell(35, 8, f"{total:.2f}", 0, 1, "R")
        
        # --- Bunntekst / Betalingsinfo ---
        pdf.set_y(-40)
        pdf.set_draw_color(200, 200, 200)
        pdf.line(10, pdf.get_y(), 200, pdf.get_y())
        pdf.ln(5)
        
        pdf.set_font("Helvetica", "", 9)
        pdf.cell(0, 5, f"Vennligst betal til konto: {selskap.bankkonto}", 0, 1, "L")
        pdf.cell(0, 5, "Merk faktura med bolignummer og fakturanummer", 0, 1, "L")
        pdf.cell(0, 5, f"Forfallsdato: {forfall}", 0, 1, "L")
        
        # --- Lagring til fil ---
        mappe = "fakturaer"
        if not os.path.exists(mappe):
            os.makedirs(mappe)
            
        # Vask kundenavnet for tegn som ikke er lov i filnavn
        safe_navn = "".join([c for c in kunde.navn if c.isalnum() or c in (' ', '.', '_', '-')]).strip()
        
        filnavn = f"Faktura_{faktura_id}_{safe_navn}.pdf"
        full_sti = os.path.join(mappe, filnavn)
        
        pdf.output(full_sti)
        return full_sti

class EpostTjeneste:
    """Håndterer utsending av epost via Gmail."""
    @staticmethod
    def send_faktura(kunde: Kunde, faktura_id: int, belop: float, selskap: SelskapInfo, vedlegg_sti: str = None, er_kreditnota: bool = False):
        tittel = "KREDITNOTA" if er_kreditnota else "FAKTURA"
        
        innhold = f"""Hei {kunde.navn},

Her kommer {tittel.lower()} #{faktura_id} fra {selskap.navn}.

Beløp: {belop:.2f} kr
Forfallsdato: Se vedlegg (Simulert)
Bankkonto: {selskap.bankkonto}

Vennlig hilsen
{selskap.navn}
"""
        msg = EmailMessage()
        msg.set_content(innhold)
        msg['Subject'] = f"{tittel} #{faktura_id} - {selskap.navn}"
        msg['From'] = selskap.epost_avsender
        msg['To'] = kunde.epost

        # Legg til PDF vedlegg hvis det finnes
        if vedlegg_sti and os.path.exists(vedlegg_sti):
            with open(vedlegg_sti, 'rb') as f:
                file_data = f.read()
                msg.add_attachment(file_data, maintype='application', subtype='pdf', filename=os.path.basename(vedlegg_sti))

        if selskap.epost_avsender and selskap.epost_passord:
            try:
                with smtplib.SMTP_SSL('smtp.gmail.com', 465) as smtp:
                    smtp.login(selskap.epost_avsender, selskap.epost_passord)
                    smtp.send_message(msg)
                print(f"E-post sendt til {kunde.epost}")
            except Exception as e:
                print(f"Feil ved sending av epost: {e}")

class RegnskapsSystem:
    def __init__(self):
        self.db = Database()

    def opprett_konto(self, kode: str, navn: str, type: KontoType):
        try:
            self.db.conn.execute(
                "INSERT INTO konto (kode, navn, type) VALUES (?, ?, ?)",
                (kode, navn, type.value)
            )
            self.db.conn.commit()
        except sqlite3.IntegrityError:
            print(f"Info: Konto {kode} finnes allerede.")

    def importer_standard_kontoplan(self):
        """Importerer en standard norsk kontoplan (NS 4102 utvalg)."""
        standard_kontoer = [
            # Eiendeler
            ("1500", "Kundefordringer", KontoType.EIENDEL),
            ("1579", "Andre kortsiktige fordringer", KontoType.EIENDEL),
            ("1900", "Kontanter", KontoType.EIENDEL),
            ("1920", "Bankinnskudd", KontoType.EIENDEL),
            ("1950", "Bankinnskudd skattetrekk", KontoType.EIENDEL),
            
            # Egenkapital og Gjeld
            ("2050", "Annen egenkapital", KontoType.EGENKAPITAL),
            ("2400", "Leverandørgjeld", KontoType.GJELD),
            ("2600", "Forskuddstrekk", KontoType.GJELD),
            ("2740", "Skyldig arbeidsgiveravgift", KontoType.GJELD),
            ("2990", "Annen kortsiktig gjeld", KontoType.GJELD),
            
            # Inntekter
            ("3000", "Salgsinntekt, avgiftspliktig", KontoType.INNTEKT),
            ("3100", "Salgsinntekt, avgiftsfri", KontoType.INNTEKT),
            ("3600", "Leieinntekt fast eiendom", KontoType.INNTEKT),
            ("3900", "Annen driftsinntekt", KontoType.INNTEKT),
            
            # Kostnader
            ("4000", "Innkjøp av varer", KontoType.KOSTNAD),
            ("5000", "Lønn til ansatte", KontoType.KOSTNAD),
            ("6000", "Avskrivning bygning", KontoType.KOSTNAD),
            ("6300", "Leie lokaler", KontoType.KOSTNAD),
            ("6500", "Verktøy og inventar", KontoType.KOSTNAD),
            ("6600", "Reparasjon og vedlikehold", KontoType.KOSTNAD),
            ("6700", "Fremmed tjeneste (Regnskap)", KontoType.KOSTNAD),
            ("6900", "Telefon og porto", KontoType.KOSTNAD),
            ("7500", "Forsikringspremie", KontoType.KOSTNAD),
            ("7770", "Bank og kortgebyr", KontoType.KOSTNAD)
        ]
        for kode, navn, type in standard_kontoer:
            self.opprett_konto(kode, navn, type)

    def logg_hendelse(self, hendelse: str, beskrivelse: str):
        tid = datetime.datetime.now().isoformat()
        self.db.conn.execute(
            "INSERT INTO system_logg (tidspunkt, hendelse, beskrivelse) VALUES (?, ?, ?)",
            (tid, hendelse, beskrivelse)
        )
        self.db.conn.commit()

    def hent_lasedato(self) -> Optional[datetime.date]:
        cursor = self.db.conn.execute("SELECT verdi FROM system_innstillinger WHERE nokkel = 'lasedato'")
        row = cursor.fetchone()
        if row:
            return datetime.date.fromisoformat(row['verdi'])
        return None

    def sett_lasedato(self, dato: datetime.date):
        self.db.conn.execute(
            "INSERT OR REPLACE INTO system_innstillinger (nokkel, verdi) VALUES ('lasedato', ?)",
            (dato.isoformat(),)
        )
        self.db.conn.commit()
        self.logg_hendelse("PERIODE_STENGT", f"Regnskapet er låst for endringer t.o.m {dato}")

    def hent_logg(self) -> List[Dict]:
        cursor = self.db.conn.execute("SELECT * FROM system_logg ORDER BY id DESC LIMIT 50")
        return [dict(row) for row in cursor.fetchall()]

    def bokfor_transaksjon(self, dato: datetime.date, beskrivelse: str, posteringer: List[Postering], faktura_ref: int = None):
        # Sjekk om perioden er låst
        lasedato = self.hent_lasedato()
        if lasedato and dato <= lasedato:
            raise ValueError(f"Kan ikke bokføre på dato {dato}. Perioden er låst t.o.m {lasedato}.")

        # Prinsippet om dobbelt bokholderi: Summen av posteringer må være 0
        total = sum(p.belop for p in posteringer)
        
        if abs(total) > 0.01:
            raise ValueError(f"Transaksjonen balanserer ikke. Differanse: {total}")

        cursor = self.db.conn.cursor()
        
        # Opprett transaksjonshode
        cursor.execute(
            "INSERT INTO transaksjon (dato, beskrivelse, faktura_ref) VALUES (?, ?, ?)",
            (dato.isoformat(), beskrivelse, faktura_ref)
        )
        transaksjon_id = cursor.lastrowid

        # Lagre posteringer
        for p in posteringer:
            cursor.execute(
                "INSERT INTO postering (transaksjon_id, konto_kode, belop, kunde_id) VALUES (?, ?, ?, ?)",
                (transaksjon_id, p.konto_kode, p.belop, p.kunde_id)
            )
        
        self.db.conn.commit()
        print(f"Bokført transaksjon ID {transaksjon_id}: {beskrivelse}")
        self.logg_hendelse("BOKFØRING", f"Bokført transaksjon ID {transaksjon_id}: {beskrivelse}")

    def vis_balanse(self):
        print("\n--- Balanserapport ---")
        print(f"{'Kode':<6} {'Navn':<20} {'Saldo':>10}")
        print("-" * 40)
        
        cursor = self.db.conn.execute("SELECT kode, navn FROM konto ORDER BY kode")
        kontoer = cursor.fetchall()
        
        for rad in kontoer:
            kode = rad['kode']
            navn = rad['navn']
            
            # Beregn saldo fra databasen
            saldo_cursor = self.db.conn.execute(
                "SELECT SUM(belop) as saldo FROM postering WHERE konto_kode = ?", (kode,)
            )
            saldo = saldo_cursor.fetchone()['saldo'] or 0.0
            
            if abs(saldo) > 0.001: # Vis kun kontoer med bevegelse
                print(f"{kode:<6} {navn:<20} {saldo:>10.2f}")

    def hent_balanse_data(self) -> List[Dict]:
        """Returnerer balansedata for bruk i UI."""
        cursor = self.db.conn.execute("SELECT kode, navn FROM konto ORDER BY kode")
        data = []
        for rad in cursor.fetchall():
            saldo_cursor = self.db.conn.execute(
                "SELECT SUM(belop) as saldo FROM postering WHERE konto_kode = ?", (rad['kode'],)
            )
            saldo = saldo_cursor.fetchone()['saldo'] or 0.0
            if abs(saldo) > 0.001:
                data.append({"Kode": rad['kode'], "Navn": rad['navn'], "Saldo": saldo})
        return data

    def hent_alle_kontoer(self) -> List[Dict]:
        """Henter hele kontoplanen, også de uten saldo."""
        cursor = self.db.conn.execute("SELECT kode, navn, type FROM konto ORDER BY kode")
        # Konverterer rows til dict
        return [dict(rad) for rad in cursor.fetchall()]

    def hent_reskontro_oversikt(self) -> List[Dict]:
        """Henter saldo per kunde på konto 1500."""
        query = """
            SELECT k.id, k.navn, k.seksjonsnummer, SUM(p.belop) as saldo
            FROM postering p
            JOIN kunde k ON p.kunde_id = k.id
            WHERE p.konto_kode = '1500'
            GROUP BY k.id, k.navn, k.seksjonsnummer
        """
        cursor = self.db.conn.execute(query)
        return [dict(row) for row in cursor.fetchall() if abs(row['saldo']) > 0.01]

    def hent_apne_poster(self, kunde_id: Optional[int] = None) -> List[Dict]:
        query = """
            SELECT
                f.id,
                f.dato,
                f.forfallsdato,
                f.total_belop,
                f.status,
                k.navn,
                k.seksjonsnummer,
                COALESCE(SUM(ik.belop), 0) as betalt,
                f.total_belop - COALESCE(SUM(ik.belop), 0) as restsaldo
            FROM faktura f
            JOIN kunde k ON f.kunde_id = k.id
            LEFT JOIN innbetaling_kobling ik ON ik.faktura_id = f.id
            WHERE f.status != 'CREDITED'
        """
        params = []
        if kunde_id is not None:
            query += " AND f.kunde_id = ?"
            params.append(kunde_id)
        query += " GROUP BY f.id, f.dato, f.forfallsdato, f.total_belop, f.status, k.navn, k.seksjonsnummer HAVING restsaldo > 0.01 ORDER BY f.forfallsdato ASC, f.id ASC"
        cursor = self.db.conn.execute(query, params)
        return [dict(row) for row in cursor.fetchall()]

    def hent_ubekreftede_banktransaksjoner(self) -> List[Dict]:
        """Henter alle posteringer på bank (1920) som ikke er avstemt."""
        query = """
            SELECT p.id, t.dato, t.beskrivelse, p.belop, p.avstemt
            FROM postering p
            JOIN transaksjon t ON p.transaksjon_id = t.id
            WHERE p.konto_kode = '1920' AND (p.avstemt = 0 OR p.avstemt IS NULL)
            ORDER BY t.dato DESC
        """
        cursor = self.db.conn.execute(query)
        return [dict(row) for row in cursor.fetchall()]

    def oppdater_avstemming(self, postering_id: int, er_avstemt: bool):
        self.db.conn.execute(
            "UPDATE postering SET avstemt = ? WHERE id = ?",
            (1 if er_avstemt else 0, postering_id)
        )
        self.db.conn.commit()

    def nullstill_data(self):
        """Sletter transaksjoner, fakturaer og kunder. Beholder kontoplan og innstillinger."""
        self.db.conn.execute("DELETE FROM postering")
        self.db.conn.execute("DELETE FROM transaksjon")
        self.db.conn.execute("DELETE FROM faktura")
        self.db.conn.execute("DELETE FROM innbetaling_kobling")
        self.db.conn.execute("DELETE FROM kunde")
        self.db.conn.execute("DELETE FROM system_logg")
        self.db.conn.execute("DELETE FROM system_innstillinger")
        self.db.conn.execute("DELETE FROM faktura_avtale")
        self.db.conn.commit()


class ReskontroManager:
    def __init__(self, db: Database):
        self.db = db

    def registrer_kunde(self, navn: str, epost: str, tlf: str, adresse: str, seksjonsnummer: str = "", sameiebrok: float = 0.0, areal: float = 0.0) -> Kunde:
        cursor = self.db.conn.cursor()
        cursor.execute(
            "INSERT INTO kunde (navn, epost, telefon, adresse, seksjonsnummer, sameiebrok, areal) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (navn, epost, tlf, adresse, seksjonsnummer, sameiebrok, areal)
        )
        self.db.conn.commit()
        return Kunde(cursor.lastrowid, navn, epost, tlf, adresse, seksjonsnummer, sameiebrok, areal)

    def hent_kunde(self, kunde_id: int) -> Optional[Kunde]:
        cursor = self.db.conn.execute("SELECT * FROM kunde WHERE id = ?", (kunde_id,))
        row = cursor.fetchone()
        if row:
            return Kunde(row['id'], row['navn'], row['epost'], row['telefon'], row['adresse'], row['seksjonsnummer'] or '', row['sameiebrok'] or 0.0, row['areal'] or 0.0)
        return None

    def hent_alle_kunder(self) -> List[Kunde]:
        cursor = self.db.conn.execute("SELECT * FROM kunde ORDER BY navn")
        rader = cursor.fetchall()
        return [Kunde(r['id'], r['navn'], r['epost'], r['telefon'], r['adresse'], r['seksjonsnummer'] or '', r['sameiebrok'] or 0.0, r['areal'] or 0.0) for r in rader]

    def slett_kunde(self, kunde_id: int):
        self.db.conn.execute("DELETE FROM kunde WHERE id = ?", (kunde_id,))
        self.db.conn.commit()

class SelskapManager:
    def __init__(self, db: Database):
        self.db = db

    def lagre_info(self, info: SelskapInfo):
        cursor = self.db.conn.cursor()
        # Vi bruker INSERT OR REPLACE for å sikre at vi alltid bare har én rad med ID 1
        cursor.execute("""
            INSERT OR REPLACE INTO selskap (id, navn, adresse, orgnr, bankkonto, epost_avsender, epost_passord)
            VALUES (1, ?, ?, ?, ?, ?, ?)
        """, (info.navn, info.adresse, info.orgnr, info.bankkonto, info.epost_avsender, info.epost_passord))
        self.db.conn.commit()

    def hent_info(self) -> SelskapInfo:
        cursor = self.db.conn.execute("SELECT * FROM selskap WHERE id = 1")
        row = cursor.fetchone()
        if row:
            return SelskapInfo(row['navn'], row['adresse'], row['orgnr'], row['bankkonto'], row['epost_avsender'], row['epost_passord'])
        # Returner tom info hvis ikke satt opp
        return SelskapInfo("Mitt Sameie", "", "", "", "", "")

class AvtaleManager:
    def __init__(self, db: Database):
        self.db = db

    def opprett_avtale(self, kunde_id: int, frekvens: int, start_dato: datetime.date, belop: float, beskrivelse: str, konto: str, mva: int):
        self.db.conn.execute("""
            INSERT INTO faktura_avtale (kunde_id, frekvens, neste_forfall, belop, beskrivelse, inntektskonto, mva_sats)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (kunde_id, frekvens, start_dato.isoformat(), belop, beskrivelse, konto, mva))
        self.db.conn.commit()

    def hent_alle_avtaler(self) -> List[Dict]:
        query = """
            SELECT a.*, k.navn as kunde_navn, k.seksjonsnummer
            FROM faktura_avtale a
            JOIN kunde k ON a.kunde_id = k.id
            WHERE a.aktiv = 1
        """
        cursor = self.db.conn.execute(query)
        return [dict(row) for row in cursor.fetchall()]

    def slett_avtale(self, avtale_id: int):
        self.db.conn.execute("UPDATE faktura_avtale SET aktiv = 0 WHERE id = ?", (avtale_id,))
        self.db.conn.commit()

    def oppdater_neste_forfall(self, avtale_id: int, gammel_dato: datetime.date, frekvens: int):
        # Enkel logikk for å legge til måneder
        ny_mnd = gammel_dato.month + frekvens
        nytt_ar = gammel_dato.year + (ny_mnd - 1) // 12
        ny_mnd = (ny_mnd - 1) % 12 + 1
        # Håndter dager som ikke finnes (f.eks 30. feb) ved å sette til dag 28 hvis nødvendig
        ny_dag = min(gammel_dato.day, 28) 
        ny_dato = datetime.date(nytt_ar, ny_mnd, ny_dag)
        self.db.conn.execute("UPDATE faktura_avtale SET neste_forfall = ? WHERE id = ?", (ny_dato.isoformat(), avtale_id))
        self.db.conn.commit()

class FakturaManager:
    def __init__(self, db: Database, regnskap: RegnskapsSystem, reskontro: ReskontroManager, selskap_mgr: SelskapManager, avtale_mgr: AvtaleManager = None):
        self.db = db
        self.regnskap = regnskap
        self.reskontro = reskontro
        self.selskap_mgr = selskap_mgr
        self.avtale_mgr = avtale_mgr

    def opprett_faktura(self, kunde_id: int, linjer: List[FakturaLinje]):
        kunde = self.reskontro.hent_kunde(kunde_id)
        if not kunde:
            raise ValueError("Kunde finnes ikke")

        dato = datetime.date.today()
        forfall = dato + datetime.timedelta(days=14)
        total = sum(l.belop for l in linjer)

        # 1. Lagre faktura i DB
        cursor = self.db.conn.cursor()
        cursor.execute(
            "INSERT INTO faktura (kunde_id, dato, forfallsdato, total_belop) VALUES (?, ?, ?, ?)",
            (kunde_id, dato.isoformat(), forfall.isoformat(), total)
        )
        faktura_id = cursor.lastrowid
        self.db.conn.commit()

        # 2. Automatisk bokføring (Debet Kundefordringer 1500, Kredit Inntektskontoer)
        posteringer = []
        # Debet Kundefordringer (Eiendel, øker med positivt tall)
        posteringer.append(Postering("1500", total, kunde_id=kunde_id)) 
        
        # Kredit Inntekter (Inntekt, øker med negativt tall)
        for linje in linjer:
            posteringer.append(Postering(linje.inntektskonto, -linje.belop))

        beskrivelse = f"Utgående faktura #{faktura_id} - {kunde.navn}"
        self.regnskap.bokfor_transaksjon(dato, beskrivelse, posteringer, faktura_ref=faktura_id)

        # 3. Generer PDF
        selskap_info = self.selskap_mgr.hent_info()
        pdf_fil = PDFGenerator.lag_faktura_pdf(faktura_id, kunde, linjer, selskap_info, dato, forfall, total)

        # 4. Send faktura på epost med vedlegg
        EpostTjeneste.send_faktura(kunde, faktura_id, total, selskap_info, vedlegg_sti=pdf_fil)
        
        return faktura_id

    def krediter_faktura(self, faktura_id: int):
        # Hent faktura
        cursor = self.db.conn.execute("SELECT * FROM faktura WHERE id = ?", (faktura_id,))
        faktura = cursor.fetchone()
        if not faktura:
            raise ValueError("Faktura finnes ikke")
        
        if faktura['status'] == 'CREDITED':
            print("Faktura er allerede kreditert.")
            return

        # Hent opprinnelig transaksjon for å reversere den
        tr_cursor = self.db.conn.execute("SELECT * FROM transaksjon WHERE faktura_ref = ?", (faktura_id,))
        orig_transaksjon = tr_cursor.fetchone()
        
        if not orig_transaksjon:
            raise ValueError("Fant ingen regnskapstransaksjon knyttet til fakturaen.")

        # Hent opprinnelige posteringer
        p_cursor = self.db.conn.execute("SELECT * FROM postering WHERE transaksjon_id = ?", (orig_transaksjon['id'],))
        orig_posteringer = p_cursor.fetchall()

        # Lag motposteringer (reverser fortegn)
        nye_posteringer = []
        for p in orig_posteringer:
            nye_posteringer.append(Postering(p['konto_kode'], -p['belop'], kunde_id=p['kunde_id']))

        # Bokfør kreditnota
        dato = datetime.date.today()
        beskrivelse = f"Kreditnota for faktura #{faktura_id}"
        self.regnskap.bokfor_transaksjon(dato, beskrivelse, nye_posteringer, faktura_ref=faktura_id)

        # Oppdater status på faktura
        self.db.conn.execute("UPDATE faktura SET status = 'CREDITED' WHERE id = ?", (faktura_id,))
        self.db.conn.commit()

        # Send kreditnota på epost
        kunde = self.reskontro.hent_kunde(faktura['kunde_id'])
        selskap_info = self.selskap_mgr.hent_info()
        EpostTjeneste.send_faktura(kunde, faktura_id, -faktura['total_belop'], selskap_info, er_kreditnota=True)

    def hent_alle_fakturaer(self) -> List[Dict]:
        query = """
            SELECT f.id, f.dato, f.forfallsdato, f.total_belop, f.status, k.navn as kunde_navn, k.seksjonsnummer,
                   COALESCE(SUM(ik.belop), 0) as betalt,
                   f.total_belop - COALESCE(SUM(ik.belop), 0) as restsaldo
            FROM faktura f
            JOIN kunde k ON f.kunde_id = k.id
            LEFT JOIN innbetaling_kobling ik ON ik.faktura_id = f.id
            GROUP BY f.id, f.dato, f.forfallsdato, f.total_belop, f.status, k.navn, k.seksjonsnummer
            ORDER BY f.id DESC
        """
        cursor = self.db.conn.execute(query)
        return [dict(row) for row in cursor.fetchall()]

    def slett_faktura(self, faktura_id: int):
        # 1. Finn og slett transaksjoner knyttet til fakturaen
        cursor = self.db.conn.execute("SELECT id FROM transaksjon WHERE faktura_ref = ?", (faktura_id,))
        transaksjoner = cursor.fetchall()
        for t in transaksjoner:
            self.db.conn.execute("DELETE FROM postering WHERE transaksjon_id = ?", (t['id'],))
            self.db.conn.execute("DELETE FROM transaksjon WHERE id = ?", (t['id'],))
        
        # 2. Slett fakturaen
        self.db.conn.execute("DELETE FROM innbetaling_kobling WHERE faktura_id = ?", (faktura_id,))
        self.db.conn.execute("DELETE FROM faktura WHERE id = ?", (faktura_id,))
        self.db.conn.commit()

    def hent_faktura(self, faktura_id: int):
        cursor = self.db.conn.execute("SELECT * FROM faktura WHERE id = ?", (faktura_id,))
        return cursor.fetchone()

    def oppdater_faktura_status(self, faktura_id: int):
        faktura = self.hent_faktura(faktura_id)
        if not faktura or faktura['status'] == 'CREDITED':
            return

        cursor = self.db.conn.execute(
            "SELECT COALESCE(SUM(belop), 0) as betalt FROM innbetaling_kobling WHERE faktura_id = ?",
            (faktura_id,)
        )
        betalt = cursor.fetchone()['betalt'] or 0.0
        ny_status = 'PAID' if betalt >= (faktura['total_belop'] - 0.01) else 'OPEN'
        self.db.conn.execute("UPDATE faktura SET status = ? WHERE id = ?", (ny_status, faktura_id))
        self.db.conn.commit()

    def registrer_innbetaling(self, kunde_id: int, belop: float, dato: datetime.date, beskrivelse: str, faktura_id: Optional[int] = None):
        # Debet Bank (1920), Kredit Kundefordringer (1500)
        posteringer = [
            Postering("1920", belop),
            Postering("1500", -belop, kunde_id=kunde_id)
        ]
        self.regnskap.bokfor_transaksjon(dato, beskrivelse, posteringer)

        if faktura_id is not None:
            transaksjon_id = self.db.conn.execute("SELECT MAX(id) as id FROM transaksjon").fetchone()['id']
            self.db.conn.execute(
                "INSERT INTO innbetaling_kobling (faktura_id, transaksjon_id, belop) VALUES (?, ?, ?)",
                (faktura_id, transaksjon_id, belop)
            )
            self.db.conn.commit()
            self.oppdater_faktura_status(faktura_id)

    def kjor_massefakturering(self, dato: datetime.date) -> int:
        """Kjører alle avtaler som forfaller på eller før gitt dato."""
        if not self.avtale_mgr:
            raise ValueError("AvtaleManager mangler")
            
        avtaler = self.avtale_mgr.hent_alle_avtaler()
        antall_opprettet = 0
        
        for avtale in avtaler:
            forfall_dato = datetime.date.fromisoformat(avtale['neste_forfall'])
            
            if forfall_dato <= dato:
                # Opprett faktura
                linje = FakturaLinje(avtale['beskrivelse'], avtale['belop'], avtale['inntektskonto'], avtale['mva_sats'])
                self.opprett_faktura(avtale['kunde_id'], [linje])
                
                # Oppdater neste forfall
                self.avtale_mgr.oppdater_neste_forfall(avtale['id'], forfall_dato, avtale['frekvens'])
                antall_opprettet += 1
                
        return antall_opprettet

if __name__ == "__main__":
    system = RegnskapsSystem()
    reskontro = ReskontroManager(system.db)
    selskap_mgr = SelskapManager(system.db)
    avtale_mgr = AvtaleManager(system.db)
    faktura_modul = FakturaManager(system.db, system, reskontro, selskap_mgr, avtale_mgr)

    # 1. Oppsett av kontoplan
    system.opprett_konto("1500", "Kundefordringer", KontoType.EIENDEL) # Viktig for fakturering
    system.opprett_konto("1900", "Bankinnskudd", KontoType.EIENDEL)
    system.opprett_konto("3000", "Felleskostnader", KontoType.INNTEKT)
    system.opprett_konto("3600", "Leieinntekt", KontoType.INNTEKT)
    system.opprett_konto("6000", "Husleie", KontoType.KOSTNAD)

    # 2. Registrer en kunde (Beboer i sameiet)
    kunde1 = reskontro.registrer_kunde(
        "Ola Nordmann", "ola@eksempel.no", "99887766", "Storgata 1, 0101 Oslo"
    )

    # 3. Opprett faktura for felleskostnader
    # Dette vil automatisk bokføre: Debet 1500, Kredit 3000
    print("\n--- Genererer Faktura ---")
    faktura_id = faktura_modul.opprett_faktura(kunde1.id, [
        FakturaLinje("Felleskostnader oktober", 4500.0, "3000"),
        FakturaLinje("Parkering", 500.0, "3600")
    ])

    # Vis balanse etter fakturering
    system.vis_balanse()

    # 4. Kreditering av faktura (hvis det ble gjort feil)
    # Dette vil automatisk reversere posteringene og sende kreditnota
    print("\n--- Krediterer Faktura ---")
    faktura_modul.krediter_faktura(faktura_id)

    # Vis balanse etter kreditering (skal være nullstilt for disse postene)
    system.vis_balanse()