"""
Script de Inicialização Principal do Bicho Analytics.
Inicializa o banco de dados, popula com dados semente caso necessário,
e inicia o servidor web FastAPI/Uvicorn na porta 8000.
"""

import os
import sys

# Garante suporte a UTF-8 no terminal Windows
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

import uvicorn

# Adiciona o diretório backend ao sys.path para importações relativas
BACKEND_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "backend")
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from app.database import init_db
from app.seeds.seed_data import generate_seed_data


def main():
    print("=" * 65)
    print("         BICHO RADAR - MOTOR ESTATISTICO REAL E ESCALAVEL        ")
    print("=" * 65)

    # 1. Inicializa o banco de dados
    print("\n[1/3] Verificando e inicializando banco de dados SQLite...")
    init_db()

    # 2. Popula dados semente caso necessário
    print("[2/3] Verificando historico de sorteios e auditorias...")
    draws_count = generate_seed_data(num_days=45)
    print(f"      -> Total de sorteios prontos para analise: {draws_count}")

    # 3. Inicia o servidor Web
    print("[3/3] Iniciando servidor Web FastAPI...")
    print("\n" + "-" * 65)
    print("  APLICACAO DISPONIVEL NOS SEGUINTES ENDERECOS:")
    print("  -------------------------------------------------------------")
    print("  * Dashboard Principal:      http://localhost:8000")
    print("  * Historico & Auditoria:    http://localhost:8000/historico")
    print("  * Painel Administrativo:    http://localhost:8000/admin")
    print("  * Documentacao Swagger API: http://localhost:8000/docs")
    print("-" * 65 + "\n")

    port = int(os.environ.get("PORT", 8000))

    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=port,
        reload=False,
        app_dir=BACKEND_DIR
    )


if __name__ == "__main__":
    main()
