from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import List, Optional
import sqlite3
import datetime
import shutil
import csv
import io
from contextlib import asynccontextmanager
import sys
import os

# Add parent directory to path to import regnskap module
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from regnskap import (
    RegnskapsSystem, ReskontroManager, FakturaManager, 
    SelskapManager, AvtaleManager, FakturaLinje, SelskapInfo, KontoType, EpostTjeneste
)

DEFAULT_SENDER_EMAIL = "jcmadsen@gmail.com"

# Initialize database connection
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    app.state.system = RegnskapsSystem()
    app.state.reskontro = ReskontroManager(app.state.system.db)
    app.state.selskap = SelskapManager(app.state.system.db)
    app.state.avtaler = AvtaleManager(app.state.system.db)
    app.state.faktura = FakturaManager(
        app.state.system.db, 
        app.state.system, 
        app.state.reskontro, 
        app.state.selskap, 
        app.state.avtaler
    )
    # Create bilag table if it doesn't exist
    app.state.system.db.conn.execute("""
        CREATE TABLE IF NOT EXISTS bilag (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            transaksjon_id INTEGER NOT NULL,
            filnavn TEXT NOT NULL,
            original_filnavn TEXT NOT NULL,
            filsti TEXT NOT NULL,
            opplastet_dato TEXT NOT NULL,
            FOREIGN KEY(transaksjon_id) REFERENCES transaksjon(id)
        )
    """)
    # Konto-avstemming: mark individual posterings as reconciled
    app.state.system.db.conn.execute("""
        CREATE TABLE IF NOT EXISTS postering_avstemt (
            postering_id INTEGER PRIMARY KEY,
            avstemt_dato TEXT NOT NULL,
            FOREIGN KEY(postering_id) REFERENCES postering(id)
        )
    """)
    # Debet/kredit matching within an account
    app.state.system.db.conn.execute("""
        CREATE TABLE IF NOT EXISTS postering_match (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            debet_id INTEGER NOT NULL,
            kredit_id INTEGER NOT NULL,
            konto_kode TEXT NOT NULL,
            matchet_dato TEXT NOT NULL,
            FOREIGN KEY(debet_id) REFERENCES postering(id),
            FOREIGN KEY(kredit_id) REFERENCES postering(id)
        )
    """)
    # Bank import table (imported CSV lines from DNB)
    app.state.system.db.conn.execute("""
        CREATE TABLE IF NOT EXISTS bankpost (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            dato TEXT NOT NULL,
            tekst TEXT,
            belop REAL NOT NULL,
            import_dato TEXT NOT NULL,
            periode TEXT NOT NULL
        )
    """)
    # Matching table (bankpost <-> postering in 1920)
    app.state.system.db.conn.execute("""
        CREATE TABLE IF NOT EXISTS bank_matching (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            bankpost_id INTEGER NOT NULL,
            postering_id INTEGER NOT NULL,
            matchet_dato TEXT NOT NULL,
            FOREIGN KEY(bankpost_id) REFERENCES bankpost(id),
            FOREIGN KEY(postering_id) REFERENCES postering(id)
        )
    """)
    # Create bilag folder if it doesn't exist
    bilag_mappe = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "bilag")
    if not os.path.exists(bilag_mappe):
        os.makedirs(bilag_mappe)
    app.state.system.db.conn.commit()
    yield
    # Shutdown
    app.state.system.db.conn.close()

app = FastAPI(title="Sameie Regnskap API", lifespan=lifespan)

# CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Pydantic models
class BoligCreate(BaseModel):
    navn: str
    epost: str
    telefon: str = ""
    adresse: str = ""
    seksjonsnummer: str = ""
    sameiebrok: float = 0.0
    areal: float = 0.0

class BoligResponse(BaseModel):
    id: int
    navn: str
    epost: str
    telefon: str
    adresse: str
    seksjonsnummer: str
    sameiebrok: float
    areal: float

class FakturaLinjeCreate(BaseModel):
    beskrivelse: str
    belop: float
    inntektskonto: str = "3000"
    mva_sats: int = 0

class FakturaCreate(BaseModel):
    bolig_id: int
    linjer: List[FakturaLinjeCreate]

class InnbetalingCreate(BaseModel):
    bolig_id: int
    belop: float
    dato: str
    beskrivelse: str
    faktura_id: Optional[int] = None

class ApenPostResponse(BaseModel):
    id: int
    dato: str
    forfallsdato: str
    total_belop: float
    status: str
    navn: str
    seksjonsnummer: str
    betalt: float
    restsaldo: float

class ReskontroOversikt(BaseModel):
    id: int
    navn: str
    seksjonsnummer: str
    saldo: float

class BalanseRad(BaseModel):
    Kode: str
    Navn: str
    Saldo: float

class ResultatRad(BaseModel):
    Kode: str
    Navn: str
    Type: str
    Saldo: float

class BankTransaksjonRad(BaseModel):
    id: int
    dato: str
    beskrivelse: str
    belop: float
    avstemt: Optional[int] = 0

class ReskontroAvstemmingResponse(BaseModel):
    hovedbok_saldo: float
    apne_poster_sum: float
    differanse: float

class EpostInnstillingerResponse(BaseModel):
    navn: str
    adresse: str
    orgnr: str
    bankkonto: str
    epost_avsender: str
    app_passord_satt: bool

class EpostInnstillingerUpdate(BaseModel):
    navn: str = "Mitt Sameie"
    adresse: str = ""
    orgnr: str = ""
    bankkonto: str = ""
    epost_avsender: str = DEFAULT_SENDER_EMAIL
    epost_passord: str = ""

def hent_selskap_info_med_default() -> SelskapInfo:
    info = app.state.selskap.hent_info()
    if not info.epost_avsender:
        return SelskapInfo(info.navn, info.adresse, info.orgnr, info.bankkonto, DEFAULT_SENDER_EMAIL, info.epost_passord)
    return info

def finn_pdf_sti(faktura_id: int) -> str:
    faktura = app.state.faktura.hent_faktura(faktura_id)
    if not faktura:
        raise HTTPException(status_code=404, detail="Faktura finnes ikke")
    kunde = app.state.reskontro.hent_kunde(faktura['kunde_id'])
    if not kunde:
        raise HTTPException(status_code=404, detail="Bolig finnes ikke")
    safe_navn = "".join([c for c in kunde.navn if c.isalnum() or c in (' ', '.', '_', '-')]).strip()
    filnavn = f"Faktura_{faktura_id}_{safe_navn}.pdf"
    full_sti = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "fakturaer", filnavn)
    if not os.path.exists(full_sti):
        raise HTTPException(status_code=404, detail="PDF finnes ikke for denne fakturaen")
    return full_sti

# Endpoints
@app.get("/api/boliger", response_model=List[BoligResponse])
def hent_boliger():
    kunder = app.state.reskontro.hent_alle_kunder()
    return [BoligResponse(
        id=k.id, navn=k.navn, epost=k.epost, telefon=k.telefon,
        adresse=k.adresse, seksjonsnummer=k.seksjonsnummer,
        sameiebrok=k.sameiebrok, areal=k.areal
    ) for k in kunder]

@app.post("/api/boliger", response_model=BoligResponse)
def opprett_bolig(bolig: BoligCreate):
    kunde = app.state.reskontro.registrer_kunde(
        bolig.navn, bolig.epost, bolig.telefon, bolig.adresse,
        bolig.seksjonsnummer, bolig.sameiebrok, bolig.areal
    )
    return BoligResponse(
        id=kunde.id, navn=kunde.navn, epost=kunde.epost, telefon=kunde.telefon,
        adresse=kunde.adresse, seksjonsnummer=kunde.seksjonsnummer,
        sameiebrok=kunde.sameiebrok, areal=kunde.areal
    )

