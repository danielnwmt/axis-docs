# Plano de segurança — A + B + C + D

## A) Endurecer CSP (Nginx)
Arquivo: `scripts/install/lib.sh`
- Remover `'unsafe-eval'` do `script-src` (Vite build de produção não precisa).
- Manter `'unsafe-inline'` apenas em `style-src` (Tailwind/shadcn usam estilos inline).
- Adicionar `script-src 'self'` + hashes para os 2 scripts inline mínimos do `index.html` (não há — só `<script type="module" src="/src/main.tsx">`, então `'self'` basta).
- Adicionar `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'none'`.
- Permitir `connect-src` para o próprio host + `https://*.supabase.co` (necessário para Lovable Cloud).
- `img-src 'self' data: blob: https:` (para PDFs/Drive).
- `media-src 'self'` (vídeo de login).
- `worker-src 'self' blob:` (tesseract.js usa Web Workers).

## B) MFA / TOTP
Usa o MFA nativo do Supabase (já disponível, não precisa de tabela nova).

1. **Migration**: nada — o Supabase armazena fatores em `auth.mfa_factors`.
2. **Configuração**: chamar `supabase--configure_auth` não cobre MFA; o MFA já vem habilitado por padrão para "TOTP".
3. **Nova página `/mfa-setup`** (`src/pages/MfaSetup.tsx`):
   - `supabase.auth.mfa.enroll({ factorType: 'totp' })` → mostra QR code + secret.
   - Usuário digita código de 6 dígitos (componente `InputOTP` já existe).
   - `supabase.auth.mfa.challenge` + `verify` → ativa fator.
4. **Página `/mfa-verify`** após login: se `aal` for `aal1` e existir fator verificado, exige TOTP antes de liberar.
5. **`ProtectedRoute.tsx`**: checar `supabase.auth.mfa.getAuthenticatorAssuranceLevel()`. Se `currentLevel='aal1'` e `nextLevel='aal2'`, redirecionar para `/mfa-verify`.
6. **`Settings.tsx`**: adicionar seção "Autenticação em 2 fatores" com botão **Ativar** (→ `/mfa-setup`) ou **Desativar** (`unenroll`).
7. **Coluna opcional** em `profiles`: `mfa_required boolean default false` — admins podem forçar MFA por usuário (fase 2, deixar fora desta entrega para reduzir escopo).

## C) ClamAV no servidor
Arquivo: `scripts/install/lib.sh`
- `apt_install` recebe `clamav clamav-daemon clamav-freshclam`.
- Nova função `configure_clamav()`:
  - `systemctl stop clamav-freshclam` → `freshclam` (atualiza base) → `systemctl enable --now clamav-freshclam clamav-daemon`.
  - Cria `/usr/local/bin/axisdocs-scan-backup.sh` que roda `clamdscan` nos arquivos de `/var/backups/axisdocs` antes de cifrar.
- Integrar no `write_backup_script()`: antes do `tar`/`pg_dump`, rodar scan no diretório-fonte e abortar se infectado.

**Limitação honesta**: uploads de documentos sobem direto para Google Drive via edge function (Supabase Cloud), que não tem acesso ao ClamAV local. Para esses, a validação fica em: extensão + MIME + magic bytes (já implementado). ClamAV protege o servidor local (backups, restores, arquivos servidos pelo `serve-drive-file` quando baixados).

## D) Auditoria view/download
Verificar pontos onde documentos são abertos/baixados e garantir `logAudit('Visualizou X', 'view', docId)` / `logAudit('Baixou X', 'download', docId)`.

Pontos a auditar:
- `src/pages/Documents.tsx` — botões Visualizar e Baixar.
- `src/components/documents/PdfPreview.tsx` — abertura do viewer.
- `src/pages/Search.tsx` — clique em resultado.
- `src/pages/Signature.tsx` — preview do PDF.
- `src/lib/driveFile.ts` — função central de download → adicionar log com nome do documento.

Estratégia: centralizar no `driveFile.ts` (já é o ponto único de fetch) — todo download passa por lá; loga uma vez.
Para `view`: logar no `PdfPreview` quando o canvas renderiza a 1ª página.

## Detalhes técnicos

- CSP exata (linha única, sem `unsafe-eval`):
  ```
  default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' https://*.supabase.co wss://*.supabase.co; media-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none';
  ```
- MFA: requer `@supabase/supabase-js >= 2.40` (já temos).
- ClamAV ocupa ~1 GB de RAM com base atualizada; aceitável em servidor dedicado.
- `auditLog` já existe e usa RPC `insert_audit_log` (security definer) — não precisa nova RPC.

## Ordem de execução
1. CSP (lib.sh) — risco baixo, só config.
2. ClamAV (lib.sh) — só infra.
3. Auditoria view/download (frontend) — risco zero.
4. MFA — maior superfície de mudança; faço por último.

Confirma para eu aplicar tudo?
