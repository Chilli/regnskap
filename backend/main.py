from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import List, Optional
import sqlite3
import datetime
import shutil
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
            WHERE k.type IN (?, ?) AND strftime('%Y', t.dato) = ?
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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