@app.delete("/api/boliger/{bolig_id}")
def slett_bolig(bolig_id: int):
    try:
        app.state.reskontro.slett_kunde(bolig_id)
        return {"message": f"Bolig {bolig_id} slettet"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/apne-poster", response_model=List[ApenPostResponse])
def hent_apne_poster(bolig_id: Optional[int] = None):
    poster = app.state.system.hent_apne_poster(bolig_id)
    return [ApenPostResponse(
        id=p['id'], dato=p['dato'], forfallsdato=p['forfallsdato'],
        total_belop=p['total_belop'], status=p['status'],
        navn=p['navn'], seksjonsnummer=p['seksjonsnummer'],
        betalt=p['betalt'], restsaldo=p['restsaldo']
    ) for p in poster]

@app.get("/api/reskontro", response_model=List[ReskontroOversikt])
def hent_reskontro():
    data = app.state.system.hent_reskontro_oversikt()
    return [ReskontroOversikt(
        id=r['id'], navn=r['navn'], seksjonsnummer=r['seksjonsnummer'], saldo=r['saldo']
    ) for r in data]

@app.get("/api/balanse", response_model=List[BalanseRad])
def hent_balanse():
    data = app.state.system.hent_balanse_data()
    return [BalanseRad(Kode=r['Kode'], Navn=r['Navn'], Saldo=r['Saldo']) for r in data]

@app.get("/api/resultat", response_model=List[ResultatRad])
def hent_resultat(ar: Optional[int] = None):
    if ar:
        query = """
            SELECT k.kode as Kode, k.navn as Navn, k.type as Type, COALESCE(SUM(p.belop), 0) as Saldo
            FROM konto k
            LEFT JOIN postering p ON p.konto_kode = k.kode
            LEFT JOIN transaksjon t ON p.transaksjon_id = t.id
            WHERE k.type IN (?, ?) AND (t.dato IS NULL OR strftime('%Y', t.dato) = ?)
            GROUP BY k.kode, k.navn, k.type
            HAVING ABS(COALESCE(SUM(p.belop), 0)) > 0.001
            ORDER BY k.kode
        """
        cursor = app.state.system.db.conn.execute(query, (KontoType.INNTEKT.value, KontoType.KOSTNAD.value, str(ar)))
    else:
        query = """
            SELECT k.kode as Kode, k.navn as Navn, k.type as Type, COALESCE(SUM(p.belop), 0) as Saldo
            FROM konto k
            LEFT JOIN postering p ON p.konto_kode = k.kode
            WHERE k.type IN (?, ?)
            GROUP BY k.kode, k.navn, k.type
            HAVING ABS(COALESCE(SUM(p.belop), 0)) > 0.001
            ORDER BY k.kode
        """
        cursor = app.state.system.db.conn.execute(query, (KontoType.INNTEKT.value, KontoType.KOSTNAD.value))
    return [ResultatRad(**dict(rad)) for rad in cursor.fetchall()]

@app.get("/api/avstemming/bank", response_model=List[BankTransaksjonRad])
def hent_bankavstemming():
    data = app.state.system.hent_ubekreftede_banktransaksjoner()
    return [BankTransaksjonRad(**rad) for rad in data]

@app.get("/api/avstemming/reskontro", response_model=ReskontroAvstemmingResponse)
def hent_reskontroavstemming():
    hovedbok = 0.0
    cursor = app.state.system.db.conn.execute("SELECT COALESCE(SUM(belop), 0) as saldo FROM postering WHERE konto_kode = '1500'")
    rad = cursor.fetchone()
    if rad:
        hovedbok = rad['saldo'] or 0.0
    apne_poster = app.state.system.hent_apne_poster()
    apne_sum = sum(post['restsaldo'] for post in apne_poster)
    return ReskontroAvstemmingResponse(hovedbok_saldo=hovedbok, apne_poster_sum=apne_sum, differanse=round(hovedbok - apne_sum, 2))

@app.get("/api/fakturaer")
def hent_fakturaer():
    return app.state.faktura.hent_alle_fakturaer()

@app.post("/api/fakturaer")
def opprett_faktura(faktura: FakturaCreate):
    linjer = [FakturaLinje(l.beskrivelse, l.belop, l.inntektskonto, l.mva_sats) for l in faktura.linjer]
    faktura_id = app.state.faktura.opprett_faktura(faktura.bolig_id, linjer)
    return {"id": faktura_id, "message": "Faktura opprettet"}

@app.post("/api/innbetalinger")
def registrer_innbetaling(innbetaling: InnbetalingCreate):
    dato = datetime.date.fromisoformat(innbetaling.dato)
    transaksjon_id = app.state.faktura.registrer_innbetaling(
        innbetaling.bolig_id, innbetaling.belop, dato,
        innbetaling.beskrivelse, innbetaling.faktura_id
    )
    return {"message": "Innbetaling registrert", "transaksjon_id": transaksjon_id}

@app.post("/api/bilag/{transaksjon_id}")
async def last_opp_bilag(transaksjon_id: int, fil: UploadFile = File(...)):
    bilag_mappe = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "bilag")
    fil_extension = os.path.splitext(fil.filename)[1]
    sikker_filnavn = f"{transaksjon_id}_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}{fil_extension}"
    filsti = os.path.join(bilag_mappe, sikker_filnavn)
    
    with open(filsti, "wb") as buffer:
        shutil.copyfileobj(fil.file, buffer)
    
    app.state.system.db.conn.execute(
        "INSERT INTO bilag (transaksjon_id, filnavn, original_filnavn, filsti, opplastet_dato) VALUES (?, ?, ?, ?, ?)",
        (transaksjon_id, sikker_filnavn, fil.filename, filsti, datetime.datetime.now().isoformat())
    )
    app.state.system.db.conn.commit()
    
    return {"message": "Bilag lastet opp", "filnavn": sikker_filnavn}

@app.get("/api/bilag/transaksjon/{transaksjon_id}")
def hent_bilag_for_transaksjon(transaksjon_id: int):
    cursor = app.state.system.db.conn.execute(
        "SELECT id, filnavn, original_filnavn, opplastet_dato FROM bilag WHERE transaksjon_id = ?",
        (transaksjon_id,)
    )
    return [{"id": r['id'], "filnavn": r['filnavn'], "original_filnavn": r['original_filnavn'], "opplastet_dato": r['opplastet_dato']} for r in cursor.fetchall()]

@app.get("/api/bilag/{bilag_id}")
def hent_bilag_fil(bilag_id: int):
    cursor = app.state.system.db.conn.execute("SELECT filsti, original_filnavn FROM bilag WHERE id = ?", (bilag_id,))
    rad = cursor.fetchone()
    if not rad:
        raise HTTPException(status_code=404, detail="Bilag finnes ikke")
    return FileResponse(rad['filsti'], filename=rad['original_filnavn'])

@app.get("/api/resultat/oppstilling")
def hent_resultat_oppstilling(ar: Optional[int] = None):
    """
    Returnerer resultatregnskap i lovmessig oppstilling (Regnskapsloven §6-1 forenklet).
    Grupperinger:
      - Driftsinntekter: 3000-3999
      - Driftskostnader: 4000-7999
      - Finansinntekter: 8000-8099
      - Finanskostnader: 8100-8299
    """
    conn = app.state.system.db.conn
    ar_filter = str(ar) if ar else None

    def hent_linjer(kode_fra: str, kode_til: str) -> list:
        if ar_filter:
            rader = conn.execute("""
                SELECT k.kode, k.navn, COALESCE(SUM(p.belop), 0) as saldo
                FROM konto k
                LEFT JOIN postering p ON p.konto_kode = k.kode
                LEFT JOIN transaksjon t ON p.transaksjon_id = t.id
                WHERE k.kode >= ? AND k.kode < ?
                  AND (t.dato IS NULL OR strftime('%Y', t.dato) = ?)
                GROUP BY k.kode, k.navn
                HAVING ABS(COALESCE(SUM(p.belop), 0)) > 0.001
                ORDER BY k.kode
            """, (kode_fra, kode_til, ar_filter)).fetchall()
        else:
            rader = conn.execute("""
                SELECT k.kode, k.navn, COALESCE(SUM(p.belop), 0) as saldo
                FROM konto k
                LEFT JOIN postering p ON p.konto_kode = k.kode
                WHERE k.kode >= ? AND k.kode < ?
                GROUP BY k.kode, k.navn
                HAVING ABS(COALESCE(SUM(p.belop), 0)) > 0.001
                ORDER BY k.kode
            """, (kode_fra, kode_til)).fetchall()
        return [{"kode": r["kode"], "navn": r["navn"], "saldo": r["saldo"]} for r in rader]

    driftsinntekter = hent_linjer("3000", "4000")
    driftskostnader = hent_linjer("4000", "8000")
    finansinntekter = hent_linjer("8000", "8100")
    finanskostnader = hent_linjer("8100", "8300")

    sum_driftsinntekter = sum(r["saldo"] for r in driftsinntekter)
    sum_driftskostnader = sum(r["saldo"] for r in driftskostnader)
    driftsresultat = sum_driftsinntekter + sum_driftskostnader

    sum_finansinntekter = sum(r["saldo"] for r in finansinntekter)
    sum_finanskostnader = sum(r["saldo"] for r in finanskostnader)
    netto_finans = sum_finansinntekter + sum_finanskostnader

    arsresultat = driftsresultat + netto_finans

    return {
        "ar": ar,
        "driftsinntekter": {"linjer": driftsinntekter, "sum": sum_driftsinntekter},
        "driftskostnader": {"linjer": driftskostnader, "sum": sum_driftskostnader},
        "driftsresultat": driftsresultat,
        "finansinntekter": {"linjer": finansinntekter, "sum": sum_finansinntekter},
        "finanskostnader": {"linjer": finanskostnader, "sum": sum_finanskostnader},
        "netto_finans": netto_finans,
        "arsresultat": arsresultat,
    }

