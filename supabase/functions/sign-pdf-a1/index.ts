import { createClient } from "https://esm.sh/@supabase/supabase-js@2.100.0";
import forge from "npm:node-forge@1.3.1";
import { SignPdf } from "npm:@signpdf/signpdf@3.2.4";
import { P12Signer } from "npm:@signpdf/signer-p12@3.2.4";
import { pdflibAddPlaceholder } from "npm:@signpdf/placeholder-pdf-lib@3.2.4";
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function getEncKey(): Uint8Array {
  const raw = Deno.env.get("CERT_ENCRYPTION_KEY") || "";
  let bytes: Uint8Array;
  try {
    if (/^[0-9a-fA-F]{64}$/.test(raw)) {
      bytes = new Uint8Array(raw.match(/.{2}/g)!.map((h) => parseInt(h, 16)));
    } else if (/^[A-Za-z0-9+/=]+$/.test(raw) && raw.length >= 44) {
      const bin = atob(raw);
      bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    } else {
      bytes = new TextEncoder().encode(raw);
    }
  } catch {
    bytes = new TextEncoder().encode(raw);
  }
  if (bytes.length < 32) return new Uint8Array(32);
  return bytes.slice(0, 32);
}

async function aesGcmDecrypt(ct: Uint8Array, iv: Uint8Array, tag: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", getEncKey(), { name: "AES-GCM" }, false, ["decrypt"]);
  const combined = new Uint8Array(ct.length + tag.length);
  combined.set(ct);
  combined.set(tag, ct.length);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, combined);
  return new Uint8Array(pt);
}

function fromPgHex(val: any): Uint8Array {
  // Supabase returns bytea as base64 string or { type:'Buffer', data:[] } or hex like \x..
  if (val instanceof Uint8Array) return val;
  if (Array.isArray(val)) return new Uint8Array(val);
  if (typeof val === "string") {
    if (val.startsWith("\\x")) {
      const hex = val.slice(2);
      return new Uint8Array(hex.match(/.{2}/g)!.map((h) => parseInt(h, 16)));
    }
    // base64
    const bin = atob(val);
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  }
  if (val?.data) return new Uint8Array(val.data);
  throw new Error("Formato bytea desconhecido");
}

