# AxisDocs - Sistema de Gestão Documental

## Instalação no Ubuntu

### Requisitos
- Ubuntu 22.04+ ou 24.04+
- Acesso root (sudo)
- Conexão com a internet

### Instalação Rápida (Recomendado)

```bash
sudo bash install.sh
```

O script instala Docker, clona o repositório e inicia o sistema automaticamente.

### Instalação Manual

```bash
# 1. Clone o repositório
git clone https://github.com/danielnwmt/axis-docs.git /opt/axisdocs
cd /opt/axisdocs

# 2. Configure o .env (já vem pré-configurado)

# 3. Inicie com Docker
docker compose up -d --build
```

### Acesso
- **URL**: `http://localhost` ou `http://<IP-DO-SERVIDOR>`

### Comandos Úteis

| Comando | Descrição |
|---------|-----------|
| `docker compose up -d` | Iniciar |
| `docker compose down` | Parar |
| `docker compose logs -f` | Ver logs |
| `docker compose up -d --build` | Reconstruir |

### PWA
O sistema pode ser instalado como aplicativo no navegador (Chrome/Edge) clicando em "Instalar" na barra de endereços.