@app.get("/api/analyse")
def hent_analyse(ar: Optional[int] = None):
    """
    Beregner nøkkeltall og genererer regelbaserte kommentarer på norsk.
    """
    conn = app.state.system.db.conn
    ar_filter = str(ar) if ar else None

    def saldo_kodeintervall(fra: str, til: str, ar_f: Optional[str] = None) -> float:
        if ar_f:
            r = conn.execute("""
                SELECT COALESCE(SUM(p.belop),0) FROM postering p
                JOIN transaksjon t ON p.transaksjon_id=t.id
                WHERE p.konto_kode >= ? AND p.konto_kode < ?
                  AND strftime('%Y', t.dato) = ?
            """, (fra, til, ar_f)).fetchone()
        else:
            r = conn.execute("""
                SELECT COALESCE(SUM(p.belop),0) FROM postering p
                WHERE p.konto_kode >= ? AND p.konto_kode < ?
            """, (fra, til)).fetchone()
        return r[0] if r else 0.0

    def saldo_kode(kode: str) -> float:
        r = conn.execute("SELECT COALESCE(SUM(belop),0) FROM postering WHERE konto_kode=?", (kode,)).fetchone()
        return r[0] if r else 0.0

    # --- Resultat ---
    inntekter_raw = saldo_kodeintervall("3000", "4000", ar_filter)   # negativ i DB
    kostnader_raw = saldo_kodeintervall("4000", "8000", ar_filter)   # positiv i DB
    finans_inn_raw = saldo_kodeintervall("8000", "8100", ar_filter)
    finans_kost_raw = saldo_kodeintervall("8100", "8300", ar_filter)

    driftsinntekter = -inntekter_raw          # gjør positiv
    driftskostnader = kostnader_raw           # allerede positiv
    driftsresultat = driftsinntekter - driftskostnader
    arsresultat = driftsresultat + (-finans_inn_raw) - finans_kost_raw

    # --- Balanse (uten årsfilter — balansekontoer akkumuleres over tid) ---
    def saldo_bal(fra: str, til: str) -> float:
        r = conn.execute("""
            SELECT COALESCE(SUM(p.belop),0) FROM postering p
            WHERE p.konto_kode >= ? AND p.konto_kode < ?
        """, (fra, til)).fetchone()
        return r[0] if r else 0.0

    # Eiendeler er debet = positiv saldo i DB
    omloepsmidler = saldo_bal("1500", "2000")   # fordringer + bank
    anleggsmidler = saldo_bal("1000", "1500")   # anleggsmidler
    totale_eiendeler = omloepsmidler + anleggsmidler

    # Gjeld/EK er kredit = negativ saldo i DB, vi viser som positiv
    kortsiktig_gjeld = -saldo_bal("2400", "3000")
    langsiktig_gjeld = -saldo_bal("2200", "2400")
    egenkapital = -saldo_bal("2000", "2200")
    total_gjeld = kortsiktig_gjeld + langsiktig_gjeld

    # --- Nøkkeltall ---
    driftsmargin = (driftsresultat / driftsinntekter * 100) if driftsinntekter > 0.01 else None
    nettoresultatmargin = (arsresultat / driftsinntekter * 100) if driftsinntekter > 0.01 else None
    likviditetsgrad = (omloepsmidler / kortsiktig_gjeld) if kortsiktig_gjeld > 0.01 else None
    egenkapitalandel = (egenkapital / totale_eiendeler * 100) if totale_eiendeler > 0.01 else None
    gjeldgrad = (total_gjeld / egenkapital) if egenkapital > 0.01 else None

    def fmt_kr(v: float) -> str:
        return f"{v:,.0f} kr".replace(",", " ")

    # --- Kommentarer ---
    kommentarer = []

    # Resultat
    if driftsinntekter < 0.01:
        kommentarer.append({
            "kategori": "Inntekter",
            "nivaa": "advarsel",
            "tekst": "Det er ingen registrerte driftsinntekter for valgt periode. Kontroller at posteringer er lagt inn med riktig dato og konto."
        })
    else:
        kommentarer.append({
            "kategori": "Inntekter",
            "nivaa": "info",
            "tekst": f"Driftsinntektene er {fmt_kr(driftsinntekter)} for perioden."
        })

    if driftsresultat > 0:
        kommentarer.append({
            "kategori": "Driftsresultat",
            "nivaa": "positiv",
            "tekst": f"Positivt driftsresultat på {fmt_kr(driftsresultat)}. Driften går med overskudd."
        })
    elif driftsresultat < 0:
        kommentarer.append({
            "kategori": "Driftsresultat",
            "nivaa": "advarsel",
            "tekst": f"Negativt driftsresultat på {fmt_kr(abs(driftsresultat))}. Kostnadene overstiger inntektene — vurder kostnadsreduksjoner."
        })

    if driftsmargin is not None:
        if driftsmargin >= 15:
            nivaa = "positiv"
            tekst = f"Driftsmarginen er {driftsmargin:.1f} % — god lønnsomhet."
        elif driftsmargin >= 5:
            nivaa = "ok"
            tekst = f"Driftsmarginen er {driftsmargin:.1f} % — akseptabel lønnsomhet."
        elif driftsmargin >= 0:
            nivaa = "advarsel"
            tekst = f"Driftsmarginen er {driftsmargin:.1f} % — svak lønnsomhet. Inntjeningen bør forbedres."
        else:
            nivaa = "advarsel"
            tekst = f"Driftsmarginen er negativ ({driftsmargin:.1f} %). Driften er ikke lønnsom i perioden."
        kommentarer.append({"kategori": "Driftsmargin", "nivaa": nivaa, "tekst": tekst})

    # Likviditet
    if likviditetsgrad is not None:
        if likviditetsgrad >= 2.0:
            nivaa = "positiv"
            tekst = f"Likviditetsgrad 1 er {likviditetsgrad:.2f} — god betalingsevne. Omsetningsmidlene dekker godt over kortsiktig gjeld."
        elif likviditetsgrad >= 1.0:
            nivaa = "ok"
            tekst = f"Likviditetsgrad 1 er {likviditetsgrad:.2f} — tilstrekkelig betalingsevne, men bør følges."
        else:
            nivaa = "advarsel"
            tekst = f"Likviditetsgrad 1 er {likviditetsgrad:.2f} — under 1,0. Det kan være utfordringer med å betjene kortsiktig gjeld."
        kommentarer.append({"kategori": "Likviditet", "nivaa": nivaa, "tekst": tekst})

    # Egenkapital
    if egenkapitalandel is not None:
        if egenkapitalandel >= 30:
            nivaa = "positiv"
            tekst = f"Egenkapitalandelen er {egenkapitalandel:.1f} % — solid finansiering."
        elif egenkapitalandel >= 15:
            nivaa = "ok"
            tekst = f"Egenkapitalandelen er {egenkapitalandel:.1f} % — akseptabel soliditet."
        else:
            nivaa = "advarsel"
            tekst = f"Egenkapitalandelen er {egenkapitalandel:.1f} % — lav soliditet. Høy gjeldsgrad øker den finansielle risikoen."
        kommentarer.append({"kategori": "Soliditet", "nivaa": nivaa, "tekst": tekst})

    # Kostnadsstruktur — finn største kostnadspost
    kost_rader = conn.execute("""
        SELECT k.navn, COALESCE(SUM(p.belop),0) as saldo
        FROM konto k JOIN postering p ON p.konto_kode=k.kode
        JOIN transaksjon t ON p.transaksjon_id=t.id
        WHERE k.kode >= '4000' AND k.kode < '8000'
          """ + (f"AND strftime('%Y', t.dato) = '{ar_filter}'" if ar_filter else "") + """
        GROUP BY k.kode, k.navn
        ORDER BY saldo DESC LIMIT 1
    """).fetchone()
    if kost_rader and kost_rader[1] > 0 and driftskostnader > 0:
        andel = kost_rader[1] / driftskostnader * 100
        kommentarer.append({
            "kategori": "Kostnadsstruktur",
            "nivaa": "info",
            "tekst": f"Største kostnadspost er «{kost_rader[0]}» med {fmt_kr(kost_rader[1])} ({andel:.0f} % av totale driftskostnader)."
        })

    return {
        "ar": ar,
        "nokkeltal": {
            "driftsinntekter": driftsinntekter,
            "driftskostnader": driftskostnader,
            "driftsresultat": driftsresultat,
            "arsresultat": arsresultat,
            "driftsmargin_pst": round(driftsmargin, 2) if driftsmargin is not None else None,
            "nettoresultatmargin_pst": round(nettoresultatmargin, 2) if nettoresultatmargin is not None else None,
            "likviditetsgrad": round(likviditetsgrad, 2) if likviditetsgrad is not None else None,
            "egenkapitalandel_pst": round(egenkapitalandel, 2) if egenkapitalandel is not None else None,
            "gjeldgrad": round(gjeldgrad, 2) if gjeldgrad is not None else None,
            "omloepsmidler": omloepsmidler,
            "kortsiktig_gjeld": kortsiktig_gjeld,
            "egenkapital": egenkapital,
            "totale_eiendeler": totale_eiendeler,
        },
        "kommentarer": kommentarer,
    }

@app.get("/api/resultat/ar")
def hent_resultat_ar():
    cursor = app.state.system.db.conn.execute("""
        SELECT DISTINCT strftime('%Y', dato) as ar
        FROM transaksjon
        WHERE dato IS NOT NULL
        ORDER BY ar DESC
    """)
    ar = [int(rad['ar']) for rad in cursor.fetchall()]
    return ar


# --- RF-1140 Tredjepartsopplysninger boligsameie ---

