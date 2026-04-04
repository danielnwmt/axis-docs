# AxisDocs - Sistema de Gestão Documental

## Instalação no Ubuntu

Cada instalação é **100% independente e local** — possui seu próprio banco de dados PostgreSQL rodando via Docker no servidor.

### Requisitos
- Ubuntu 22.04+ ou 24.04+
- Acesso root (sudo)
- Conexão com a internet (para download inicial)
- Mínimo 2GB RAM (Docker + PostgreSQL)
- Domínio apontado para o servidor (opcional, apenas para SSL)

### Instalar no Servidor

```bash
sudo bash install.sh
```

O instalador faz tudo automaticamente:
1. Instala Docker, Node.js e Nginx
2. Sobe um banco de dados PostgreSQL local (Supabase self-hosted)
3. Configura o schema, políticas de segurança e dados padrão
4. Compila o frontend e configura o Nginx
5. Configura SSL automaticamente (se um domínio for informado)

O único dado opcional solicitado é o **domínio** (para SSL).

Ou passe via variável de ambiente:

```bash
sudo APP_DOMAIN=docs.seudominio.com bash install.sh
```

### Criar o Primeiro Usuário Administrador

Após a instalação, conecte-se ao banco local e crie o primeiro usuário:

```bash
# Acesse o banco local
PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres
```

```sql
-- Após o primeiro usuário se cadastrar, promova para admin:
UPDATE public.profiles SET role = 'Administrador' WHERE email = 'seuemail@exemplo.com';
```

### Acesso
- **Sem domínio**: `http://localhost` ou `http://<IP-DO-SERVIDOR>`
- **Com domínio + SSL**: `https://seu-dominio.com`

### Comandos Úteis

| Comando | Descrição |
|---------|-----------|
| `sudo bash /opt/axisdocs/update.sh` | Reconstruir localmente |
| `sudo bash /opt/axisdocs/uninstall.sh` | Remover instalação completa |

### PWA
O sistema pode ser instalado como aplicativo no navegador (Chrome/Edge) clicando em "Instalar" na barra de endereços.

### Arquitetura

```
Servidor Ubuntu (tudo local)
┌─────────────────────────────────────┐
│  Nginx (porta 80/443)              │
│  └─ Frontend React/Vite            │
│                                     │
│  Docker                            │
│  ├─ PostgreSQL (porta 54322)       │
│  ├─ Supabase Auth                  │
│  ├─ Supabase REST API (porta 54321)│
│  └─ Supabase Storage              │
└─────────────────────────────────────┘
```

Nenhum dado sai do servidor. Cada instalação é completamente isolada.
