import { createClient } from "https://esm.sh/@supabase/supabase-js@2.100.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const zapSignApiKey = Deno.env.get("ZAPSIGN_API_KEY");

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Validate JWT from request
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Token inválido" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { documentId, filePath, fileName, certType } = await req.json();

    if (!documentId || !filePath || !fileName) {
      return new Response(JSON.stringify({ error: "Dados incompletos" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if ZapSign API key is configured
    if (!zapSignApiKey) {
      console.log("ZapSign API key not configured. Document saved as pending.");

      // Update document with pending signature status
      await supabase
        .from("documents")
        .update({
          sign_status: "pendente",
          notes: `Certificado: ${certType} | Aguardando configuração da API ZapSign`,
        })
        .eq("id", documentId);

      return new Response(
        JSON.stringify({
          signed: false,
          message: "API ZapSign não configurada. Documento salvo como pendente.",
          documentId,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // ===== ZapSign Integration =====
    // 1. Get signed URL for the file
    const { data: signedUrlData, error: urlError } = await supabase.storage
      .from("documents")
      .createSignedUrl(filePath, 3600);

    if (urlError) throw urlError;

    const fileUrl = signedUrlData.signedUrl;

    // 2. Create document in ZapSign
    const zapSignResponse = await fetch("https://api.zapsign.com.br/api/v1/docs/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${zapSignApiKey}`,
      },
      body: JSON.stringify({
        name: fileName,
        url_pdf: fileUrl,
        lang: "pt-br",
        signers: [
          {
            name: user.email || "Assinante",
            email: user.email,
            auth_mode: certType === "A3" ? "tokenEmail" : "assinaturaTela",
            send_automatic_email: true,
          },
        ],
      }),
    });

    if (!zapSignResponse.ok) {
      const errorBody = await zapSignResponse.text();
      throw new Error(`ZapSign API error [${zapSignResponse.status}]: ${errorBody}`);
    }

    const zapSignData = await zapSignResponse.json();

    // 3. Update document status
    await supabase
      .from("documents")
      .update({
        sign_status: "assinado",
        notes: `Certificado: ${certType} | ZapSign ID: ${zapSignData.token || "N/A"}`,
      })
      .eq("id", documentId);

    return new Response(
      JSON.stringify({
        signed: true,
        zapSignToken: zapSignData.token,
        signUrl: zapSignData.signers?.[0]?.sign_url,
        documentId,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: unknown) {
    console.error("Error in sign-document:", error);
    const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
