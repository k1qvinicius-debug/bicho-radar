# BICHO RADAR - Sistema de Análise Estatística Real

Aplicação completa, profissional e escalável para processamento estatístico, cálculo probabilístico multi-fatorial e auditoria contínua dos resultados do **Jogo do Bicho**.

Diferente de geradores aleatórios comuns, o **BICHO RADAR** possui um **motor estatístico próprio e transparente**, que atribui pontuações matemáticas a cada Grupo, Dezena, Centena e Milhar com base no histórico real dos sorteios por horário.

---

## 🚀 Como Executar a Aplicação

### 1. Pré-requisitos
- Python 3.10+ instalado (testado com sucesso no Python 3.13 no Windows)

### 2. Inicialização em Um Único Comando
Abra o terminal (Prompt de Comando ou PowerShell) na pasta do projeto e execute:

```bash
py run.py
```

O comando irá:
1. Inicializar o banco de dados relacional SQLite (`bicho_analytics.db`).
2. Popular o histórico inicial com mais de 200 sorteios reais organizados por horário (PTM, PT, PTV, PTN, COR, Federal).
3. Iniciar o servidor web FastAPI na porta `8000`.

### 3. Acesso pelo Navegador
Após iniciar, acesse no navegador (desktop ou celular):

- 🏠 **Dashboard Principal:** [http://localhost:8000](http://localhost:8000)
- 📊 **Histórico & Auditoria de Acertos:** [http://localhost:8000/historico](http://localhost:8000/historico)
- ⚙️ **Painel Administrativo:** [http://localhost:8000/admin](http://localhost:8000/admin)
- 📚 **Documentação Interativa Swagger:** [http://localhost:8000/docs](http://localhost:8000/docs)

---

## 🧠 Motor de Análise Estatística

O motor calcula pontuações ($S$) ponderadas para todos os elementos com base nos seguintes critérios:

1. **Atraso Probabilístico (Delay / Lag)**:
   - Mede o número de sorteios consecutivos em que o bicho ou número não sai no 1º prêmio e do 1º ao 5º prêmio, comparado com o ciclo médio teórico (25 sorteios para grupos, 100 para dezenas).
2. **Frequência Recente com Decaimento Exponencial ($e^{-\lambda \cdot k}$)**:
   - Os sorteios dos últimos dias recebem peso matemático significativamente maior do que resultados de 2 meses atrás, capturando tendências ativas.
3. **Afinidade por Horário de Extração (Slot Affinity)**:
   - Mede o viés histórico de saída em horários específicos (ex: animais com frequência desproporcional na PT 14:20 vs Coruja 21:20).
4. **Ciclos de Repetição e Consecutividade**:
   - Detecta ocorrências em sequência imediata (saída consecutiva na cabeça ou no cercado).
5. **Afinidade por Dia da Semana**:
   - Padrão sazonal de dias específicos (especialmente quartas-feiras e domingos de Federal).
6. **Combinações Numéricas & Projeções de Centenas e Milhares**:
   - As centenas e milhares são formadas pela correlação das dezenas mais fortes com os dígitos de centena e milhar (0 a 9) com maior pressão de atraso e frequência no horário.

### Calibração Dinâmica de Pesos
Todos os pesos podem ser ajustados em tempo real na aba **Calibrar Pesos** no Painel Administrativo, sem necessidade de reiniciar o servidor ou alterar o código-fonte.

---

## 🎯 Módulo de Auditoria e Backtesting

Para garantir total integridade e mensuração de desempenho:
1. **Congelamento da Análise:** Antes de um sorteio ocorrer, clique no botão **"Salvar Análise para Auditoria"** na tela inicial. A predição é congelada com status `PENDING`.
2. **Conferência Automática:** Quando o resultado real é inserido no sistema (pelo formulário ou importação), o motor compara imediatamente as previsões com os prêmios oficiais do 1º ao 5º.
3. **Métricas Apuradas:**
   - Acertos de Grupo na Cabeça (1º prêmio)
   - Acertos de Grupo no Cercado (1º ao 5º prêmio)
   - Acertos de Dezena na Cabeça e no Cercado
   - Acertos de Centena e Milhar
   - Taxa de sucesso por horário (PTM, PT, PTV, PTN, COR, FED)
   - Histórico antes x depois com destaque visual verde nos números acertados.

---

## 📁 Estrutura do Projeto

```
bicho_analytics/
├── backend/
│   ├── app/
│   │   ├── main.py                   # FastAPI, rotas e montagem do frontend
│   │   ├── database.py               # Camada SQLite, índices e conexões
│   │   ├── domain.py                 # 25 Bichos, dezenas e horários canônicos
│   │   ├── models.py                 # Schemas Pydantic de validação
│   │   ├── engine/
│   │   │   ├── statistical_engine.py # Motor matemático de pontuação
│   │   │   ├── evaluator.py          # Auditoria e apuração de acertos
│   │   │   └── weights.py            # Gestão e calibração de pesos
│   │   ├── api/
│   │   │   ├── results.py            # CRUD de resultados e importador
│   │   │   ├── analysis.py           # Endpoints preditivos e snapshots
│   │   │   ├── metrics.py            # Indicadores e taxas de acerto
│   │   │   └── admin.py              # Calibração e diagnósticos
│   │   └── seeds/
│   │       └── seed_data.py          # Gerador de histórico para semente
├── frontend/
│   ├── index.html                    # Dashboard Principal Mobile-First
│   ├── historico.html                # Auditoria e Linha do Tempo de Acertos
│   ├── admin.html                    # Cadastro, Importação e Calibração
│   ├── css/style.css                 # Tema escuro e componentes
│   └── js/
│       ├── api.js                    # Cliente HTTP REST
│       ├── app.js                    # Lógica do Dashboard e Modal de Fatores
│       ├── history.js                # Lógica da Auditoria e KPIs
│       └── admin.js                  # Lógica do Painel Administrativo
├── tests/
│   ├── test_suite.py                 # Testes unitários do domínio e motor
│   └── test_api_endpoints.py         # Testes de integração dos endpoints HTTP
├── requirements.txt
├── run.py                            # Script único de inicialização
└── README.md
```

---

## 🧪 Executando os Testes Automatizados

Para rodar todos os testes unitários e de integração:

```bash
py -m unittest discover tests
```

---

## ⚠️ Aviso Legal
Este software foi desenvolvido estritamente como uma ferramenta de análise estatística, probabilística e estudo de séries temporais de dados históricos. Os cálculos refletem tendências numéricas passadas e **não asseguram nem garantem quaisquer resultados futuros** em jogos ou apostas.
