# AxisDocs SaaS na AWS

## Arquitetura

```text
CloudFront/ALB ──► ECS Fargate (web: nginx + build Vite)
                └► ECS Fargate (api: Node/Express)  ──► S3 (SSE-KMS, privado)
                                                     └► Postgres/Supabase (RLS por tenant)
```

- Multiempresa por `tenant_id` com RLS e `is_super_admin`.
- Upload/download por URL pré-assinada: o navegador nunca vê credenciais AWS.
- Bucket privado, versionado, criptografado com KMS e com política TLS-only.
- IAM da task limitada ao prefixo `tenants/*` do bucket e à chave KMS do projeto.

## Passo a passo

1. **Banco**: rode `infra/sql/aws_saas_multitenancy.sql` (psql). Ele já inclui `GRANT`s e substitui as policies antigas.
2. **Tenant inicial**:

```sql
INSERT INTO public.tenants(name,slug) VALUES ('Prefeitura Inicial','prefeitura-inicial') RETURNING id;
UPDATE public.profiles   SET tenant_id='<ID>' WHERE tenant_id IS NULL;
UPDATE public.documents  SET tenant_id='<ID>' WHERE tenant_id IS NULL;
UPDATE public.categories SET tenant_id='<ID>' WHERE tenant_id IS NULL;
UPDATE public.units      SET tenant_id='<ID>' WHERE tenant_id IS NULL;
UPDATE public.audit_logs SET tenant_id='<ID>' WHERE tenant_id IS NULL;
UPDATE public.profiles   SET is_super_admin=true WHERE email='SEU_EMAIL';
```

3. **Infra**: `cd infra/terraform && cp terraform.tfvars.example terraform.tfvars && terraform init && terraform apply`.
   Saídas usadas depois: `documents_bucket`, `kms_key_arn`, `api_ecr_repository`, `web_ecr_repository`, `api_task_role_arn`, `api_execution_role_arn`.
4. **Segredos**: crie no Secrets Manager (`SUPABASE_SERVICE_ROLE_KEY` etc.) e informe os ARNs em `api_secret_arns`.
5. **API**:

```bash
docker build -f Dockerfile.api -t $API_ECR:latest .
docker push $API_ECR:latest
```

   Rode no ECS/Fargate atrás de um ALB, health check em `GET /health`, porta 8080,
   `taskRoleArn = api_task_role_arn` e `executionRoleArn = api_execution_role_arn`.
6. **Frontend**:

```bash
docker build -f Dockerfile \
  --build-arg VITE_SUPABASE_URL=... \
  --build-arg VITE_SUPABASE_PUBLISHABLE_KEY=... \
  --build-arg VITE_API_URL=https://api.seudominio.gov.br \
  -t $WEB_ECR:latest .
```

   Publique em ECS ou envie `dist/` para S3 + CloudFront.

## O que ainda falta na infra (não coberto pelo Terraform)

VPC/subnets, ALB + ACM, cluster ECS, task definitions, WAF e Route 53. Estes recursos
dependem da rede existente da instituição e devem ser criados separadamente.

## Observação sobre assinatura A1

`sign-pdf-a1` continua gravando no Google Drive. Para operar 100% na AWS, a função
precisa devolver o PDF assinado para a API S3 ou ser reimplementada como worker
ECS/Lambda.

## Notas técnicas importantes

- A URL pré-assinada de upload **não** assina cabeçalhos SSE-KMS: a criptografia vem da
  configuração padrão do bucket. Assinar `x-amz-server-side-encryption` faria o `PUT`
  do navegador falhar com `SignatureDoesNotMatch`.
- O CORS do bucket precisa listar exatamente a origem do frontend (`allowed_origins`).
- A API roda com `trust proxy` para funcionar corretamente atrás do ALB.
