# Plano de Conformidade LGPD — AxisDocs

Implementação em 4 fases priorizando o que tem maior impacto legal e exige menor refatoração.

---

## Fase 1 — Base Legal e Consentimento (obrigatório)

1. **Página `/privacidade`** (pública): Política de Privacidade com bases legais, dados coletados, finalidade, retenção, direitos do titular, contato do Encarregado (DPO).
2. **Página `/termos`** (pública): Termos de Uso.
3. **Aceite obrigatório no 1º login** junto da troca de senha — checkbox "Li e aceito a Política de Privacidade e Termos de Uso".
4. **Tabela `consents`** registrando: user_id, versão do documento, IP, user-agent, timestamp (prova de consentimento — Art. 8º §1º).
5. **Banner de cookies** simples (técnicos vs. opcionais), com aceite registrado em localStorage + audit log.

## Fase 2 — Direitos do Titular (Art. 18)

Nova página **`/meus-dados`** acessível a qualquer usuário logado, com:

1. **Exportar meus dados** — botão que gera ZIP com JSON do perfil + lista de documentos + logs próprios (portabilidade).
2. **Solicitar exclusão da conta** — abre solicitação registrada em `data_requests`; admin recebe alerta para anonimizar (não deleta documentos institucionais, anonimiza `user_id` e `user_email`).
3. **Histórico de acessos** — mostra os audit_logs do próprio usuário.
4. **Revogar consentimento** opcional de cookies.

Tabela `data_requests`: id, user_id, type (`export`|`delete`|`rectify`), status, requested_at, processed_at, processed_by.

## Fase 3 — Segurança Reforçada (Art. 46)

1. **MFA/2FA obrigatório para Administradores** (TOTP via Supabase Auth `mfa.enroll`).
2. **Política de senha forte** (mín 10 caracteres, maiúscula, número, símbolo) + ativar HIBP check.
3. **Bloqueio após N tentativas** falhas (já parcial no Supabase; documentar).
4. **Sessão com timeout** de inatividade (30 min) — logout automático.
5. **Função `anonymize_user(uuid)`** que substitui email/nome por hash em profiles e audit_logs.

## Fase 4 — Governança e Retenção

1. **Tabela `retention_policies`** por categoria de documento (ex.: contrato = 5 anos, recibo = 90 dias).
2. **Edge function `purge-expired`** agendada (pg_cron diário) que move/anonimiza documentos vencidos e registra em audit.
3. **Página admin `/lgpd`**: gerenciar políticas de retenção, ver solicitações de titulares, exportar RIPD (Relatório de Impacto), configurar dados do Encarregado (nome, email, telefone).
4. **Notificação de incidente** — botão admin "Registrar incidente" gera template de comunicação à ANPD (Art. 48).
5. **Rodapé global** com link para Política de Privacidade e contato do DPO.

---

## Estrutura Técnica

### Novas tabelas
- `consents` (user_id, document_type, version, ip, user_agent, accepted_at)
- `data_requests` (user_id, type, status, payload, requested_at, processed_at)
- `retention_policies` (category, retention_days, action: anonymize|delete)
- `privacy_incidents` (title, description, affected_users_count, reported_to_anpd_at, created_by)
- `dpo_config` (singleton: name, email, phone, updated_at)

### RLS
- `consents`, `data_requests`: usuário vê os próprios; admin vê tudo.
- `retention_policies`, `privacy_incidents`, `dpo_config`: somente Administrador.

### Funções/Triggers
- `record_consent(version, doc_type)` — RPC SECURITY DEFINER captura IP via `request.headers`.
- `anonymize_user(uuid)` — SECURITY DEFINER, somente admin.
- `request_data_export(user_id)` — gera JSON consolidado.

### Páginas/Rotas
- `/privacidade`, `/termos` (públicas, estáticas)
- `/meus-dados` (qualquer usuário logado)
- `/lgpd` (somente admin) — adicionar no AppSidebar
- Modificar `ChangePassword` para incluir aceite obrigatório
- Adicionar `CookieBanner` no `AppLayout`

### i18n
Todos os textos novos em pt-BR / en / es.

---

## Entregas por fase

Posso implementar **tudo de uma vez** (grande) ou **fase por fase** com revisão entre cada uma (recomendado).

**Confirme:**
- (A) Implementar tudo agora, OU
- (B) Começar pela Fase 1 (base legal + consentimento) e seguir?

Também preciso saber:
- Nome, email e telefone do **Encarregado de Dados (DPO)** — posso deixar placeholder e você edita depois na tela admin?
