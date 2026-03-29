"""
seed_comite.py — Script de seeding para popular o módulo Comitê com dados realistas.

Popula: regras, comitês (concluídos + agendado), seções, itens de pauta,
comentários, votos, vídeos assistidos e próximos passos.

Uso:
    python seed_comite.py                          # usa localhost:5000
    python seed_comite.py https://seu-backend.com  # usa URL customizada
"""
import requests
import sys
import time
from datetime import datetime, timedelta

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:5000"
API = f"{BASE}/api/comite"
TIMEOUT = 60  # seconds per request

# ═══════════════════════════════════════════════════════════════
# Helpers
# ═══════════════════════════════════════════════════════════════
def post(path, data, retries=3):
    for attempt in range(retries):
        try:
            r = requests.post(f"{API}{path}", json=data, timeout=TIMEOUT)
            if r.status_code in (200, 201):
                print(f"  ✓ POST {path} → {r.status_code}")
                return r.json()
            else:
                print(f"  ✗ POST {path} → {r.status_code}: {r.text[:120]}")
                return None
        except (requests.Timeout, requests.ConnectionError) as e:
            wait = 5 * (attempt + 1)
            print(f"  ⏳ POST {path} timeout (tentativa {attempt+1}/{retries}), aguardando {wait}s...")
            time.sleep(wait)
    print(f"  ✗ POST {path} → FALHOU após {retries} tentativas")
    return None

def get(path, retries=3):
    for attempt in range(retries):
        try:
            r = requests.get(f"{API}{path}", timeout=TIMEOUT)
            if r.status_code == 200:
                return r.json()
            return None
        except (requests.Timeout, requests.ConnectionError) as e:
            wait = 5 * (attempt + 1)
            print(f"  ⏳ GET {path} timeout (tentativa {attempt+1}/{retries}), aguardando {wait}s...")
            time.sleep(wait)
    return None


# ═══════════════════════════════════════════════════════════════
# 0. Warmup — Acordar a serverless function
# ═══════════════════════════════════════════════════════════════
print("\n═══ 0. Warmup ═══")
print("  Aguardando backend responder...")
warmup = get("/rules")
if warmup is not None:
    print(f"  ✓ Backend online! ({len(warmup)} regras existentes)")
else:
    print("  ⚠ Backend pode estar indisponível. Tentando prosseguir...")

# ═══════════════════════════════════════════════════════════════
# 1. Regras de Comitê
# ═══════════════════════════════════════════════════════════════
print("\n═══ 1. Criando Regras de Comitê ═══")

rules = [
    {"tipo": "investimento", "area": "CRI",              "dia_da_semana": "Segunda", "horario": "10:00"},
    {"tipo": "investimento", "area": "CRA",              "dia_da_semana": "Terça",   "horario": "10:00"},
    {"tipo": "monitoramento","area": "CRI",              "dia_da_semana": "Quarta",  "horario": "14:00"},
    {"tipo": "investimento", "area": "Capital Solutions", "dia_da_semana": "Quinta",  "horario": "10:00"},
]

created_rules = []
for rule in rules:
    result = post("/rules", rule)
    if result:
        created_rules.append(result)

# Se as regras já existiram e falharam, buscar as existentes
if len(created_rules) < len(rules):
    existing = get("/rules") or []
    created_rules = existing
    print(f"  ℹ Usando {len(created_rules)} regras existentes")


# ═══════════════════════════════════════════════════════════════
# 2. Comitês (3 concluídos + 1 agendado por regra CRI inv.)
# ═══════════════════════════════════════════════════════════════
print("\n═══ 2. Criando Comitês ═══")

# Buscar regras disponíveis
all_rules = get("/rules") or []
rule_inv_cri = next((r for r in all_rules if r["tipo"] == "investimento" and r.get("area") == "CRI"), None)
rule_inv_cra = next((r for r in all_rules if r["tipo"] == "investimento" and r.get("area") == "CRA"), None)
rule_mon_cri = next((r for r in all_rules if r["tipo"] == "monitoramento" and r.get("area") == "CRI"), None)
rule_inv_cs  = next((r for r in all_rules if r["tipo"] == "investimento" and r.get("area") == "Capital Solutions"), None)

today = datetime.now()

# Comitês CRI Investimento: 3 passados + 1 futuro
comite_dates_inv = [
    today - timedelta(weeks=3),
    today - timedelta(weeks=2),
    today - timedelta(weeks=1),
    today + timedelta(days=4),  # próximo agendado
]

