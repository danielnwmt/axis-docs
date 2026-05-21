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

function hexToBytes(hex: string): Uint8Array {
  const h = hex.startsWith("\\x") ? hex.slice(2) : hex;
  return new Uint8Array(h.match(/.{2}/g)!.map((b) => parseInt(b, 16)));
}

function bytesToHex(b: Uint8Array): string {
  return "\\x" + Array.from(b).map((x) => x.toString(16).padStart(2, "0")).join("");
}

async function aesGcmDecrypt(ct: Uint8Array, iv: Uint8Array, tag: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", getEncKey(), { name: "AES-GCM" }, false, ["decrypt"]);
  const combined = new Uint8Array(ct.length + tag.length);
  combined.set(ct, 0);
  combined.set(tag, ct.length);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, combined);
  return new Uint8Array(pt);
}

async function aesGcmEncrypt(plain: Uint8Array): Promise<{ ct: Uint8Array; iv: Uint8Array; tag: Uint8Array }> {
  const key = await crypto.subtle.importKey("raw", getEncKey(), { name: "AES-GCM" }, false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ctWithTag = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plain));
  const ct = ctWithTag.slice(0, ctWithTag.length - 16);
  const tag = ctWithTag.slice(ctWithTag.length - 16);
  return { ct, iv, tag };
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

    const { currentPassword, newPassword } = await req.json();
    if (!currentPassword || !newPassword) {
      return new Response(JSON.stringify({ error: "Senha atual e nova são obrigatórias" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (newPassword.length < 4) {
      return new Response(JSON.stringify({ error: "A nova senha deve ter pelo menos 4 caracteres" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: row, error: selErr } = await supabase
      .from("user_certificates")
      .select("pfx_encrypted, pfx_iv, pfx_auth_tag")
      .eq("user_id", user.id)
      .maybeSingle();
    if (selErr || !row) {
      return new Response(JSON.stringify({ error: "Certificado não encontrado" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Supabase returns bytea as \x... hex string
    const ct = typeof row.pfx_encrypted === "string" ? hexToBytes(row.pfx_encrypted) : new Uint8Array(row.pfx_encrypted);
    const iv = typeof row.pfx_iv === "string" ? hexToBytes(row.pfx_iv) : new Uint8Array(row.pfx_iv);
    const tag = typeof row.pfx_auth_tag === "string" ? hexToBytes(row.pfx_auth_tag) : new Uint8Array(row.pfx_auth_tag);

    const pfxBytes = await aesGcmDecrypt(ct, iv, tag);

    // Parse current pfx with current password
    let p12: any, certObj: any, keyObj: any;
    try {
      const bin = String.fromCharCode(...pfxBytes);
      const p12Asn1 = forge.asn1.fromDer(bin);
      p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, currentPassword);
      const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
      certObj = certBags[forge.pki.oids.certBag]?.[0]?.cert;
      const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
      keyObj = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0]?.key
        || p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag]?.[0]?.key;
      if (!certObj || !keyObj) throw new Error("Cert ou chave não encontrados");
    } catch {
      return new Response(JSON.stringify({ error: "Senha atual incorreta" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Re-encode pkcs12 with new password
    const newP12Asn1 = forge.pkcs12.toPkcs12Asn1(keyObj, [certObj], newPassword, {
      algorithm: "3des",
    });
    const newPfxBin = forge.asn1.toDer(newP12Asn1).getBytes();
    const newPfxBytes = Uint8Array.from(newPfxBin, (c) => c.charCodeAt(0));

    const enc = await aesGcmEncrypt(newPfxBytes);

    const { error: upErr } = await supabase.from("user_certificates").update({
      pfx_encrypted: bytesToHex(enc.ct),
      pfx_iv: bytesToHex(enc.iv),
      pfx_auth_tag: bytesToHex(enc.tag),
      updated_at: new Date().toISOString(),
    }).eq("user_id", user.id);

    if (upErr) throw upErr;

    await supabase.from("audit_logs").insert({
      user_id: user.id,
      user_email: user.email || "",
      action: "Senha do certificado A1 alterada",
      action_type: "edit",
      target: user.id,
      details: "Re-encriptação do .pfx com nova senha",
    });

    return new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("change-certificate-password error:", e);
    return new Response(JSON.stringify({ error: e?.message || "Erro interno" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
