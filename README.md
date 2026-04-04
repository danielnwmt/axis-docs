# AxisDocs - Sistema de Gestão Documental

## Instalação no Ubuntu

Cada instalação é **100% local e independente** — sem Docker, sem serviços externos.

### Requisitos
- Ubuntu 22.04+ ou 24.04+
- Acesso root (sudo)
- Conexão com a internet (para download inicial)
- Domínio apontado para o servidor (opcional, para SSL)

### Instalar

```bash
sudo bash install.sh
```

O instalador faz tudo automaticamente:
1. Instala PostgreSQL, Node.js e Nginx
2. Cria o banco de dados com schema, RLS e dados padrão
3. Instala PostgREST (API REST para o banco)
4. Configura servidor de autenticação local
5. Configura servidor de armazenamento de arquivos local
6. Compila o frontend e configura Nginx como gateway
7. Configura SSL automaticamente (se domínio informado)

O único dado opcional é o **domínio** (para SSL). Não é necessário informar URL, chave ou qualquer configuração externa.

```bash
sudo APP_DOMAIN=docs.seudominio.com bash install.sh
```

### Acesso
- **Sem domínio**: `http://localhost` ou `http://<IP-DO-SERVIDOR>`
- **Com domínio + SSL**: `https://seu-dominio.com`

### Criar Primeiro Administrador

Após acessar o sistema e se cadastrar, promova o usuário para administrador:

```bash
sudo -u postgres psql -d axisdocs -c "UPDATE public.profiles SET role = 'Administrador' WHERE email = 'seuemail@exemplo.com';"
```

### Comandos Úteis

| Comando | Descrição |
|---------|-----------|
| `sudo bash /opt/axisdocs/update.sh` | Reconstruir aplicação |
| `sudo bash /opt/axisdocs/backup.sh` | Backup do banco e arquivos |
| `sudo bash /opt/axisdocs/uninstall.sh` | Remover instalação |

### Credenciais

As credenciais locais (JWT secret, senha do banco) ficam em `/etc/axisdocs/credentials`.

### PWA
O sistema pode ser instalado como aplicativo no navegador (Chrome/Edge).

### Arquitetura

```
Servidor Ubuntu (tudo nativo, sem Docker)
┌──────────────────────────────────────────┐
│  Nginx (porta 80/443) — Gateway          │
│  ├─ /           → Frontend React/Vite    │
│  ├─ /rest/v1/   → PostgREST (3001)      │
│  ├─ /auth/v1/   → Auth Server (9999)    │
│  └─ /storage/v1/→ Storage Server (5555) │
│                                          │
│  PostgreSQL (porta 5432)                 │
│  └─ Banco: axisdocs                      │
└──────────────────────────────────────────┘
```

Nenhum dado sai do servidor. Zero dependência externa.