async function getDriveAccessToken(sa: { client_email: string; private_key: string; token_uri: string }) {
  const now = Math.floor(Date.now() / 1000);
  const b64Url = (s: string) => btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const b64UrlBuf = (b: ArrayBuffer) =>
    btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const header = b64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = b64Url(JSON.stringify({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/drive",
    aud: sa.token_uri,
    iat: now,
    exp: now + 3600,
  }));
  const pem = sa.private_key.replace(/-----BEGIN PRIVATE KEY-----/, "").replace(/-----END PRIVATE KEY-----/, "").replace(/\n/g, "");
  const key = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey("pkcs8", key, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", cryptoKey, new TextEncoder().encode(`${header}.${payload}`));
  const res = await fetch(sa.token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${header}.${payload}.${b64UrlBuf(sig)}`,
  });
  if (!res.ok) throw new Error(`Drive auth: ${await res.text()}`);
  return (await res.json()).access_token as string;
}

function extractFolderId(input: string | undefined | null): string {
  if (!input) return "";
  const s = String(input).trim();
  const m = s.match(/[-\w]{25,}/);
  return m ? m[0] : s;
}

async function loadDriveConfig(supabase: any) {
  const { data: cfgFile, error } = await supabase.storage.from("settings").download("google-drive-config.json");
  if (error || !cfgFile) throw new Error("Google Drive não configurado");
  const cfg = JSON.parse(await cfgFile.text());
  // Normaliza: aceita rootFolderId (formato novo) ou folderId (legado).
  // Sem isso o upload vai para "My Drive" da Service Account, que não tem cota.
  cfg.folderId = extractFolderId(cfg.rootFolderId || cfg.folderId);
  return cfg;
}

async function loadCertForUser(supabase: any, userId: string, password: string) {
  const { data: certRow, error: certErr } = await supabase
    .from("user_certificates")
    .select("pfx_encrypted, pfx_iv, pfx_auth_tag, subject_cn, cpf, issuer, valid_to, fingerprint_sha256, signature_logo, signature_logo_size_pct")
    .eq("user_id", userId).maybeSingle();
  if (certErr || !certRow) throw new Error("Você ainda não cadastrou seu certificado A1. Vá em Configurações → Meu Certificado.");
  if (certRow.valid_to && new Date(certRow.valid_to) < new Date()) throw new Error("Certificado expirado. Cadastre um novo .pfx.");
  const ct = fromPgHex(certRow.pfx_encrypted);
  const iv = fromPgHex(certRow.pfx_iv);
  const tag = fromPgHex(certRow.pfx_auth_tag);
  let pfxBytes: Uint8Array;
  try { pfxBytes = await aesGcmDecrypt(ct, iv, tag); }
  catch { throw new Error("Falha ao descriptografar certificado (chave do servidor inválida)"); }
  try {
    const binStr = String.fromCharCode(...pfxBytes);
    const p12Asn1 = forge.asn1.fromDer(binStr);
    forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, password);
  } catch { throw new Error("Senha do certificado incorreta"); }
  return { certRow, pfxBytes };
}

async function findOrCreateFolder(token: string, name: string, parentId: string): Promise<string> {
  const q = `name='${name.replace(/'/g, "\\'")}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const r = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)&supportsAllDrives=true&includeItemsFromAllDrives=true`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (r.ok) {
    const j = await r.json();
    if (j.files?.[0]?.id) return j.files[0].id;
  }
  const c = await fetch("https://www.googleapis.com/drive/v3/files?supportsAllDrives=true", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder", parents: [parentId] }),
  });
  if (!c.ok) throw new Error(`Falha ao criar pasta '${name}': ${await c.text()}`);
  return (await c.json()).id;
}

async function uploadSignedToDrive(
  supabase: any,
  signedName: string,
  signedPdfBuf: Uint8Array,
  unitName?: string,
  categoryName?: string,
  useSignatureFolder: boolean = false,
) {
  const cfg = await loadDriveConfig(supabase);
  if (!cfg.folderId) throw new Error("ID da pasta raiz do Google Drive não configurado. Configure em Configurações.");
  const token = await getDriveAccessToken(cfg.serviceAccount);

  // Aba "Assinatura Digital" → tudo centralizado na pasta dedicada.
  // Fluxo normal (assinatura de documento já no acervo) → respeita Unidade/Categoria.
  let targetFolderId: string;
  if (useSignatureFolder) {
    targetFolderId = await findOrCreateFolder(token, "Assinatura Digital", cfg.folderId);
  } else {
    targetFolderId = cfg.folderId;
    if (unitName && unitName.trim()) {
      targetFolderId = await findOrCreateFolder(token, unitName.trim(), targetFolderId);
    }
    if (categoryName && categoryName.trim()) {
      targetFolderId = await findOrCreateFolder(token, categoryName.trim(), targetFolderId);
    }
  }
  const metadata: any = { name: signedName, parents: [targetFolderId] };
  const boundary = "----axisdocs" + Math.random().toString(36).slice(2);
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`,
    signedPdfBuf,
    `\r\n--${boundary}--`,
  ]);
  const upRes = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&enforceSingleParent=true", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": `multipart/related; boundary=${boundary}` },
    body,
  });
  if (!upRes.ok) throw new Error(`Falha ao subir assinado no Drive: ${await upRes.text()}`);
  const upJson = await upRes.json();
  return { driveFileId: upJson.id as string, driveLink: `https://drive.google.com/file/d/${upJson.id}/view` };
}

async function embedLogoFromDataUrl(pdfDoc: any, dataUrl: string) {
  const commaIdx = dataUrl.indexOf(",");
  if (commaIdx < 0) return null;
  const meta = dataUrl.slice(0, commaIdx).toLowerCase();
  const b64 = dataUrl.slice(commaIdx + 1);
  if (!/image\/(png|jpe?g)/.test(meta)) return null;
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return /image\/jpe?g/.test(meta) ? await pdfDoc.embedJpg(bytes) : await pdfDoc.embedPng(bytes);
}

