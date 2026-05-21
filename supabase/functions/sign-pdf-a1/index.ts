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

async function loadDriveConfig(supabase: any) {
  const { data: cfgFile, error } = await supabase.storage.from("settings").download("google-drive-config.json");
  if (error || !cfgFile) throw new Error("Google Drive não configurado");
  return JSON.parse(await cfgFile.text());
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const authHeader = req.headers.get("authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Não autorizado" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authErr || !user) return new Response(JSON.stringify({ error: "Token inválido" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { documentId, filePath, fileName, password, reason, position } = await req.json();
    if (!documentId || !filePath || !fileName || !password) {
      return new Response(JSON.stringify({ error: "Dados incompletos (informe senha do certificado)" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Authorization on document
    const { data: doc } = await supabase
      .from("documents").select("id, user_id, file_path, drive_file_id")
      .eq("id", documentId).eq("file_path", filePath).maybeSingle();
    const { data: profile } = await supabase.from("profiles").select("role, active").eq("id", user.id).maybeSingle();
    const isAdmin = profile?.role === "Administrador" && profile?.active === true;
    if (!doc || (doc.user_id !== user.id && !isAdmin)) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Load user's encrypted certificate
    const { data: certRow, error: certErr } = await supabase
      .from("user_certificates")
      .select("pfx_encrypted, pfx_iv, pfx_auth_tag, subject_cn, cpf, issuer, valid_to, fingerprint_sha256")
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
        const pages = pdfDoc.getPages();
        const pageIdx = Math.max(0, Math.min(pages.length - 1, position.page - 1));
        const page = pages[pageIdx];
        const { width: pw, height: ph } = page.getSize();
        const x = (position.xRatio ?? 0) * pw;
        const wBox = (position.wRatio ?? 0.28) * pw;
        const hBox = (position.hRatio ?? 0.08) * ph;
        // PDF coords: origin bottom-left. Position.y is from top of page.
        const yTop = (position.yRatio ?? 0) * ph;
        const y = ph - yTop - hBox;

        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
        page.drawRectangle({
          x, y, width: wBox, height: hBox,
          borderColor: rgb(0.05, 0.25, 0.55),
          borderWidth: 1,
          color: rgb(0.95, 0.97, 1),
          opacity: 0.95,
        });
        const cn = certRow.subject_cn || user.email || "Assinante";
        const cpf = certRow.cpf ? `CPF: ${certRow.cpf}` : "";
        const dt = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
        const pad = 4;
        let cy = y + hBox - 11;
        page.drawText("Assinado digitalmente por:", { x: x + pad, y: cy, size: 7, font, color: rgb(0.2, 0.2, 0.2) });
        cy -= 10;
        page.drawText(cn.slice(0, 45), { x: x + pad, y: cy, size: 8, font: fontBold, color: rgb(0.05, 0.15, 0.4) });
        if (cpf) { cy -= 9; page.drawText(cpf, { x: x + pad, y: cy, size: 7, font, color: rgb(0.2, 0.2, 0.2) }); }
        cy -= 9; page.drawText(`Data: ${dt}`, { x: x + pad, y: cy, size: 6.5, font, color: rgb(0.3, 0.3, 0.3) });
        cy -= 8; page.drawText("ICP-Brasil A1 (PAdES)", { x: x + pad, y: cy, size: 6.5, font: fontBold, color: rgb(0.05, 0.25, 0.55) });
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
    const signedPdfBuf: Uint8Array = await signpdf.sign(pdfWithPlaceholder, signer);

    const hashSigned = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", signedPdfBuf)))
      .map((b) => b.toString(16).padStart(2, "0")).join("");

    // Upload signed PDF back (create a new file with _signed suffix to preserve original)
    const signedName = fileName.replace(/\.pdf$/i, "") + "_assinado.pdf";
    let newFilePath = "";
    let newDriveFileId: string | null = null;
    let newDriveLink: string | null = null;

    if (filePath.startsWith("drive://")) {
      const cfg = await loadDriveConfig(supabase);
      const token = await getDriveAccessToken(cfg.serviceAccount);
      const metadata: any = { name: signedName };
      if (cfg.folderId) metadata.parents = [cfg.folderId];
      const boundary = "----axisdocs" + Math.random().toString(36).slice(2);
      const body = new Blob([
        `--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`,
        signedPdfBuf,
        `\r\n--${boundary}--`,
      ]);
      const upRes = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": `multipart/related; boundary=${boundary}` },
        body,
      });
      if (!upRes.ok) throw new Error(`Falha ao subir assinado no Drive: ${await upRes.text()}`);
      const upJson = await upRes.json();
      newDriveFileId = upJson.id;
      newDriveLink = `https://drive.google.com/file/d/${upJson.id}/view`;
      newFilePath = `drive://${upJson.id}`;
    } else {
      newFilePath = `${user.id}/${Date.now()}_${signedName}`;
      const { error: upErr } = await supabase.storage.from("documents").upload(newFilePath, signedPdfBuf, {
        contentType: "application/pdf", upsert: false,
      });
      if (upErr) throw upErr;
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