@app.get("/api/rf1140")
def hent_rf1140(ar: Optional[int] = None):
    """
    Genererer RF-1140 tredjepartsopplysninger per sameier.
    Fordeler skattemessige inntekter, kostnader, formue og gjeld etter sameierbrøk.
    Ref: Skatteforvaltningsloven kap. 7, Skatteetaten rettledning RF-1140.
    """
    conn = app.state.system.db.conn
    ar_str = str(ar) if ar else None

    # Hent alle boliger/sameiere
    kunder = conn.execute("SELECT * FROM kunde ORDER BY seksjonsnummer").fetchall()
    total_brok = sum(float(k["sameiebrok"] or 0) for k in kunder)
    if total_brok == 0:
        total_brok = len(kunder) if kunder else 1  # lik fordeling som fallback

    def saldo_ar(fra: str, til: str) -> float:
        if ar_str:
            r = conn.execute("""
                SELECT COALESCE(SUM(p.belop),0) FROM postering p
                JOIN transaksjon t ON p.transaksjon_id = t.id
                WHERE p.konto_kode >= ? AND p.konto_kode < ?
                AND strftime('%Y', t.dato) = ?
            """, (fra, til, ar_str)).fetchone()
        else:
            r = conn.execute("""
                SELECT COALESCE(SUM(p.belop),0) FROM postering p
                WHERE p.konto_kode >= ? AND p.konto_kode < ?
            """, (fra, til)).fetchone()
        return r[0] if r else 0.0

    def saldo_bal(fra: str, til: str) -> float:
        r = conn.execute("""
            SELECT COALESCE(SUM(p.belop),0) FROM postering p
            WHERE p.konto_kode >= ? AND p.konto_kode < ?
        """, (fra, til)).fetchone()
        return r[0] if r else 0.0

    # Skattemessige beløp for hele sameiet
    # Inntekter: kun renteinntekter og lignende finansinntekter (IKKE felleskostnader/husleie)
    renteinntekter_total = -saldo_ar("8050", "8100")   # 8050-8099 Renteinntekter
    # Kostnader: kun rentekostnader på sameiets gjeld (IKKE vedlikehold, forsikring etc.)
    rentekostnader_total = saldo_ar("8100", "8200")    # 8100-8199 Rentekostnader

    # Formue: sameiets bankbeholdning + fordringer (omløpsmidler minus kundefordringer fra sameiere)
    bank_total = saldo_bal("1900", "2000")             # Bank og kontanter
    # Gjeld: langsiktig gjeld
    langsiktig_gjeld_total = -saldo_bal("2200", "2400")

    oppgaver = []
    for k in kunder:
        brok = float(k["sameiebrok"] or 0)
        if brok == 0 and total_brok > 0:
            brok = 1.0 / len(kunder)  # lik fordeling hvis brøk ikke satt
        andel = brok / total_brok if total_brok > 0 else 0

        oppgave = {
            "bolig_id": k["id"],
            "navn": k["navn"],
            "seksjonsnummer": k["seksjonsnummer"] or "",
            "epost": k["epost"] or "",
            "sameierbrok": brok,
            "andel_pst": round(andel * 100, 4),
            # Beløp som skal rapporteres til Skatteetaten (hele kr):
            "inntekter": round(renteinntekter_total * andel),
            "kostnader": round(rentekostnader_total * andel),
            "formue": round(bank_total * andel),
            "gjeld": round(langsiktig_gjeld_total * andel),
        }
        oppgaver.append(oppgave)

    return {
        "ar": ar,
        "frist": f"31. januar {(ar or 0) + 1}" if ar else "31. januar neste år",
        "opplysningsplikt": len(kunder) >= 9,
        "antall_seksjoner": len(kunder),
        "sameiets_totaler": {
            "renteinntekter": round(renteinntekter_total),
            "rentekostnader": round(rentekostnader_total),
            "bank_formue": round(bank_total),
            "langsiktig_gjeld": round(langsiktig_gjeld_total),
        },
        "oppgaver": oppgaver,
    }


# --- Årsregnskap (frivillig, men god praksis) ---

@app.get("/api/arsregnskap")
def hent_arsregnskap(ar: Optional[int] = None):
    """
    Produserer et fullstendig årsregnskap med resultatregnskap, balanse og noter.
    Tilpasset vel/sameie. Ref: Eierseksjonsloven §64, regnskapsloven (forenklede regler).
    """
    conn = app.state.system.db.conn
    ar_str = str(ar) if ar else None

    def res(fra: str, til: str) -> float:
        if ar_str:
            r = conn.execute("""
                SELECT COALESCE(SUM(p.belop),0) FROM postering p
                JOIN transaksjon t ON p.transaksjon_id = t.id
                WHERE p.konto_kode >= ? AND p.konto_kode < ?
                AND strftime('%Y', t.dato) = ?
            """, (fra, til, ar_str)).fetchone()
        else:
            r = conn.execute("""
                SELECT COALESCE(SUM(p.belop),0) FROM postering p
                WHERE p.konto_kode >= ? AND p.konto_kode < ?
            """, (fra, til)).fetchone()
        return r[0] if r else 0.0

    def bal(fra: str, til: str) -> float:
        r = conn.execute("""
            SELECT COALESCE(SUM(p.belop),0) FROM postering p
            WHERE p.konto_kode >= ? AND p.konto_kode < ?
        """, (fra, til)).fetchone()
        return r[0] if r else 0.0

    def hent_linjer_res(fra: str, til: str) -> list:
        if ar_str:
            rader = conn.execute("""
                SELECT k.kode, k.navn, COALESCE(SUM(p.belop),0) as saldo
                FROM postering p
                JOIN konto k ON p.konto_kode = k.kode
                JOIN transaksjon t ON p.transaksjon_id = t.id
                WHERE p.konto_kode >= ? AND p.konto_kode < ?
                AND strftime('%Y', t.dato) = ?
                GROUP BY k.kode, k.navn HAVING ABS(saldo) > 0.01
            """, (fra, til, ar_str)).fetchall()
        else:
            rader = conn.execute("""
                SELECT k.kode, k.navn, COALESCE(SUM(p.belop),0) as saldo
                FROM postering p JOIN konto k ON p.konto_kode = k.kode
                WHERE p.konto_kode >= ? AND p.konto_kode < ?
                GROUP BY k.kode, k.navn HAVING ABS(saldo) > 0.01
            """, (fra, til)).fetchall()
        return [{"kode": r["kode"], "navn": r["navn"], "belop": round(r["saldo"], 2)} for r in rader]

    def hent_linjer_bal(fra: str, til: str) -> list:
        rader = conn.execute("""
            SELECT k.kode, k.navn, COALESCE(SUM(p.belop),0) as saldo
            FROM postering p JOIN konto k ON p.konto_kode = k.kode
            WHERE p.konto_kode >= ? AND p.konto_kode < ?
            GROUP BY k.kode, k.navn HAVING ABS(saldo) > 0.01
        """, (fra, til)).fetchall()
        return [{"kode": r["kode"], "navn": r["navn"], "belop": round(r["saldo"], 2)} for r in rader]

    # Resultatregnskap
    inntekter_linjer = hent_linjer_res("3000", "4000")
    kostnader_linjer = hent_linjer_res("4000", "8000")
    finans_inn_linjer = hent_linjer_res("8000", "8100")
    finans_kost_linjer = hent_linjer_res("8100", "8300")

    sum_inntekter = -res("3000", "4000")
    sum_kostnader = res("4000", "8000")
    driftsresultat = sum_inntekter - sum_kostnader
    sum_finans_inn = -res("8000", "8100")
    sum_finans_kost = res("8100", "8300")
    arsresultat = driftsresultat + sum_finans_inn - sum_finans_kost

    # Balanse
    anleggsmidler_linjer = hent_linjer_bal("1000", "1500")
    omloepsmidler_linjer = hent_linjer_bal("1500", "2000")
    egenkapital_linjer = hent_linjer_bal("2000", "2200")
    langsiktig_gjeld_linjer = hent_linjer_bal("2200", "2400")
    kortsiktig_gjeld_linjer = hent_linjer_bal("2400", "3000")

    sum_anlegg = bal("1000", "1500")
    sum_omloep = bal("1500", "2000")
    sum_eiendeler = sum_anlegg + sum_omloep
    sum_ek = -bal("2000", "2200")
    sum_lg = -bal("2200", "2400")
    sum_kg = -bal("2400", "3000")
    sum_gjeld_ek = sum_ek + sum_lg + sum_kg

    # Antall boliger og sameierbrøk-info til noter
    antall_boliger = conn.execute("SELECT COUNT(*) as n FROM kunde").fetchone()["n"]
    kunder = conn.execute("SELECT navn, seksjonsnummer, sameiebrok, areal FROM kunde ORDER BY seksjonsnummer").fetchall()

    noter = [
        {
            "tittel": "Note 1 — Regnskapsprinsipper",
            "tekst": (
                f"Regnskapet er utarbeidet etter kontantprinsippet tilpasset vel/sameie. "
                f"Regnskapsåret følger kalenderåret (1. januar – 31. desember). "
                f"Alle beløp er i norske kroner (NOK)."
            )
        },
        {
            "tittel": "Note 2 — Sameiere og fordelingsnøkkel",
            "tekst": (
                f"Sameiet har {antall_boliger} seksjoner. "
                f"Fordelingsnøkkel er lik andel ({round(100/antall_boliger, 2) if antall_boliger else 0} % per seksjon) "
                f"med mindre annet er vedtatt i sameierbrøk."
            ),
            "sameiere": [
                {
                    "navn": k["navn"],
                    "seksjonsnummer": k["seksjonsnummer"] or "",
                    "sameierbrok": float(k["sameiebrok"] or 0),
                    "areal": float(k["areal"] or 0),
                }
                for k in kunder
            ]
        },
        {
            "tittel": "Note 3 — Årsresultat og disponering",
            "tekst": (
                f"Årsresultatet på kr {round(arsresultat):,} overføres til/fra vellets frie egenkapital. "
                f"Overskudd reduserer fremtidige felleskostnader, underskudd dekkes av økte innbetalinger."
            )
        },
    ]

    return {
        "ar": ar,
        "resultatregnskap": {
            "driftsinntekter": {"linjer": inntekter_linjer, "sum": round(sum_inntekter, 2)},
            "driftskostnader": {"linjer": kostnader_linjer, "sum": round(sum_kostnader, 2)},
            "driftsresultat": round(driftsresultat, 2),
            "finansinntekter": {"linjer": finans_inn_linjer, "sum": round(sum_finans_inn, 2)},
            "finanskostnader": {"linjer": finans_kost_linjer, "sum": round(sum_finans_kost, 2)},
            "arsresultat": round(arsresultat, 2),
        },
        "balanse": {
            "eiendeler": {
                "anleggsmidler": {"linjer": anleggsmidler_linjer, "sum": round(sum_anlegg, 2)},
                "omloepsmidler": {"linjer": omloepsmidler_linjer, "sum": round(sum_omloep, 2)},
                "sum": round(sum_eiendeler, 2),
            },
            "gjeld_og_egenkapital": {
                "egenkapital": {"linjer": egenkapital_linjer, "sum": round(sum_ek, 2)},
                "langsiktig_gjeld": {"linjer": langsiktig_gjeld_linjer, "sum": round(sum_lg, 2)},
                "kortsiktig_gjeld": {"linjer": kortsiktig_gjeld_linjer, "sum": round(sum_kg, 2)},
                "sum": round(sum_gjeld_ek, 2),
            },
        },
        "noter": noter,
    }