# Comitês CRA Investimento: 2 passados + 1 futuro
comite_dates_cra = [
    today - timedelta(weeks=2),
    today - timedelta(weeks=1),
    today + timedelta(days=6),
]

# Comitês Monitoramento: 2 passados + 1 futuro
comite_dates_mon = [
    today - timedelta(weeks=2),
    today - timedelta(weeks=1),
    today + timedelta(days=3),
]

comites_created = []

def create_comites_for_rule(rule, dates):
    if not rule:
        return
    for d in dates:
        c = post("/comites", {
            "comite_rule_id": rule["id"],
            "data": d.strftime("%Y-%m-%dT%H:%M:%S"),
        })
        if c:
            comites_created.append(c)

create_comites_for_rule(rule_inv_cri, comite_dates_inv)
create_comites_for_rule(rule_inv_cra, comite_dates_cra)
create_comites_for_rule(rule_mon_cri, comite_dates_mon)

if rule_inv_cs:
    create_comites_for_rule(rule_inv_cs, [
        today - timedelta(weeks=1),
        today + timedelta(days=5),
    ])

print(f"  ℹ Total comitês criados: {len(comites_created)}")


# ═══════════════════════════════════════════════════════════════
# 3. Itens de Pauta (realistas e variados)
# ═══════════════════════════════════════════════════════════════
print("\n═══ 3. Adicionando Itens de Pauta ═══")

USERS = [
    (1, "Duarte Oliveira"),
    (2, "Carlos Mendes"),
    (3, "Maria Fernanda"),
    (4, "Lucas Ribeiro"),
    (5, "Ana Beatriz"),
]

# Itens de pauta realistas por seção
ITENS_INVESTIMENTO = {
    "RI": [
        {"titulo": "Análise CRI Construtora ABC - Sênior",          "descricao": "Revisão das garantias e estrutura da tranche sênior da operação ABC. Volume: R$50MM. Garantia fiduciária sobre portfólio de recebíveis.", "prioridade": "urgente", "tipo_caso": "aprovacao"},
        {"titulo": "Pipeline Q2 2026 - Atualização",                 "descricao": "Revisão do pipeline de novas operações para o segundo trimestre. 8 operações em due diligence, 3 em term sheet.", "prioridade": "normal", "tipo_caso": "geral"},
        {"titulo": "Resultado da Due Diligence - Grupo XYZ",         "descricao": "Apresentação dos achados da DD jurídica e financeira do Grupo XYZ. Ponto de atenção: contingências trabalhistas de R$12MM.", "prioridade": "alta", "tipo_caso": "geral"},
    ],
    "Risco": [
        {"titulo": "Watchlist Semanal - Atualização de Ratings",     "descricao": "3 operações tiveram downgrade: Op. Florestal (BBB→BB+), Op. Solar III (A→BBB+), Op. Logística West (BB→B+).", "prioridade": "alta", "tipo_caso": "revisao"},
        {"titulo": "Stress Test - Cenário Selic 15%",                "descricao": "Resultados do stress test com cenário adverso de Selic a 15%. 4 operações entram em modo de atenção.", "prioridade": "urgente", "tipo_caso": "geral"},
    ],
    "Casos para Aprovação": [
        {"titulo": "CRI Hospitalar São Lucas - R$120MM",             "descricao": "Aprovação da operação CRI Hospitalar São Lucas. Rating proposto: AA-. Garantia: alienação fiduciária dos imóveis + cessão de recebíveis.", "prioridade": "urgente", "tipo_caso": "aprovacao"},
        {"titulo": "CRI Green Energy Solar IV - R$80MM",             "descricao": "Nova emissão de CRI Green Energy. Operação ESG-linked com prêmio de 15bps. Rating proposto: A+.", "prioridade": "alta", "tipo_caso": "aprovacao"},
    ],
    "Casos de Revisão": [
        {"titulo": "Revisão Anual - CRI Shopping Center Norte",      "descricao": "Revisão anual obrigatória. Indicadores de cobertura de DSCR: 1.8x (estável). Sem eventos de default.", "prioridade": "normal", "tipo_caso": "revisao"},
    ],
    "Assuntos Gerais": [
        {"titulo": "Implementação do novo sistema de monitoramento",  "descricao": "Atualização sobre o status do novo CRM e módulo de monitoramento automático. MVP previsto para Abril/2026.", "prioridade": "normal", "tipo_caso": "geral"},
        {"titulo": "Treinamento Compliance - Nova regulação CVM",    "descricao": "Agendamento do treinamento obrigatório sobre as novas regras da CVM para emissões de CRI/CRA.", "prioridade": "normal", "tipo_caso": "geral"},
    ],
    "IA/Inovação": [
        {"titulo": "POC: Modelo de scoring com IA generativa",        "descricao": "Apresentação do piloto de scoring automatizado usando LLM para análise de balanços e demonstrações financeiras.", "prioridade": "normal", "tipo_caso": "geral", "tipo": "video", "video_url": "https://stream.microsoft.com/video/poc-ia-scoring", "video_duracao": "12:45"},
    ],
}