async function loadSignatureLogo(pdfDoc: any, customLogo?: string | null) {
  try {
    if (customLogo?.startsWith("data:image/")) {
      const img = await embedLogoFromDataUrl(pdfDoc, customLogo);
      if (img) return img;
    }
    // HTTP(S) URLs are rejected to prevent SSRF. Only data:image/* URLs are accepted above.

  } catch (e) { console.warn("custom logo embed failed:", e); }
  const axisPngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAByklEQVR4Xu2bTU7DMBCFv6ogceAAnIAzUA6Am3ACDsAZOAPBIOwAR+AMnIATcAbOQDnRgEJibAfp2HRqO+mXAif4lvX7bWa8yePVaDabzeYKA+faHhr+8PexFwL4AnAFcAYwBfADF8uvEjYBzuIorhNuAQ4B3gC+AzSMAA4BHsZxvN8BuS+AXhzHcZI9dgmvtOiwC3Be/aNOwC7AVF4kMlre7kmAD1HKJT1Ob0fqg4DgEWiFAfZkqkqD4OwSbRiS9g0sB8xYLahSWJx2pgHEeW2tTr0+K6scLwGKI0lFQtJ7SCPtc1Cgp9OFIAXhSg83VEAQjmlRBbEVAAUglxFQbgPgi3gxxFQbQLgqXgxxFQoQPgofcxiKiQAfAMuiJhqAxgcKKIcSkq5DMBF4FvhNBNCiC+CE6KEn+GNiXSAey6BHKG3cALgIuAS4Dsj0pwi9RrkHLcARwGXAH8M0iO9CqL7HTgXeAN4LmDPmBtBciPwReBN4L+AJ4B5gTse+AP4x8d2nYCJ4J8D+jr2KeA34Ami0v/50Ejh/3rsE2A+8bpwC7A2fZMIlc2wdODf2gjuAJ2+1nkl+vjEUHcm2DqJ2B1Y3+IGojz31A8/zNwQAHaHF7wPjqO48J4rDabzVsN8AMhs4oWFKfLPQAAAABJRU5ErkJggg==";
  try {
    return await pdfDoc.embedPng(Uint8Array.from(atob(axisPngBase64), (c) => c.charCodeAt(0)));
  } catch (e) { console.warn("default logo embed failed:", e); }
  return null;
}

