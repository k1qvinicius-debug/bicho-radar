"""
Aplicação Principal FastAPI - Bicho Analytics.
Configuração de rotas de API, middlewares e montagem dos arquivos estáticos do frontend.
"""

import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from .database import init_db
from .api import results, analysis, metrics, admin, auth, milhares

app = FastAPI(
    title="BICHO MASTER API",
    description="Sistema profissional de análise estatística, probabilidades e auditoria preditiva para o Jogo do Bicho.",
    version="2.0.0",
)

# CORS liberado para testes e acesso local
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def add_no_cache_headers(request, call_next):
    response = await call_next(request)
    path = request.url.path
    if path.endswith(".js") or path.endswith(".html") or path in ("/", "/admin", "/historico"):
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate, max-age=0"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    return response

# Inicializa banco de dados
init_db()

@app.on_event("startup")
def on_startup():
    init_db()
    try:
        from .seeds.seed_data import seed_other_lotteries
        seed_other_lotteries()
    except Exception as e:
        print(f"Aviso ao inicializar loterias adicionais: {e}")

    # Inicia o robô de sincronização em segundo plano (exceto em modo de teste automatizado)
    if os.environ.get("BICHO_TEST_MODE") != "1":
        try:
            from .engine.scheduler import scraper_worker
            scraper_worker.start()
        except Exception as e:
            print(f"Aviso ao iniciar worker de scraping: {e}")


@app.on_event("shutdown")
def on_shutdown():
    try:
        from .engine.scheduler import scraper_worker
        scraper_worker.stop()
    except Exception:
        pass

# Registro das rotas da API
app.include_router(auth.router, prefix="/api")
app.include_router(results.router, prefix="/api")
app.include_router(analysis.router, prefix="/api")
app.include_router(metrics.router, prefix="/api")
app.include_router(admin.router, prefix="/api")
app.include_router(milhares.router, prefix="/api")

# Diretório do Frontend
FRONTEND_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "frontend"
)

# Rotas diretas para páginas HTML principais (aceita com ou sem .html)
@app.get("/")
@app.get("/index.html")
def serve_home():
    return FileResponse(
        os.path.join(FRONTEND_DIR, "index.html"),
        headers={"Cache-Control": "no-cache, no-store, must-revalidate, max-age=0"}
    )

@app.get("/historico")
@app.get("/historico.html")
def serve_historico():
    return FileResponse(
        os.path.join(FRONTEND_DIR, "historico.html"),
        headers={"Cache-Control": "no-cache, no-store, must-revalidate, max-age=0"}
    )

@app.get("/admin")
@app.get("/admin.html")
@app.get("/\admin")
@app.get("/%5Cadmin")
def serve_admin():
    return FileResponse(os.path.join(FRONTEND_DIR, "admin.html"))

@app.get("/preview")
@app.get("/preview.html")
def serve_preview():
    return FileResponse(os.path.join(FRONTEND_DIR, "preview.html"))

@app.get("/manifest.json")
def serve_manifest():
    return FileResponse(
        os.path.join(FRONTEND_DIR, "manifest.json"),
        media_type="application/manifest+json",
        headers={"Cache-Control": "no-cache"}
    )

@app.get("/sw.js")
def serve_sw():
    return FileResponse(
        os.path.join(FRONTEND_DIR, "sw.js"),
        media_type="application/javascript",
        headers={"Cache-Control": "no-cache"}
    )

# Montagem de assets estáticos (CSS, JS, imagens)
if os.path.exists(os.path.join(FRONTEND_DIR, "css")):
    app.mount("/css", StaticFiles(directory=os.path.join(FRONTEND_DIR, "css")), name="css")
if os.path.exists(os.path.join(FRONTEND_DIR, "js")):
    app.mount("/js", StaticFiles(directory=os.path.join(FRONTEND_DIR, "js")), name="js")
if os.path.exists(os.path.join(FRONTEND_DIR, "img")):
    app.mount("/img", StaticFiles(directory=os.path.join(FRONTEND_DIR, "img")), name="img")