# --- Sameierbrøk-kalkulator ---

@app.get("/api/sameiebrøk")
def hent_sameiebrøk():
    """Returnerer alle boliger med sameierbrøk og beregnet andel i prosent."""
    conn = app.state.system.db.conn
    kunder = conn.execute("SELECT id, navn, seksjonsnummer, sameiebrok, areal FROM kunde ORDER BY seksjonsnummer").fetchall()
    total_brok = sum(float(k["sameiebrok"] or 0) for k in kunder)
    total_areal = sum(float(k["areal"] or 0) for k in kunder)
    antall = len(kunder)
    return {
        "antall": antall,
        "total_brok": round(total_brok, 4),
        "total_areal": round(total_areal, 2),
        "lik_fordeling": total_brok == 0,
        "boliger": [
            {
                "id": k["id"],
                "navn": k["navn"],
                "seksjonsnummer": k["seksjonsnummer"] or "",
                "sameierbrok": float(k["sameiebrok"] or 0),
                "areal": float(k["areal"] or 0),
                "andel_pst": round(
                    (float(k["sameiebrok"] or 0) / total_brok * 100) if total_brok > 0
                    else (100.0 / antall if antall > 0 else 0),
                    4
                ),
            }
            for k in kunder
        ],
    }

@app.put("/api/boliger/{bolig_id}/sameiebrøk")
def oppdater_sameiebrøk(bolig_id: int, payload: dict):
    """Oppdaterer sameierbrøk og areal for en bolig."""
    conn = app.state.system.db.conn
    sameierbrok = float(payload.get("sameierbrok", 0))
    areal = float(payload.get("areal", 0))
    conn.execute(
        "UPDATE kunde SET sameiebrok = ?, areal = ? WHERE id = ?",
        (sameierbrok, areal, bolig_id)
    )
    conn.commit()
    return {"message": "Sameierbrøk oppdatert"}


# --- Kontoplan CRUD ---

NS4102_STANDARD = [
    # Immaterielle eiendeler
    ("1000","Forskning og utvikling","Eiendel"),
    ("1020","Patenter, lisenser o.l.","Eiendel"),
    ("1070","Utsatt skattefordel","Eiendel"),
    # Varige driftsmidler
    ("1100","Tomter, bygninger og annen fast eiendom","Eiendel"),
    ("1110","Bygninger og annen fast eiendom","Eiendel"),
    ("1120","Boliger","Eiendel"),
    ("1200","Maskiner og anlegg","Eiendel"),
    ("1230","Driftsløsøre, inventar, verktøy o.l.","Eiendel"),
    ("1260","Reklame- og salgsmidler","Eiendel"),
    ("1270","Datautstyr","Eiendel"),
    # Finansielle anleggsmidler
    ("1300","Investeringer i datterselskaper","Eiendel"),
    ("1320","Lån til foretak i samme konsern","Eiendel"),
    ("1350","Investeringer i aksjer og andeler","Eiendel"),
    ("1360","Obligasjoner","Eiendel"),
    ("1370","Fordringer på eiere","Eiendel"),
    ("1380","Fordringer på styremedlemmer o.a.","Eiendel"),
    # Varer
    ("1400","Råvarer og innkjøpte halvfabrikata","Eiendel"),
    ("1420","Varer under tilvirkning","Eiendel"),
    ("1460","Ferdigvarer","Eiendel"),
    # Fordringer
    ("1500","Kundefordringer","Eiendel"),
    ("1510","Opptjente, ikke fakturerte inntekter","Eiendel"),
    ("1530","Andre fordringer","Eiendel"),
    ("1570","Forskuddsbetalte kostnader","Eiendel"),
    ("1579","Andre kortsiktige fordringer","Eiendel"),
    ("1580","Fordringer på ansatte","Eiendel"),
    # Investeringer
    ("1600","Aksjer og andeler (omløpsmidler)","Eiendel"),
    ("1620","Markedsbaserte obligasjoner","Eiendel"),
    # Bankinnskudd og kontanter
    ("1900","Kontanter","Eiendel"),
    ("1920","Bankinnskudd","Eiendel"),
    ("1940","Andre bankinnskudd","Eiendel"),
    ("1950","Bankinnskudd skattetrekk","Eiendel"),
    # Egenkapital
    ("2000","Aksjekapital / innskutt kapital","Egenkapital"),
    ("2020","Overkursfond","Egenkapital"),
    ("2030","Annen innskutt egenkapital","Egenkapital"),
    ("2050","Annen egenkapital","Egenkapital"),
    ("2080","Udekket tap","Egenkapital"),
    # Avsetning for forpliktelser
    ("2100","Pensjonsforpliktelser","Gjeld"),
    ("2120","Utsatt skatt","Gjeld"),
    ("2150","Andre avsetninger for forpliktelser","Gjeld"),
    # Langsiktig gjeld
    ("2200","Gjeld til kredittinstitusjoner","Gjeld"),
    ("2250","Obligasjonslån","Gjeld"),
    ("2290","Annen langsiktig gjeld","Gjeld"),
    # Kortsiktig gjeld
    ("2400","Leverandørgjeld","Gjeld"),
    ("2500","Betalbar skatt","Gjeld"),
    ("2510","Skyldig merverdiavgift","Gjeld"),
    ("2530","Skyldig lønn","Gjeld"),
    ("2560","Feriepengeavsetning","Gjeld"),
    ("2600","Forskuddstrekk","Gjeld"),
    ("2710","Utgående mva høy sats","Gjeld"),
    ("2720","Utgående mva middels sats","Gjeld"),
    ("2730","Utgående mva lav sats","Gjeld"),
    ("2740","Skyldig arbeidsgiveravgift","Gjeld"),
    ("2770","Skyldig merverdiavgift","Gjeld"),
    ("2900","Forskuddsbetalte inntekter","Gjeld"),
    ("2990","Annen kortsiktig gjeld","Gjeld"),
    # Salgsinntekter
    ("3000","Salgsinntekt, avgiftspliktig","Inntekt"),
    ("3010","Salgsinntekt høy mva-sats","Inntekt"),
    ("3020","Salgsinntekt middels mva-sats","Inntekt"),
    ("3030","Salgsinntekt lav mva-sats","Inntekt"),
    ("3100","Salgsinntekt, avgiftsfri","Inntekt"),
    ("3200","Salgsinntekt, utenfor avgiftsområdet","Inntekt"),
    ("3400","Offentlige tilskudd","Inntekt"),
    ("3600","Leieinntekt fast eiendom","Inntekt"),
    ("3620","Leieinntekt løsøre","Inntekt"),
    ("3900","Annen driftsinntekt","Inntekt"),
    ("3960","Gevinst ved avgang av anleggsmidler","Inntekt"),
    # Varekostnader
    ("4000","Innkjøp av varer","Kostnad"),
    ("4020","Frakt og toll","Kostnad"),
    ("4090","Beholdningsendring","Kostnad"),
    ("4300","Underentreprenører","Kostnad"),
    # Lønn og personal
    ("5000","Lønn til ansatte","Kostnad"),
    ("5100","Feriepenger","Kostnad"),
    ("5200","Arbeidsgiveravgift","Kostnad"),
    ("5400","Pensjonskostnader","Kostnad"),
    ("5900","Andre personalkostnader","Kostnad"),
    ("5960","Gave til ansatte","Kostnad"),
    # Avskrivninger
    ("6000","Avskrivning bygning","Kostnad"),
    ("6010","Avskrivning maskiner og anlegg","Kostnad"),
    ("6020","Avskrivning inventar og utstyr","Kostnad"),
    # Driftskostnader
    ("6100","Frakt og transportkostnader","Kostnad"),
    ("6200","Energi, brensel, vann","Kostnad"),
    ("6210","Elektrisitet","Kostnad"),
    ("6240","Renovasjon, vann, avløp","Kostnad"),
    ("6300","Leie lokaler","Kostnad"),
    ("6310","Leie maskiner og inventar","Kostnad"),
    ("6340","Lys, varme","Kostnad"),
    ("6395","Vakthold og sikring","Kostnad"),
    ("6400","Leie og leasing av transportmidler","Kostnad"),
    ("6500","Verktøy og inventar","Kostnad"),
    ("6520","Datautstyr (ikke aktiveringspliktig)","Kostnad"),
    ("6540","Inventar (ikke aktiveringspliktig)","Kostnad"),
    ("6600","Reparasjon og vedlikehold","Kostnad"),
    ("6620","Vedlikehold bygninger","Kostnad"),
    ("6695","Reparasjon og vedlikehold av transportmidler","Kostnad"),
    ("6700","Fremmed tjeneste (Regnskap)","Kostnad"),
    ("6720","Revisjonshonorar","Kostnad"),
    ("6790","Andre fremmedytelser","Kostnad"),
    ("6800","Kontorkostnader","Kostnad"),
    ("6810","Kontorrekvisita","Kostnad"),
    ("6840","Aviser, tidsskrifter, bøker o.l.","Kostnad"),
    ("6860","Møter, kurs, oppdatering o.l.","Kostnad"),
    ("6900","Telefon og porto","Kostnad"),
    ("6940","Porto","Kostnad"),
    ("6960","Internett og datakommunikasjon","Kostnad"),
    # Salg og markedsføring
    ("7000","Salgskostnader","Kostnad"),
    ("7020","Annonse og reklame","Kostnad"),
    ("7040","Representasjon","Kostnad"),
    ("7100","Bilkostnader","Kostnad"),
    ("7130","Reisekostnader, transport","Kostnad"),
    ("7140","Reisekostnader, overnatting","Kostnad"),
    ("7160","Reisekostnader, diett","Kostnad"),
    ("7320","Gaver og tilskudd","Kostnad"),
    ("7350","Tap på fordringer","Kostnad"),
    ("7500","Forsikringspremie","Kostnad"),
    ("7510","Forsikring transportmidler","Kostnad"),
    ("7770","Bank og kortgebyr","Kostnad"),
    ("7790","Andre kostnader","Kostnad"),
    ("7830","Tap ved avgang av anleggsmidler","Kostnad"),
    # Finansinntekter
    ("8000","Inntekt på investeringer i datterselskaper","Inntekt"),
    ("8020","Renteinntekt fra foretak i samme konsern","Inntekt"),
    ("8050","Renteinntekter","Inntekt"),
    ("8060","Utbytteinntekter","Inntekt"),
    ("8070","Gevinst på verdipapirer","Inntekt"),
    ("8080","Agio (valutagevinst)","Inntekt"),
    # Finanskostnader
    ("8100","Rentekostnader til foretak i samme konsern","Kostnad"),
    ("8150","Rentekostnader","Kostnad"),
    ("8160","Andre finanskostnader","Kostnad"),
    ("8170","Tap på verdipapirer","Kostnad"),
    ("8180","Disagio (valutatap)","Kostnad"),
    # Skatt
    ("8300","Skattekostnad","Kostnad"),
    ("8320","Endring i utsatt skatt","Kostnad"),
]