async function drawSignatureStamp(pdfDoc: any, position: any, certRow: any, user: any) {
  const pages = pdfDoc.getPages();
  const pageIdx = Math.max(0, Math.min(pages.length - 1, position.page - 1));
  const page = pages[pageIdx];
  const { width: pw, height: ph } = page.getSize();
  const crop = typeof page.getCropBox === "function" ? page.getCropBox() : { x: 0, y: 0, width: pw, height: ph };
  const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
  const xr = clamp(Number(position.xRatio ?? 0), 0, 1);
  const yr = clamp(Number(position.yRatio ?? 0), 0, 1);
  const wr = clamp(Number(position.wRatio ?? 0.28), 0.03, 1);
  const hr = clamp(Number(position.hRatio ?? 0.08), 0.02, 1);
  // A tela usa origem no topo-esquerdo; o PDF usa origem no rodapé-esquerdo.
  // Por isso o Y precisa ser invertido usando a altura do carimbo.
  // Não usamos pdfRect aqui porque ele pode vir em outro referencial dependendo do PDF.js/viewport.
  // Sobe 2 cm (~56.7 pt) para ajuste fino de posicionamento.
  const OFFSET_PT = 56.7;
  let wBox = clamp(wr * crop.width, 12, crop.width);
  let hBox = clamp(hr * crop.height, 8, crop.height);
  let x = clamp(crop.x + xr * crop.width, crop.x, crop.x + crop.width - wBox);
  let y = clamp(crop.y + crop.height - (yr * crop.height) - hBox + OFFSET_PT, crop.y, crop.y + crop.height - hBox);

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const navy = rgb(0.12, 0.23, 0.37);
  const navyDark = rgb(0.06, 0.11, 0.24);
  const slate = rgb(0.28, 0.33, 0.41);
  const white = rgb(1, 1, 1);

  page.drawRectangle({ x, y, width: wBox, height: hBox, color: white, opacity: 1, borderColor: navy, borderWidth: 0.6 });
  const barW = Math.max(2.5, wBox * 0.022);
  page.drawRectangle({ x, y, width: barW, height: hBox, color: navy });

  const cn = certRow.subject_cn || user.email || "Assinante";
  const now = new Date();
  // pt-BR local format: DD/MM/YYYY, HH:MM:SS
  const dt = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).format(now);

  const logoImg = await loadSignatureLogo(pdfDoc, (certRow as any).signature_logo || null);

  const padL = barW + wBox * 0.035;
  const padR = wBox * 0.035;

  let logoW = 0;
  if (logoImg) {
    const sizePct = Math.min(50, Math.max(5, (certRow as any).signature_logo_size_pct ?? 22));
    const maxLogoH = hBox * 0.7;
    const maxLogoW = wBox * (sizePct / 100);
    const ratio = logoImg.width / logoImg.height;
    let lh = maxLogoH;
    let lw = lh * ratio;
    if (lw > maxLogoW) { lw = maxLogoW; lh = lw / ratio; }
    const lx = x + padL;
    const ly = y + (hBox - lh) / 2;
    page.drawImage(logoImg, { x: lx, y: ly, width: lw, height: lh });
    logoW = lw + wBox * 0.025;
  } else {
    const lx = x + padL;
    const icon = Math.min(hBox * 0.28, wBox * 0.055);
    const brandSize = Math.max(5, Math.min(hBox * 0.16, wBox * 0.035));
    const ly = y + (hBox - icon - brandSize - 1.5) / 2;
    page.drawCircle({ x: lx + icon * 0.45, y: ly + icon * 0.55, size: icon * 0.26, color: rgb(0.18, 0.73, 0.62), opacity: 0.95 });
    page.drawCircle({ x: lx + icon * 0.7, y: ly + icon * 0.72, size: icon * 0.22, color: rgb(0.25, 0.82, 0.91), opacity: 0.95 });
    page.drawRectangle({ x: lx + icon * 0.18, y: ly + icon * 0.18, width: icon * 0.78, height: icon * 0.24, color: rgb(0.12, 0.23, 0.37), opacity: 0.9 });
    page.drawText("AXIS", { x: lx, y: ly - brandSize - 1.5, size: brandSize, font: fontBold, color: navy });
    logoW = Math.max(icon, fontBold.widthOfTextAtSize("AXIS", brandSize)) + wBox * 0.035;
  }

  const textX = x + padL + logoW;
  const contentW = wBox - padL - padR - logoW;

  const formatCPF = (raw: string): string => {
    const digits = raw.replace(/\D/g, "");
    if (digits.length === 11) return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
    return raw;
  };

  const colonIdx = cn.lastIndexOf(":");
  let nameOnly = cn;
  let cpfOnly = "";
  if (colonIdx > 0) {
    nameOnly = cn.slice(0, colonIdx).trim();
    cpfOnly = cn.slice(colonIdx + 1).trim();
  }

  const labelText = "ASSINADO DIGITALMENTE POR";
  const cpfText = cpfOnly ? `CPF: ${formatCPF(cpfOnly)}` : "";
  const fitSize = (text: string, initial: number, min: number, f: any) => {
    let size = initial;
    while (size > min && f.widthOfTextAtSize(text, size) > contentW) size -= 0.25;
    return Math.max(min, size);
  };

  let labelSize = fitSize(labelText, Math.max(7, hBox * 0.15), 4.5, fontBold);
  let nameSize = fitSize(nameOnly, Math.max(9, hBox * 0.24), 5.5, fontBold);
  let cpfSize = cpfText ? fitSize(cpfText, Math.max(10, hBox * 0.22), 5.5, fontBold) : 0;
  let metaSize = fitSize(dt, Math.max(7, hBox * 0.15), 4.5, font);
  let gap = Math.max(1.2, hBox * 0.035);

  let totalH = labelSize + nameSize + (cpfText ? cpfSize : 0) + metaSize + gap * (cpfText ? 3 : 2);
  if (totalH > hBox * 0.84) {
    const scale = (hBox * 0.84) / totalH;
    labelSize *= scale;
    nameSize *= scale;
    cpfSize *= scale;
    metaSize *= scale;
    gap *= scale;
    totalH = labelSize + nameSize + (cpfText ? cpfSize : 0) + metaSize + gap * (cpfText ? 3 : 2);
  }

  let cy = y + (hBox + totalH) / 2 - labelSize;
  page.drawText(labelText, { x: textX, y: cy, size: labelSize, font: fontBold, color: navy });
  cy -= nameSize + gap;
  page.drawText(nameOnly, { x: textX, y: cy, size: nameSize, font: fontBold, color: navyDark });
  if (cpfText) {
    cy -= cpfSize + gap;
    page.drawText(cpfText, { x: textX, y: cy, size: cpfSize, font: fontBold, color: navyDark });
  }
  cy -= metaSize + gap;
  page.drawText(dt, { x: textX, y: cy, size: metaSize, font, color: slate });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const authHeader = req.headers.get("authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Não autorizado" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authErr || !user) return new Response(JSON.stringify({ error: "Token inválido" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const contentType = req.headers.get("content-type") || "";

    // ========= MODE: multipart/form-data — assina o PDF SEM antes subir o original ao Drive =========
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file") as File | null;
      const password = String(form.get("password") || "");
      const fileName = String(form.get("fileName") || (file?.name ?? "documento.pdf"));
      const unitName = String(form.get("unitName") || "").trim();
      const categoryName = String(form.get("categoryName") || "").trim();
      const positionRaw = form.get("position");
      const position = positionRaw ? JSON.parse(String(positionRaw)) : null;
      if (!file || !password) {
        return new Response(JSON.stringify({ error: "Arquivo e senha são obrigatórios" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      let certRow: any, pfxBytes: Uint8Array;
      try { ({ certRow, pfxBytes } = await loadCertForUser(supabase, user.id, password)); }
      catch (e: any) {
        return new Response(JSON.stringify({ error: e?.message || "Erro" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const pdfBytes = new Uint8Array(await file.arrayBuffer());
      const hashOriginal = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", pdfBytes)))
        .map((b) => b.toString(16).padStart(2, "0")).join("");

      // Assina em memória usando o mesmo bloco existente abaixo (replicado de forma mínima)
      const pdfDoc = await PDFDocument.load(pdfBytes);
      if (position && typeof position.page === "number") {
        try {
          await drawSignatureStamp(pdfDoc, position, certRow, user);
        } catch (e) { console.error("draw stamp failed:", e); }
      }
      pdflibAddPlaceholder({
        pdfDoc, reason: "Assinatura digital ICP-Brasil",
        name: certRow.subject_cn || user.email || "Assinante",
        location: "Brasil", contactInfo: user.email || "", signatureLength: 8192,
      });
      const pdfWithPlaceholder = await pdfDoc.save();
      const signer = new P12Signer(pfxBytes, { passphrase: password });
      const signedPdfBuf: Uint8Array = await new SignPdf().sign(pdfWithPlaceholder as any, signer);
      const hashSigned = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", signedPdfBuf)))
        .map((b) => b.toString(16).padStart(2, "0")).join("");

      const signedName = fileName.replace(/\.pdf$/i, "") + "_assinado.pdf";
      const { driveFileId, driveLink } = await uploadSignedToDrive(supabase, signedName, signedPdfBuf, unitName, categoryName, true);
      const signTimestamp = new Date().toISOString();
      const certInfo = {
        provider: "Servidor local (PAdES)", cert_type: "A1", standard: "ICP-Brasil", pades: true,
        subject_cn: certRow.subject_cn, cpf: certRow.cpf, issuer: certRow.issuer,
        fingerprint_sha256: certRow.fingerprint_sha256, signer_email: user.email,
      };

      return new Response(JSON.stringify({
        signed: true, signedName, driveFileId, driveLink,
        filePath: `drive://${driveFileId}`, fileSize: signedPdfBuf.byteLength,
        fileHashOriginal: hashOriginal, fileHashSigned: hashSigned,
        signTimestamp, certInfo, subjectCn: certRow.subject_cn,
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ========= MODE: JSON — assina documento já existente (fluxo legado) =========
    const { documentId, filePath, fileName, password, reason, position } = await req.json();
    if (!documentId || !filePath || !fileName || !password) {
      return new Response(JSON.stringify({ error: "Dados incompletos (informe senha do certificado)" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Authorization on document
    const { data: doc } = await supabase
      .from("documents").select("id, user_id, file_path, drive_file_id, unit, category")
      .eq("id", documentId).eq("file_path", filePath).maybeSingle();
    const { data: profile } = await supabase.from("profiles").select("role, active").eq("id", user.id).maybeSingle();
    const isAdmin = profile?.role === "Administrador" && profile?.active === true;
    if (!doc || (doc.user_id !== user.id && !isAdmin)) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Load user's encrypted certificate
    const { data: certRow, error: certErr } = await supabase
      .from("user_certificates")
      .select("pfx_encrypted, pfx_iv, pfx_auth_tag, subject_cn, cpf, issuer, valid_to, fingerprint_sha256, signature_logo, signature_logo_size_pct")
      .eq("user_id", user.id).maybeSingle();
    if (certErr || !certRow) {
      return new Response(JSON.stringify({ error: "Você ainda não cadastrou seu certificado A1. Vá em Configurações → Meu Certificado." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (certRow.valid_to && new Date(certRow.valid_to) < new Date()) {
      return new Response(JSON.stringify({ error: "Certificado expirado. Cadastre um novo .pfx." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Decrypt .pfx
    const ct = fromPgHex(certRow.pfx_encrypted);
    const iv = fromPgHex(certRow.pfx_iv);
    const tag = fromPgHex(certRow.pfx_auth_tag);
    let pfxBytes: Uint8Array;
    try {
      pfxBytes = await aesGcmDecrypt(ct, iv, tag);
    } catch {
      return new Response(JSON.stringify({ error: "Falha ao descriptografar certificado (chave do servidor inválida)" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate password by attempting to parse with forge
    try {
      const binStr = String.fromCharCode(...pfxBytes);
      const p12Asn1 = forge.asn1.fromDer(binStr);
      forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, password);
    } catch {
      return new Response(JSON.stringify({ error: "Senha do certificado incorreta" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Download PDF
    let pdfBytes: Uint8Array;
    if (filePath.startsWith("drive://")) {
      const driveId = doc.drive_file_id || filePath.replace("drive://", "");
      const cfg = await loadDriveConfig(supabase);
      const token = await getDriveAccessToken(cfg.serviceAccount);
      const r = await fetch(`https://www.googleapis.com/drive/v3/files/${driveId}?alt=media&supportsAllDrives=true`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error(`Erro ao baixar do Drive: ${r.status}`);
      pdfBytes = new Uint8Array(await r.arrayBuffer());
    } else {
      const { data, error } = await supabase.storage.from("documents").download(filePath);
      if (error) throw error;
      pdfBytes = new Uint8Array(await data.arrayBuffer());
    }

    // Hash original
    const hashOriginal = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", pdfBytes)))
      .map((b) => b.toString(16).padStart(2, "0")).join("");

    // Add PAdES placeholder + sign
    const pdfDoc = await PDFDocument.load(pdfBytes);

    // Draw visible signature stamp if position provided
    if (position && typeof position.page === "number") {
      try {
        await drawSignatureStamp(pdfDoc, position, certRow, user);
      } catch (e) {
        console.error("draw stamp failed:", e);
      }
    }

    pdflibAddPlaceholder({
      pdfDoc,
      reason: reason || "Assinatura digital ICP-Brasil",
      name: certRow.subject_cn || user.email || "Assinante",
      location: "Brasil",
      contactInfo: user.email || "",
      signatureLength: 8192,
    });
    const pdfWithPlaceholder = await pdfDoc.save();

    const signer = new P12Signer(pfxBytes, { passphrase: password });
    const signedPdfBuf: Uint8Array = await new SignPdf().sign(pdfWithPlaceholder as any, signer);

    const hashSigned = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", signedPdfBuf)))
      .map((b) => b.toString(16).padStart(2, "0")).join("");

    // Upload signed PDF back (create a new file with _signed suffix to preserve original)
    const signedName = fileName.replace(/\.pdf$/i, "") + "_assinado.pdf";
    let newFilePath = "";
    let newDriveFileId: string | null = null;
    let newDriveLink: string | null = null;

    if (filePath.startsWith("drive://")) {
      const up = await uploadSignedToDrive(supabase, signedName, signedPdfBuf);
      newDriveFileId = up.driveFileId;
      newDriveLink = up.driveLink;
      newFilePath = `drive://${up.driveFileId}`;
    } else {
      newFilePath = `${user.id}/${Date.now()}_${signedName}`;
      const { error: upErr } = await supabase.storage.from("documents").upload(newFilePath, signedPdfBuf, {
        contentType: "application/pdf", upsert: false,
      });
      if (upErr) throw upErr;
    }

    // Remove o PDF original do Drive (mantém apenas o assinado)
    if (filePath.startsWith("drive://")) {
      try {
        const oldDriveId = doc.drive_file_id || filePath.replace("drive://", "");
        if (oldDriveId && oldDriveId !== newDriveFileId) {
          const cfg = await loadDriveConfig(supabase);
          const token = await getDriveAccessToken(cfg.serviceAccount);
          await fetch(`https://www.googleapis.com/drive/v3/files/${oldDriveId}?supportsAllDrives=true`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` },
          });
        }
      } catch (e) { console.warn("falha ao remover original do Drive:", e); }
    } else {
      try { await supabase.storage.from("documents").remove([filePath]); } catch {}
    }

    const signTimestamp = new Date().toISOString();
    const certInfo = {
      provider: "Servidor local (PAdES)",
      cert_type: "A1",
      standard: "ICP-Brasil",
      pades: true,
      subject_cn: certRow.subject_cn,
      cpf: certRow.cpf,
      issuer: certRow.issuer,
      fingerprint_sha256: certRow.fingerprint_sha256,
      signer_email: user.email,
    };

    // Update document with signed version reference
    await supabase.from("documents").update({
      sign_status: "assinado",
      sign_timestamp: signTimestamp,
      sign_certificate_info: certInfo,
      file_hash_original: hashOriginal,
      file_hash_signed: hashSigned,
      file_path: newFilePath,
      file_name: signedName,
      drive_file_id: newDriveFileId,
      drive_link: newDriveLink,
      notes: `PAdES ICP-Brasil A1 | CN: ${certRow.subject_cn} | SHA-256 assinado: ${hashSigned.substring(0, 16)}...`,
    }).eq("id", documentId);

    await supabase.from("audit_logs").insert({
      user_id: user.id,
      user_email: user.email || "",
      action: "Assinatura digital PAdES ICP-Brasil A1 aplicada",
      action_type: "sign",
      target: documentId,
      details: JSON.stringify({
        file_name: signedName,
        standard: "ICP-Brasil",
        pades: true,
        cert_subject_cn: certRow.subject_cn,
        cert_cpf: certRow.cpf,
        cert_fingerprint: certRow.fingerprint_sha256,
        sha256_original: hashOriginal,
        sha256_signed: hashSigned,
        timestamp: signTimestamp,
        legal_basis: "Lei 14.063/2020, MP 2.200-2/2001, Decreto 10.278/2020",
      }),
    });

    return new Response(JSON.stringify({
      signed: true,
      documentId,
      signTimestamp,
      fileHashOriginal: hashOriginal,
      fileHashSigned: hashSigned,
      newFilePath,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e: any) {
    console.error("sign-pdf-a1 error:", e);
    return new Response(JSON.stringify({ error: e?.message || "Erro interno" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