ITENS_MONITORAMENTO = {
    "Assuntos Gerais": [
        {"titulo": "Sinistro - Operação Agro Campo Bonito",    "descricao": "Geada atingiu 40% das lavouras garantidoras. Acionamento de seguro em andamento.", "prioridade": "urgente", "tipo_caso": "geral"},
        {"titulo": "Atualização de covenants trimestrais",       "descricao": "7 operações com covenant check neste mês. 2 em waiver request.", "prioridade": "normal", "tipo_caso": "geral"},
    ],
    "Watchlist": [
        {"titulo": "CRI Construtora Delta - Atraso pagamento",  "descricao": "2 PMTs em atraso (60 dias). Trustee notificado. Reunião com devedor agendada.", "prioridade": "urgente", "tipo_caso": "revisao"},
        {"titulo": "CRA Fazenda do Sol - Rating rebaixado",     "descricao": "Rebaixamento de A para BBB+ pela agência. Motivo: queda de produtividade e aumento de endividamento.", "prioridade": "alta", "tipo_caso": "revisao"},
        {"titulo": "CRI Shopping Metropolitano - Vacância 32%", "descricao": "Vacância subiu de 18% para 32% no trimestre. Fluxo de caixa projetado comprometido.", "prioridade": "alta", "tipo_caso": "revisao"},
    ],
    "Assunto Recorrente da Semana": [
        {"titulo": "Análise Semanal - Mapa de Calor de Riscos",  "descricao": "Apresentação do mapa de calor semanal com as operações classificadas por nível de risco.", "prioridade": "normal", "tipo_caso": "geral", "tipo": "video", "video_url": "https://stream.microsoft.com/video/mapa-calor-semanal", "video_duracao": "08:30"},
    ],
    "Inovação": [
        {"titulo": "Dashboard de Monitoramento - Release 2.0",   "descricao": "Demonstração das novas features do dashboard: alertas automáticos, scoring dinâmico e push notifications.", "prioridade": "normal", "tipo_caso": "geral"},
    ],
}

COMENTARIOS_POOL = [
    ("Concordo com a avaliação. Acho que devemos seguir em frente.", 1, "Duarte Oliveira"),
    ("Importante considerar os riscos de crédito nesse cenário.", 2, "Carlos Mendes"),
    ("Já temos precedente em operação similar do ano passado.", 3, "Maria Fernanda"),
    ("Sugiro revisarmos as projeções com os números atualizados.", 4, "Lucas Ribeiro"),
    ("Excelente análise. Podemos avançar para votação.", 5, "Ana Beatriz"),
    ("Ponto de atenção válido. Precisamos do parecer jurídico.", 1, "Duarte Oliveira"),
    ("Alinhado com a equipe de risco sobre esse ponto.", 2, "Carlos Mendes"),
    ("O prazo está apertado, mas é factível se priorizarmos.", 3, "Maria Fernanda"),
]

PP_POOL = [
    ("Enviar relatório atualizado para o comitê de crédito", 1, "Duarte Oliveira"),
    ("Agendar reunião com a equipe jurídica para parecer", 2, "Carlos Mendes"),
    ("Solicitar atualização de balanço ao devedor", 3, "Maria Fernanda"),
    ("Preparar apresentação de follow-up para próxima semana", 4, "Lucas Ribeiro"),
    ("Formalizar waiver request junto ao trustee", 5, "Ana Beatriz"),
    ("Atualizar modelo financeiro com novos premissas", 1, "Duarte Oliveira"),
    ("Revisar covenants e notificar as partes envolvidas", 2, "Carlos Mendes"),
]