class KontoCreate(BaseModel):
    kode: str
    navn: str
    type: str

class KontoUpdate(BaseModel):
    navn: str
    type: str

@app.get("/api/kontoplan")
def hent_kontoplan():
    conn = app.state.system.db.conn
    rader = conn.execute("SELECT kode, navn, type FROM konto ORDER BY kode").fetchall()
    return [{"kode": r["kode"], "navn": r["navn"], "type": r["type"]} for r in rader]

@app.post("/api/kontoplan", status_code=201)
def opprett_konto(konto: KontoCreate):
    conn = app.state.system.db.conn
    if conn.execute("SELECT kode FROM konto WHERE kode=?", (konto.kode,)).fetchone():
        raise HTTPException(status_code=409, detail=f"Konto {konto.kode} finnes allerede")
    gyldige_typer = {"Eiendel", "Gjeld", "Egenkapital", "Inntekt", "Kostnad"}
    if konto.type not in gyldige_typer:
        raise HTTPException(status_code=400, detail=f"Ugyldig type. Gyldige: {gyldige_typer}")
    conn.execute("INSERT INTO konto (kode, navn, type) VALUES (?,?,?)", (konto.kode, konto.navn, konto.type))
    conn.commit()
    return {"kode": konto.kode, "navn": konto.navn, "type": konto.type}

@app.put("/api/kontoplan/{kode}")
def oppdater_konto(kode: str, konto: KontoUpdate):
    conn = app.state.system.db.conn
    if not conn.execute("SELECT kode FROM konto WHERE kode=?", (kode,)).fetchone():
        raise HTTPException(status_code=404, detail="Konto finnes ikke")
    gyldige_typer = {"Eiendel", "Gjeld", "Egenkapital", "Inntekt", "Kostnad"}
    if konto.type not in gyldige_typer:
        raise HTTPException(status_code=400, detail=f"Ugyldig type. Gyldige: {gyldige_typer}")
    conn.execute("UPDATE konto SET navn=?, type=? WHERE kode=?", (konto.navn, konto.type, kode))
    conn.commit()
    return {"kode": kode, "navn": konto.navn, "type": konto.type}

@app.delete("/api/kontoplan/{kode}")
def slett_konto(kode: str):
    conn = app.state.system.db.conn
    if not conn.execute("SELECT kode FROM konto WHERE kode=?", (kode,)).fetchone():
        raise HTTPException(status_code=404, detail="Konto finnes ikke")
    brukt = conn.execute("SELECT COUNT(*) FROM postering WHERE konto_kode=?", (kode,)).fetchone()[0]
    if brukt > 0:
        raise HTTPException(status_code=400, detail=f"Kan ikke slette konto {kode} — den har {brukt} postering(er)")
    conn.execute("DELETE FROM konto WHERE kode=?", (kode,))
    conn.commit()
    return {"message": f"Konto {kode} slettet"}

@app.post("/api/kontoplan/importer-standard", status_code=200)
def importer_standard_kontoplan():
    conn = app.state.system.db.conn
    lagt_til = 0
    for kode, navn, type_ in NS4102_STANDARD:
        existing = conn.execute("SELECT kode FROM konto WHERE kode=?", (kode,)).fetchone()
        if not existing:
            conn.execute("INSERT INTO konto (kode, navn, type) VALUES (?,?,?)", (kode, navn, type_))
            lagt_til += 1
    conn.commit()
    return {"message": f"{lagt_til} nye kontoer lagt til", "total": len(NS4102_STANDARD)}

