import { createClient } from "https://esm.sh/@supabase/supabase-js@2.100.0";
import forge from "npm:node-forge@1.3.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function getEncKey(): Uint8Array {
  const raw = Deno.env.get("CERT_ENCRYPTION_KEY") || "";
  let bytes: Uint8Array;
  // accept base64 (44 chars) or hex (64 chars) or 32 raw chars
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
  if (bytes.length < 32) {
    // pad/hash to 32 bytes via SHA-256
    return new Uint8Array(32);
  }
  return bytes.slice(0, 32);
}

async function aesGcmEncrypt(plain: Uint8Array): Promise<{ ct: Uint8Array; iv: Uint8Array; tag: Uint8Array }> {
  const key = await crypto.subtle.importKey("raw", getEncKey(), { name: "AES-GCM" }, false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ctWithTag = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plain));
  const ct = ctWithTag.slice(0, ctWithTag.length - 16);
  const tag = ctWithTag.slice(ctWithTag.length - 16);
  return { ct, iv, tag };
}

function bytesToBase64(b: Uint8Array): string {
  let s = "";
  const chunk = 0x8000;
  for (let i = 0; i < b.length; i += chunk) s += String.fromCharCode(...b.subarray(i, i + chunk));
  return btoa(s);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Token inválido" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { pfxBase64, password } = await req.json();
    if (!pfxBase64 || !password) {
      return new Response(JSON.stringify({ error: "Arquivo e senha são obrigatórios" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse and validate .pfx with password
    let cert: any;
    let pfxBytes: Uint8Array;
    try {
      const bin = atob(pfxBase64);
      pfxBytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
      const p12Asn1 = forge.asn1.fromDer(bin);
      const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, password);
      // Extract first certificate
      const bags = p12.getBags({ bagType: forge.pki.oids.certBag });
      const certBag = bags[forge.pki.oids.certBag]?.[0];
      if (!certBag?.cert) throw new Error("Certificado não encontrado no arquivo");
      cert = certBag.cert;
    } catch (e: any) {
      return new Response(JSON.stringify({ error: "Senha incorreta ou arquivo .pfx inválido" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const subjectCn = cert.subject.getField("CN")?.value || "";
    const issuerCn = cert.issuer.getField("CN")?.value || "";
    const validFrom = cert.validity.notBefore.toISOString();
    const validTo = cert.validity.notAfter.toISOString();

    // Extract CPF from subject (Brazilian ICP-Brasil pattern: ":" separator) — try several fields
    let cpf = "";
    const subjectStr = cert.subject.attributes.map((a: any) => `${a.shortName}=${a.value}`).join(", ");
    const cpfMatch = subjectStr.match(/\b(\d{11})\b/) || subjectStr.match(/:(\d{11})/);
    if (cpfMatch) cpf = cpfMatch[1];

    // Fingerprint SHA-256
    const certDer = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
    const certBuf = Uint8Array.from(certDer, (c) => c.charCodeAt(0));
    const fpBuf = await crypto.subtle.digest("SHA-256", certBuf);
    const fingerprint = Array.from(new Uint8Array(fpBuf)).map((b) => b.toString(16).padStart(2, "0")).join(":");

    // Encrypt .pfx
    const { ct, iv, tag } = await aesGcmEncrypt(pfxBytes);

    // Upsert
    const { error: upErr } = await supabase.from("user_certificates").upsert({
      user_id: user.id,
      pfx_encrypted: `\\x${Array.from(ct).map((b) => b.toString(16).padStart(2, "0")).join("")}`,
      pfx_iv: `\\x${Array.from(iv).map((b) => b.toString(16).padStart(2, "0")).join("")}`,
      pfx_auth_tag: `\\x${Array.from(tag).map((b) => b.toString(16).padStart(2, "0")).join("")}`,
      subject_cn: subjectCn,
      cpf,
      issuer: issuerCn,
      valid_from: validFrom,
      valid_to: validTo,
      fingerprint_sha256: fingerprint,
      uploaded_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });

    if (upErr) throw upErr;

    await supabase.from("audit_logs").insert({
      user_id: user.id,
      user_email: user.email || "",
      action: "Certificado A1 ICP-Brasil cadastrado",
      action_type: "edit",
      target: user.id,
      details: JSON.stringify({ subject_cn: subjectCn, cpf, issuer: issuerCn, valid_to: validTo, fingerprint }),
    });

    return new Response(JSON.stringify({
      ok: true,
      subject_cn: subjectCn,
      cpf,
      issuer: issuerCn,
      valid_from: validFrom,
      valid_to: validTo,
      fingerprint_sha256: fingerprint,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e: any) {
    console.error("upload-certificate error:", e);
    return new Response(JSON.stringify({ error: e?.message || "Erro interno" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
