# AxisDocs - Sistema de Gestão Documental

## Instalação no Ubuntu

### Requisitos
- Ubuntu 22.04+ ou 24.04+
- Acesso root (sudo)
- Conexão com a internet
- Domínio apontado para o servidor (opcional, apenas para SSL)

### Instalação Rápida (Recomendado)

```bash
sudo bash install.sh
```

O script copia os arquivos locais do projeto para `/opt/axisdocs`, instala as dependências e publica o sistema com Nginx. Não há sincronização automática com repositórios remotos ou nuvem.

### Instalação com domínio + SSL

```bash
sudo APP_DOMAIN=docs.seudominio.com SSL_EMAIL=admin@seudominio.com bash install.sh
```

> Antes de emitir o SSL, aponte o domínio para o IP do servidor.

### Instalação Manual

```bash
# 1. Copie os arquivos do projeto para o servidor
# 2. Entre na pasta do projeto
# 3. Rode a instalação
sudo bash install.sh
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
