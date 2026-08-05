import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const required = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "AWS_REGION", "S3_BUCKET"];
for (const name of required) {
  if (!process.env[name]) throw new Error(`Variável obrigatória ausente: ${name}`);
}

const allowedOrigins = (process.env.CORS_ORIGINS || "http://localhost:5173")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

const app = express();
app.disable("x-powered-by");
// Necessário atrás do ALB/CloudFront para IP real e rate limit correto.
app.set("trust proxy", Number(process.env.TRUST_PROXY_HOPS || 1));
app.use(helmet({ crossOriginResourcePolicy: { policy: "same-site" } }));
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
      cb(new Error("Origem não permitida"));
    },
    credentials: false,
  }),
);
app.use(express.json({ limit: "256kb" }));

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const s3 = new S3Client({ region: process.env.AWS_REGION });
const bucket = process.env.S3_BUCKET;

const apiLimiter = rateLimit({
  windowMs: 60_000,
  limit: Number(process.env.RATE_LIMIT_PER_MINUTE || 120),
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Muitas requisições. Tente novamente em instantes." },
});

async function auth(req, res, next) {
  try {
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
    if (!token) return res.status(401).json({ error: "Token ausente" });
    const { data, error } = await db.auth.getUser(token);
    if (error || !data?.user) return res.status(401).json({ error: "Token inválido" });
    const { data: profile } = await db
      .from("profiles")
      .select("id,tenant_id,role,active")
      .eq("id", data.user.id)
      .maybeSingle();
    if (!profile || profile.active === false) return res.status(403).json({ error: "Usuário inativo" });
    if (!profile.tenant_id) return res.status(403).json({ error: "Usuário sem empresa vinculada" });
    req.identity = { user: data.user, profile };
    next();
  } catch (e) {
    console.error("auth", e);
    res.status(500).json({ error: "Falha na autenticação" });
  }
}

function safeName(name = "arquivo") {
  return (
    name
      .normalize("NFKD")
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/-+/g, "-")
      .slice(-180) || "arquivo"
  );
}

function isValidKey(objectKey) {
  return (
    typeof objectKey === "string" &&
    objectKey.length > 0 &&
    objectKey.length <= 1024 &&
    !objectKey.includes("..") &&
    !objectKey.startsWith("/")
  );
}

function belongsToTenant(objectKey, tenantId) {
  return isValidKey(objectKey) && objectKey.startsWith(`tenants/${tenantId}/`);
}

// Health checks do ALB/ECS — sem auth e sem rate limit.
app.get("/health", (_req, res) => res.json({ ok: true, service: "axisdocs-api" }));

app.use("/v1", apiLimiter);

app.post("/v1/storage/upload-url", auth, async (req, res) => {
  try {
    const { fileName, fileType, fileSize } = req.body || {};
    if (!fileName || !Number.isFinite(fileSize) || fileSize <= 0) {
      return res.status(400).json({ error: "Arquivo inválido" });
    }
    const max = Number(process.env.MAX_UPLOAD_BYTES || 5_368_709_120);
    if (fileSize > max) return res.status(413).json({ error: "Arquivo excede o limite permitido" });

    const tenantId = req.identity.profile.tenant_id;
    const { data: tenant, error } = await db
      .from("tenants")
      .select("storage_limit_bytes,storage_used_bytes,status")
      .eq("id", tenantId)
      .maybeSingle();
    if (error || !tenant) return res.status(404).json({ error: "Empresa não encontrada" });
    if (tenant.status !== "active") return res.status(403).json({ error: "Empresa bloqueada" });
    if (Number(tenant.storage_used_bytes) + Number(fileSize) > Number(tenant.storage_limit_bytes)) {
      return res.status(409).json({ error: "Limite de armazenamento atingido" });
    }

    const objectKey = `tenants/${tenantId}/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}-${safeName(fileName)}`;

    // A criptografia KMS vem da configuração padrão do bucket (SSE-KMS + bucket key).
    // Não assinamos cabeçalhos SSE aqui: o presigner os transformaria em cabeçalhos
    // obrigatórios e o PUT do navegador falharia com 403 SignatureDoesNotMatch.
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: objectKey,
      ContentType: fileType || "application/octet-stream",
    });
    const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 900 });
    res.json({ uploadUrl, objectKey, bucket });
  } catch (e) {
    console.error("upload-url", e);
    res.status(500).json({ error: "Não foi possível preparar o upload" });
  }
});

app.post("/v1/storage/confirm", auth, async (req, res) => {
  try {
    const { objectKey, fileSize } = req.body || {};
    const tenantId = req.identity.profile.tenant_id;
    if (!belongsToTenant(objectKey, tenantId)) {
      return res.status(403).json({ error: "Objeto não pertence à empresa" });
    }
    const head = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: objectKey }));
    if (Number(head.ContentLength) !== Number(fileSize)) {
      return res.status(409).json({ error: "Tamanho do arquivo não confere" });
    }
    const { error } = await db.rpc("confirm_tenant_storage_upload", {
      _tenant_id: tenantId,
      _bytes: Number(fileSize),
    });
    if (error) {
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: objectKey }));
      return res.status(409).json({ error: error.message || "Limite de armazenamento atingido" });
    }
    res.json({ success: true });
  } catch (e) {
    console.error("confirm", e);
    res.status(500).json({ error: "Falha ao confirmar upload" });
  }
});

app.post("/v1/storage/download-url", auth, async (req, res) => {
  try {
    const { objectKey, action = "view", fileName } = req.body || {};
    const tenantId = req.identity.profile.tenant_id;
    if (!belongsToTenant(objectKey, tenantId)) return res.status(403).json({ error: "Acesso negado" });
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: objectKey,
      ResponseContentDisposition:
        action === "download"
          ? `attachment; filename*=UTF-8''${encodeURIComponent(safeName(fileName))}`
          : "inline",
    });
    res.json({ url: await getSignedUrl(s3, command, { expiresIn: 300 }) });
  } catch (e) {
    console.error("download-url", e);
    res.status(500).json({ error: "Falha ao gerar link" });
  }
});

app.delete("/v1/storage/object", auth, async (req, res) => {
  try {
    const { objectKey } = req.body || {};
    const tenantId = req.identity.profile.tenant_id;
    if (!belongsToTenant(objectKey, tenantId)) return res.status(403).json({ error: "Acesso negado" });
    let size = 0;
    try {
      const head = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: objectKey }));
      size = Number(head.ContentLength || 0);
    } catch {
      // objeto já removido — segue para liberar a cota mesmo assim
    }
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: objectKey }));
    await db.rpc("release_tenant_storage", { _tenant_id: tenantId, _bytes: size });
    res.json({ success: true });
  } catch (e) {
    console.error("delete-object", e);
    res.status(500).json({ error: "Falha ao excluir arquivo" });
  }
});

app.use((_req, res) => res.status(404).json({ error: "Rota não encontrada" }));

const port = Number(process.env.PORT || 8080);
const server = app.listen(port, "0.0.0.0", () => console.log(`AxisDocs API na porta ${port}`));

// Encerramento limpo para o ECS não derrubar requisições em andamento.
for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => {
    console.log(`${signal} recebido, encerrando...`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 10_000).unref();
  });
}
