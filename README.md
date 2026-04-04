# AxisDocs - Sistema de Gestão Documental

## Instalação no Ubuntu

Cada instalação é **independente** — possui seu próprio banco de dados e usuários.

### Requisitos
- Ubuntu 22.04+ ou 24.04+
- Acesso root (sudo)
- Conexão com a internet
- Um projeto Supabase (gratuito em https://supabase.com)
- Domínio apontado para o servidor (opcional, apenas para SSL)

### 1. Criar o Banco de Dados

1. Crie um projeto gratuito em [supabase.com](https://supabase.com)
2. No **SQL Editor** do projeto, execute o conteúdo do arquivo `scripts/setup-database.sql`
3. Anote a **URL do projeto** e a **Anon Key** (em Settings → API)

### 2. Instalar no Servidor

```bash
sudo bash install.sh
```

O instalador pedirá:
- **Domínio** (opcional, para SSL)
- **URL do Supabase** (ex: `https://xxxxx.supabase.co`)
- **Anon Key do Supabase**

Ou passe tudo via variáveis de ambiente:

```bash
sudo SUPABASE_URL=https://xxxxx.supabase.co \
     SUPABASE_ANON_KEY=eyJhbGciOi... \
     APP_DOMAIN=docs.seudominio.com \
     bash install.sh
```

### 3. Criar o Primeiro Usuário Administrador

Após a instalação, crie o primeiro usuário no painel do Supabase:

1. Em **Authentication → Users**, clique em "Add user"
2. Informe e-mail e senha
3. No **SQL Editor**, promova para administrador:

```sql
UPDATE public.profiles SET role = 'Administrador' WHERE email = 'seuemail@exemplo.com';
```

### Acesso
- **Sem domínio**: `http://localhost` ou `http://<IP-DO-SERVIDOR>`
- **Com domínio + SSL**: `https://seu-dominio.com`

### Comandos Úteis

| Comando | Descrição |
|---------|-----------|
| `sudo bash /opt/axisdocs/update.sh` | Reconstruir localmente |
| `sudo bash /opt/axisdocs/uninstall.sh` | Remover instalação |

### PWA
O sistema pode ser instalado como aplicativo no navegador (Chrome/Edge) clicando em "Instalar" na barra de endereços.

### Arquitetura

```
Servidor Ubuntu (local)         Supabase (nuvem)
┌─────────────────────┐        ┌──────────────────┐
│  Nginx + Frontend   │◄──────►│  Banco de Dados  │
│  (React/Vite)       │  API   │  Autenticação    │
│                     │        │  Storage         │
└─────────────────────┘        └──────────────────┘
```

Cada instalação aponta para seu próprio projeto Supabase. Dados não são compartilhados entre instalações.