@app.post("/api/fakturaer/{faktura_id}/krediter")
def krediter_faktura(faktura_id: int):
    try:
        app.state.faktura.krediter_faktura(faktura_id)
        return {"message": f"Faktura {faktura_id} kreditert"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.delete("/api/fakturaer/{faktura_id}")
def slett_faktura(faktura_id: int):
    try:
        app.state.faktura.slett_faktura(faktura_id)
        return {"message": f"Faktura {faktura_id} slettet"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/fakturaer/{faktura_id}/pdf")
def hent_faktura_pdf(faktura_id: int):
    full_sti = finn_pdf_sti(faktura_id)
    return FileResponse(full_sti, media_type="application/pdf", filename=os.path.basename(full_sti))

@app.post("/api/fakturaer/{faktura_id}/send")
def send_faktura_pa_nytt(faktura_id: int):
    faktura = app.state.faktura.hent_faktura(faktura_id)
    if not faktura:
        raise HTTPException(status_code=404, detail="Faktura finnes ikke")
    kunde = app.state.reskontro.hent_kunde(faktura['kunde_id'])
    if not kunde:
        raise HTTPException(status_code=404, detail="Bolig finnes ikke")
    selskap_info = hent_selskap_info_med_default()
    if not selskap_info.epost_passord:
        raise HTTPException(status_code=400, detail="Gmail App Password mangler. Legg det inn i epostinnstillinger før utsending.")
    pdf_sti = finn_pdf_sti(faktura_id)
    EpostTjeneste.send_faktura(kunde, faktura_id, faktura['total_belop'], selskap_info, vedlegg_sti=pdf_sti)
    return {"message": f"Faktura {faktura_id} sendt til {kunde.epost}"}

@app.get("/api/innstillinger/epost", response_model=EpostInnstillingerResponse)
def hent_epostinnstillinger():
    info = hent_selskap_info_med_default()
    return EpostInnstillingerResponse(
        navn=info.navn,
        adresse=info.adresse,
        orgnr=info.orgnr,
        bankkonto=info.bankkonto,
        epost_avsender=info.epost_avsender,
        app_passord_satt=bool(info.epost_passord)
    )

@app.post("/api/innstillinger/epost", response_model=EpostInnstillingerResponse)
def lagre_epostinnstillinger(payload: EpostInnstillingerUpdate):
    eksisterende = hent_selskap_info_med_default()
    passord = payload.epost_passord if payload.epost_passord else eksisterende.epost_passord
    info = SelskapInfo(payload.navn, payload.adresse, payload.orgnr, payload.bankkonto, payload.epost_avsender or DEFAULT_SENDER_EMAIL, passord)
    app.state.selskap.lagre_info(info)
    return EpostInnstillingerResponse(
        navn=info.navn,
        adresse=info.adresse,
        orgnr=info.orgnr,
        bankkonto=info.bankkonto,
        epost_avsender=info.epost_avsender,
        app_passord_satt=bool(info.epost_passord)
    )

# --- Manuell postering ---

class ManuelPostering(BaseModel):
    konto_kode: str
    belop: float

class ManuelTransaksjonPayload(BaseModel):
    dato: str
    beskrivelse: str
    posteringer: List[ManuelPostering]

class KontoRad(BaseModel):
    kode: str
    navn: str
    type: str

@app.get("/api/kontoplan", response_model=List[KontoRad])
def hent_kontoplan():
    rader = app.state.system.db.conn.execute(
        "SELECT kode, navn, type FROM konto ORDER BY kode"
    ).fetchall()
    return [KontoRad(kode=r["kode"], navn=r["navn"], type=r["type"]) for r in rader]

@app.post("/api/posteringer")
def opprett_manuell_postering(payload: ManuelTransaksjonPayload):
    try:
        dato = datetime.date.fromisoformat(payload.dato)
    except ValueError:
        raise HTTPException(status_code=400, detail="Ugyldig dato, bruk YYYY-MM-DD")
    posteringer = [Postering(p.konto_kode, p.belop) for p in payload.posteringer]
    total = sum(p.belop for p in posteringer)
    if abs(total) > 0.01:
        raise HTTPException(status_code=400, detail=f"Posteringene balanserer ikke. Differanse: {total:.2f}")
    try:
        app.state.system.bokfor_transaksjon(dato, payload.beskrivelse, posteringer)
        rad = app.state.system.db.conn.execute(
            "SELECT id FROM transaksjon ORDER BY id DESC LIMIT 1"
        ).fetchone()
        return {"message": "Transaksjon bokført", "transaksjon_id": rad["id"] if rad else None}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

# --- Konto-avstemming ---

class KontoPosteringRad(BaseModel):
    id: int
    transaksjon_id: int
    dato: str
    beskrivelse: str
    belop: float
    avstemt: bool

class KontoAvstemmingOversikt(BaseModel):
    kode: str
    navn: str
    type: str
    saldo: float
    antall_uavstemt: int

@app.get("/api/kontoavstemming", response_model=List[KontoAvstemmingOversikt])
def hent_kontoer_for_avstemming():
    conn = app.state.system.db.conn
    avstemt_ids = {r[0] for r in conn.execute("SELECT postering_id FROM postering_avstemt").fetchall()}
    rader = conn.execute("""
        SELECT k.kode, k.navn, k.type, COALESCE(SUM(p.belop), 0) as saldo,
               COUNT(p.id) as antall_poster
        FROM konto k
        LEFT JOIN postering p ON p.konto_kode = k.kode
        GROUP BY k.kode, k.navn, k.type
        HAVING antall_poster > 0
        ORDER BY k.kode
    """).fetchall()
    resultat = []
    for r in rader:
        uavstemt = conn.execute("""
            SELECT COUNT(p.id) FROM postering p
            JOIN transaksjon t ON p.transaksjon_id = t.id
            WHERE p.konto_kode = ? AND p.id NOT IN (SELECT postering_id FROM postering_avstemt)
        """, (r["kode"],)).fetchone()[0]
        resultat.append(KontoAvstemmingOversikt(
            kode=r["kode"], navn=r["navn"], type=r["type"],
            saldo=r["saldo"], antall_uavstemt=uavstemt
        ))
    return resultat

@app.get("/api/kontoavstemming/{konto_kode}", response_model=List[KontoPosteringRad])
def hent_posteringer_for_konto(konto_kode: str, periode: Optional[str] = None):
    conn = app.state.system.db.conn
    avstemt_ids = {r[0] for r in conn.execute("SELECT postering_id FROM postering_avstemt").fetchall()}
    if periode:
        rader = conn.execute("""
            SELECT p.id, p.transaksjon_id, t.dato, t.beskrivelse, p.belop
            FROM postering p JOIN transaksjon t ON p.transaksjon_id = t.id
            WHERE p.konto_kode = ? AND strftime('%Y-%m', t.dato) = ?
            ORDER BY t.dato DESC
        """, (konto_kode, periode)).fetchall()
    else:
        rader = conn.execute("""
            SELECT p.id, p.transaksjon_id, t.dato, t.beskrivelse, p.belop
            FROM postering p JOIN transaksjon t ON p.transaksjon_id = t.id
            WHERE p.konto_kode = ?
            ORDER BY t.dato DESC
        """, (konto_kode,)).fetchall()
    return [KontoPosteringRad(
        id=r["id"], transaksjon_id=r["transaksjon_id"], dato=r["dato"],
        beskrivelse=r["beskrivelse"], belop=r["belop"],
        avstemt=r["id"] in avstemt_ids
    ) for r in rader]

@app.post("/api/kontoavstemming/{konto_kode}/avstem")
def avstem_posteringer(konto_kode: str, payload: dict):
    conn = app.state.system.db.conn
    postering_ids: list = payload.get("postering_ids", [])
    dato = datetime.datetime.now().isoformat()
    for pid in postering_ids:
        conn.execute(
            "INSERT OR IGNORE INTO postering_avstemt (postering_id, avstemt_dato) VALUES (?,?)",
            (pid, dato)
        )
    conn.commit()
    return {"message": f"{len(postering_ids)} poster(er) merket som avstemt"}

@app.delete("/api/kontoavstemming/{konto_kode}/avstem/{postering_id}")
def angre_avstemming(konto_kode: str, postering_id: int):
    conn = app.state.system.db.conn
    lasedato = app.state.system.hent_lasedato()
    if lasedato:
        rad = conn.execute(
            "SELECT t.dato FROM postering p JOIN transaksjon t ON p.transaksjon_id=t.id WHERE p.id=?",
            (postering_id,)
        ).fetchone()
        if rad and datetime.date.fromisoformat(rad["dato"]) <= lasedato:
            raise HTTPException(status_code=400, detail=f"Perioden er låst t.o.m {lasedato}")
    conn.execute("DELETE FROM postering_avstemt WHERE postering_id=?", (postering_id,))
    conn.commit()
    return {"message": "Avstemming angret"}

# --- Debet/Kredit matching per konto ---

class PosteringMatchRad(BaseModel):
    id: int
    debet_id: int
    kredit_id: int
    konto_kode: str
    matchet_dato: str
    debet_dato: str
    debet_beskrivelse: str
    debet_belop: float
    kredit_dato: str
    kredit_beskrivelse: str
    kredit_belop: float

class OpprettPosteringMatchPayload(BaseModel):
    debet_id: int
    kredit_id: int

@app.get("/api/kontoavstemming/{konto_kode}/poster", response_model=List[KontoPosteringRad])
def hent_poster_delt(konto_kode: str, side: str = "debet"):
    """Returnerer enten debet (belop > 0) eller kredit (belop < 0) poster for en konto."""
    conn = app.state.system.db.conn
    matchet_ids = {r[0] for r in conn.execute(
        "SELECT debet_id FROM postering_match UNION SELECT kredit_id FROM postering_match"
    ).fetchall()}
    if side == "debet":
        rader = conn.execute("""
            SELECT p.id, p.transaksjon_id, t.dato, t.beskrivelse, p.belop
            FROM postering p JOIN transaksjon t ON p.transaksjon_id = t.id
            WHERE p.konto_kode = ? AND p.belop > 0
            ORDER BY t.dato DESC
        """, (konto_kode,)).fetchall()
    else:
        rader = conn.execute("""
            SELECT p.id, p.transaksjon_id, t.dato, t.beskrivelse, p.belop
            FROM postering p JOIN transaksjon t ON p.transaksjon_id = t.id
            WHERE p.konto_kode = ? AND p.belop < 0
            ORDER BY t.dato DESC
        """, (konto_kode,)).fetchall()
    return [KontoPosteringRad(
        id=r["id"], transaksjon_id=r["transaksjon_id"], dato=r["dato"],
        beskrivelse=r["beskrivelse"], belop=r["belop"],
        avstemt=r["id"] in matchet_ids
    ) for r in rader]

@app.post("/api/kontoavstemming/{konto_kode}/match")
def opprett_postering_match(konto_kode: str, payload: OpprettPosteringMatchPayload):
    conn = app.state.system.db.conn
    # Sjekk at ikke allerede matchet
    dup = conn.execute(
        "SELECT id FROM postering_match WHERE debet_id=? OR kredit_id=? OR debet_id=? OR kredit_id=?",
        (payload.debet_id, payload.debet_id, payload.kredit_id, payload.kredit_id)
    ).fetchone()
    if dup:
        raise HTTPException(status_code=400, detail="En av posteringene er allerede matchet")
    conn.execute(
        "INSERT INTO postering_match (debet_id, kredit_id, konto_kode, matchet_dato) VALUES (?,?,?,?)",
        (payload.debet_id, payload.kredit_id, konto_kode, datetime.datetime.now().isoformat())
    )
    conn.commit()
    return {"message": "Matchet"}

@app.delete("/api/kontoavstemming/{konto_kode}/match/{match_id}")
def slett_postering_match(konto_kode: str, match_id: int):
    conn = app.state.system.db.conn
    rad = conn.execute("SELECT * FROM postering_match WHERE id=?", (match_id,)).fetchone()
    if not rad:
        raise HTTPException(status_code=404, detail="Match finnes ikke")
    lasedato = app.state.system.hent_lasedato()
    if lasedato:
        dp = conn.execute(
            "SELECT t.dato FROM postering p JOIN transaksjon t ON p.transaksjon_id=t.id WHERE p.id=?",
            (rad["debet_id"],)
        ).fetchone()
        if dp and datetime.date.fromisoformat(dp["dato"]) <= lasedato:
            raise HTTPException(status_code=400, detail=f"Perioden er låst t.o.m {lasedato}")
    conn.execute("DELETE FROM postering_match WHERE id=?", (match_id,))
    conn.commit()
    return {"message": "Match reversert"}

@app.get("/api/kontoavstemming/{konto_kode}/matchhistorikk", response_model=List[PosteringMatchRad])
def hent_match_historikk(konto_kode: str):
    conn = app.state.system.db.conn
    rader = conn.execute("""
        SELECT m.id, m.debet_id, m.kredit_id, m.konto_kode, m.matchet_dato,
               td.dato as debet_dato, td.beskrivelse as debet_beskrivelse, pd.belop as debet_belop,
               tk.dato as kredit_dato, tk.beskrivelse as kredit_beskrivelse, pk.belop as kredit_belop
        FROM postering_match m
        JOIN postering pd ON m.debet_id = pd.id
        JOIN transaksjon td ON pd.transaksjon_id = td.id
        JOIN postering pk ON m.kredit_id = pk.id
        JOIN transaksjon tk ON pk.transaksjon_id = tk.id
        WHERE m.konto_kode = ?
        ORDER BY m.id DESC
    """, (konto_kode,)).fetchall()
    return [PosteringMatchRad(
        id=r["id"], debet_id=r["debet_id"], kredit_id=r["kredit_id"],
        konto_kode=r["konto_kode"], matchet_dato=r["matchet_dato"],
        debet_dato=r["debet_dato"], debet_beskrivelse=r["debet_beskrivelse"], debet_belop=r["debet_belop"],
        kredit_dato=r["kredit_dato"], kredit_beskrivelse=r["kredit_beskrivelse"], kredit_belop=r["kredit_belop"]
    ) for r in rader]

# --- Bank CSV Import (DNB format) ---

class BankpostRad(BaseModel):
    id: int
    dato: str
    tekst: str
    belop: float
    import_dato: str
    periode: str
    matchet: bool

class HovedbokPostRad(BaseModel):
    id: int
    dato: str
    beskrivelse: str
    belop: float
    transaksjon_id: int
    matchet: bool

class MatchingRad(BaseModel):
    id: int
    bankpost_id: int
    postering_id: int
    matchet_dato: str
    bank_dato: str
    bank_tekst: str
    bank_belop: float
    hb_dato: str
    hb_beskrivelse: str
    hb_belop: float

class OpprettMatchingPayload(BaseModel):
    bankpost_id: int
    postering_id: int

def _parse_norsk_belop(s: str) -> Optional[float]:
    s = s.strip().replace("\xa0", "").replace("\u00a0", "").replace(" ", "")
    if not s:
        return None
    # Norwegian format: 1.200,50 -> 1200.50
    s = s.replace(".", "").replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return None

@app.post("/api/bank/importer")
async def importer_bank_csv(fil: UploadFile = File(...)):
    innhold = await fil.read()
    # Try common encodings for Norwegian bank exports
    for enc in ("utf-8-sig", "latin-1", "cp1252", "utf-8"):
        try:
            tekst = innhold.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    else:
        tekst = innhold.decode("latin-1", errors="replace")

    alle_linjer = tekst.splitlines()

    # DNB exports have metadata rows at top before the actual header row
    # Find the header row: it contains "Bokf" or "dato" (case-insensitive) and "Ut" and "Inn"
    header_idx = None
    for i, linje in enumerate(alle_linjer):
        low = linje.lower()
        if ("bokf" in low or "dato" in low) and ("ut" in low) and ("inn" in low):
            header_idx = i
            break

    if header_idx is None:
        raise HTTPException(status_code=400, detail="Fant ikke kolonnehodet i filen. Forventet DNB-format med Bokført dato, Ut og Inn kolonner.")

    linjer = alle_linjer[header_idx:]
    reader = csv.DictReader(linjer, delimiter=";")
    # Strip quotes and whitespace from field names
    raw_fields = reader.fieldnames or []
    felt = [f.strip().strip('"') for f in raw_fields]

    def finn_kol(sok: list[str], ekskluder: list[str] = []) -> Optional[str]:
        for f in felt:
            fl = f.lower()
            if any(s in fl for s in sok) and not any(e in fl for e in ekskluder):
                return f
        return None

    dato_kol   = finn_kol(["bokf", "dato"], ekskluder=["rente"])
    tekst_kol  = finn_kol(["forklaring", "tekst", "beskrivelse"])
    ut_kol     = finn_kol(["ut"])
    inn_kol    = finn_kol(["inn"])

    if not dato_kol:
        raise HTTPException(status_code=400, detail=f"Fant ikke datokolonne. Tilgjengelige kolonner: {felt}")

    conn = app.state.system.db.conn
    import_dato = datetime.datetime.now().isoformat()
    antall = 0

    for row in reader:
        # Strip quotes from values
        row = {k: (v or "").strip().strip('"') for k, v in row.items() if k}

        raw_dato = row.get(dato_kol, "").strip()
        raw_tekst = row.get(tekst_kol, "").strip() if tekst_kol else ""

        # Parse date DD.MM.YYYY
        try:
            d = datetime.datetime.strptime(raw_dato, "%d.%m.%Y")
            iso_dato = d.date().isoformat()
            periode = iso_dato[:7]
        except ValueError:
            continue

        belop = 0.0
        if inn_kol:
            v = _parse_norsk_belop(row.get(inn_kol, ""))
            if v:
                belop += v
        if ut_kol:
            v = _parse_norsk_belop(row.get(ut_kol, ""))
            if v:
                belop -= v

        if abs(belop) < 0.001:
            continue

        # Skip duplicates
        dup = conn.execute(
            "SELECT id FROM bankpost WHERE dato=? AND tekst=? AND belop=?",
            (iso_dato, raw_tekst, belop)
        ).fetchone()
        if dup:
            continue

        conn.execute(
            "INSERT INTO bankpost (dato, tekst, belop, import_dato, periode) VALUES (?,?,?,?,?)",
            (iso_dato, raw_tekst, belop, import_dato, periode)
        )
        antall += 1

    conn.commit()
    return {"importert": antall}

@app.get("/api/bank/poster", response_model=List[BankpostRad])
def hent_bankposter(periode: Optional[str] = None):
    conn = app.state.system.db.conn
    matchet_ids = {r[0] for r in conn.execute("SELECT bankpost_id FROM bank_matching").fetchall()}
    if periode:
        rader = conn.execute("SELECT * FROM bankpost WHERE periode=? ORDER BY dato", (periode,)).fetchall()
    else:
        rader = conn.execute("SELECT * FROM bankpost ORDER BY dato DESC").fetchall()
    return [BankpostRad(
        id=r["id"], dato=r["dato"], tekst=r["tekst"] or "", belop=r["belop"],
        import_dato=r["import_dato"], periode=r["periode"],
        matchet=r["id"] in matchet_ids
    ) for r in rader]

@app.get("/api/bank/hovedbok", response_model=List[HovedbokPostRad])
def hent_hovedbok_bank(periode: Optional[str] = None):
    conn = app.state.system.db.conn
    matchet_ids = {r[0] for r in conn.execute("SELECT postering_id FROM bank_matching").fetchall()}
    if periode:
        rader = conn.execute("""
            SELECT p.id, t.dato, t.beskrivelse, p.belop, p.transaksjon_id
            FROM postering p JOIN transaksjon t ON p.transaksjon_id = t.id
            WHERE p.konto_kode='1920' AND strftime('%Y-%m', t.dato)=?
            ORDER BY t.dato
        """, (periode,)).fetchall()
    else:
        rader = conn.execute("""
            SELECT p.id, t.dato, t.beskrivelse, p.belop, p.transaksjon_id
            FROM postering p JOIN transaksjon t ON p.transaksjon_id = t.id
            WHERE p.konto_kode='1920'
            ORDER BY t.dato DESC
        """).fetchall()
    return [HovedbokPostRad(
        id=r["id"], dato=r["dato"], beskrivelse=r["beskrivelse"],
        belop=r["belop"], transaksjon_id=r["transaksjon_id"],
        matchet=r["id"] in matchet_ids
    ) for r in rader]

@app.post("/api/bank/match")
def opprett_matching(payload: OpprettMatchingPayload):
    conn = app.state.system.db.conn
    # Check not already matched
    dup = conn.execute(
        "SELECT id FROM bank_matching WHERE bankpost_id=? OR postering_id=?",
        (payload.bankpost_id, payload.postering_id)
    ).fetchone()
    if dup:
        raise HTTPException(status_code=400, detail="En av postene er allerede matchet")
    conn.execute(
        "INSERT INTO bank_matching (bankpost_id, postering_id, matchet_dato) VALUES (?,?,?)",
        (payload.bankpost_id, payload.postering_id, datetime.datetime.now().isoformat())
    )
    conn.commit()
    return {"message": "Matchet"}

@app.delete("/api/bank/match/{matching_id}")
def slett_matching(matching_id: int):
    conn = app.state.system.db.conn
    # Check if period is locked
    rad = conn.execute("SELECT * FROM bank_matching WHERE id=?", (matching_id,)).fetchone()
    if not rad:
        raise HTTPException(status_code=404, detail="Matching finnes ikke")
    # Check lasedato
    lasedato = app.state.system.hent_lasedato()
    if lasedato:
        bp = conn.execute("SELECT dato FROM bankpost WHERE id=?", (rad["bankpost_id"],)).fetchone()
        if bp and datetime.date.fromisoformat(bp["dato"]) <= lasedato:
            raise HTTPException(status_code=400, detail=f"Perioden er låst t.o.m {lasedato}")
    conn.execute("DELETE FROM bank_matching WHERE id=?", (matching_id,))
    conn.commit()
    return {"message": "Matching reversert"}

@app.get("/api/bank/historikk", response_model=List[MatchingRad])
def hent_matching_historikk(periode: Optional[str] = None):
    conn = app.state.system.db.conn
    query = """
        SELECT m.id, m.bankpost_id, m.postering_id, m.matchet_dato,
               bp.dato as bank_dato, bp.tekst as bank_tekst, bp.belop as bank_belop,
               t.dato as hb_dato, t.beskrivelse as hb_beskrivelse, p.belop as hb_belop
        FROM bank_matching m
        JOIN bankpost bp ON m.bankpost_id = bp.id
        JOIN postering p ON m.postering_id = p.id
        JOIN transaksjon t ON p.transaksjon_id = t.id
    """
    params = []
    if periode:
        query += " WHERE bp.periode=?"
        params.append(periode)
    query += " ORDER BY m.id DESC"
    rader = conn.execute(query, params).fetchall()
    return [MatchingRad(
        id=r["id"], bankpost_id=r["bankpost_id"], postering_id=r["postering_id"],
        matchet_dato=r["matchet_dato"], bank_dato=r["bank_dato"],
        bank_tekst=r["bank_tekst"] or "", bank_belop=r["bank_belop"],
        hb_dato=r["hb_dato"], hb_beskrivelse=r["hb_beskrivelse"], hb_belop=r["hb_belop"]
    ) for r in rader]

@app.get("/api/bank/perioder")
def hent_bank_perioder():
    conn = app.state.system.db.conn
    rader = conn.execute("SELECT DISTINCT periode FROM bankpost ORDER BY periode DESC").fetchall()
    return [r["periode"] for r in rader]

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