def seed_items_for_comite(comite_data, itens_map):
    """Adiciona itens, comentários, votos e próximos passos a um comitê."""
    comite_id = comite_data["id"]
    secoes = comite_data.get("secoes", [])
    
    item_count = 0
    comment_idx = 0
    pp_idx = 0
    
    for secao in secoes:
        secao_nome = secao["nome"]
        secao_id = secao["id"]
        
        items_for_section = itens_map.get(secao_nome, [])
        
        for item_def in items_for_section:
            user = USERS[item_count % len(USERS)]
            payload = {
                "titulo": item_def["titulo"],
                "descricao": item_def.get("descricao", ""),
                "secao_id": secao_id,
                "criador_user_id": user[0],
                "criador_nome": user[1],
                "tipo": item_def.get("tipo", "presencial"),
                "prioridade": item_def.get("prioridade", "normal"),
                "tipo_caso": item_def.get("tipo_caso", "geral"),
                "video_url": item_def.get("video_url", ""),
                "video_duracao": item_def.get("video_duracao", ""),
            }
            
            item_result = post(f"/comites/{comite_id}/itens", payload)
            if not item_result:
                continue
                
            item_id = item_result["id"]
            item_count += 1
            
            # Add 2-3 comentários por item
            num_comments = 2 + (item_count % 2)
            for _ in range(num_comments):
                c = COMENTARIOS_POOL[comment_idx % len(COMENTARIOS_POOL)]
                comment_idx += 1
                post(f"/itens/{item_id}/comentarios", {
                    "user_id": c[1],
                    "user_nome": c[2],
                    "texto": c[0],
                })
            
            # Add votos para itens de aprovação/revisão
            if item_def.get("tipo_caso") in ("aprovacao", "revisao"):
                voto_tipos = ["aprovado", "aprovado", "discussao"]
                for i, vt in enumerate(voto_tipos):
                    u = USERS[i % len(USERS)]
                    post(f"/itens/{item_id}/votos", {
                        "user_id": u[0],
                        "user_nome": u[1],
                        "tipo_voto": vt,
                        "cargo_voto": ["gestao", "risco", "credito"][i % 3],
                    })
            
            # Marcar vídeo como assistido para itens de vídeo
            if item_def.get("tipo") == "video":
                for u in USERS[:3]:
                    post(f"/itens/{item_id}/video-assistido", {
                        "user_id": u[0],
                        "user_nome": u[1],
                    })
            
            # Add 1-2 próximos passos
            num_pp = 1 + (item_count % 2)
            for _ in range(num_pp):
                pp = PP_POOL[pp_idx % len(PP_POOL)]
                pp_idx += 1
                post(f"/itens/{item_id}/proximos-passos", {
                    "descricao": pp[0],
                    "responsavel_user_id": pp[1],
                    "responsavel_nome": pp[2],
                })
    
    return item_count


# ═══════════════════════════════════════════════════════════════
# 4. Popular cada comitê com itens
# ═══════════════════════════════════════════════════════════════
print("\n═══ 4. Populando Comitês com Itens ═══")

total_items = 0
for comite_summary in comites_created:
    comite_id = comite_summary["id"]
    # Buscar detalhes completos (tem as seções)
    detail = get(f"/comites/{comite_id}")
    if not detail:
        continue
    
    # Determinar se é investimento ou monitoramento pelo tipo da rule
    rule_tipo = detail.get("rule", {}).get("tipo", "investimento")
    itens_map = ITENS_INVESTIMENTO if rule_tipo == "investimento" else ITENS_MONITORAMENTO
    
    count = seed_items_for_comite(detail, itens_map)
    total_items += count

print(f"\n  ℹ Total itens criados: {total_items}")


# ═══════════════════════════════════════════════════════════════
# 5. Completar comitês passados
# ═══════════════════════════════════════════════════════════════
print("\n═══ 5. Completando Comitês Passados ═══")

for comite_summary in comites_created:
    comite_date_str = comite_summary.get("data", "")
    try:
        comite_date = datetime.fromisoformat(comite_date_str.replace("Z", ""))
    except Exception:
        continue
    
    # Se a data é no passado, completar o comitê
    if comite_date < today:
        result = post(f"/comites/{comite_summary['id']}/completar", {})
        if result:
            print(f"    → Comitê #{comite_summary['id']} ({comite_date.strftime('%d/%m/%Y')}) concluído")


# ═══════════════════════════════════════════════════════════════
# 6. Resumo Final
# ═══════════════════════════════════════════════════════════════
print("\n" + "═" * 60)
print("  SEED CONCLUÍDO!")
print(f"  • Regras:     {len(all_rules)}")
print(f"  • Comitês:    {len(comites_created)}")
print(f"  • Itens:      {total_items}")
print("═" * 60)
print(f"\n  Acesse {BASE} para verificar os dados.")
