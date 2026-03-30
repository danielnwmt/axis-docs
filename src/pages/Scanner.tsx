import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Camera, ScanText, Copy, Upload, Check, FileText, Save } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Tesseract from "tesseract.js";
import * as pdfjsLib from "pdfjs-dist";

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;

export default function Scanner() {
  const [preview, setPreview] = useState<string | null>(null);
  const [isPdf, setIsPdf] = useState(false);
  const [text, setText] = useState("");
  const [progress, setProgress] = useState(0);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [docId, setDocId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const [searchParams] = useSearchParams();

  // Auto-load file from documents page
  useEffect(() => {
    const paramDocId = searchParams.get("docId");
    const paramFilePath = searchParams.get("filePath");
    if (paramDocId && paramFilePath) {
      setDocId(paramDocId);
      loadFromStorage(paramFilePath);
    }
  }, []);

  const loadFromStorage = async (filePath: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.storage
        .from("documents")
        .download(filePath);
      if (error) throw error;

      const file = new File([data], searchParams.get("fileName") || "document.pdf", { type: data.type });
      await handleFile(file);
    } catch (err: any) {
      toast({ title: "Erro", description: "Não foi possível carregar o arquivo.", variant: "destructive" });
      setLoading(false);
    }
  };

  const saveOcrResult = async () => {
    if (!docId || !text) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("documents")
        .update({ ocr_status: "processado", ocr_text: text })
        .eq("id", docId);
      if (error) throw error;
      toast({ title: "Salvo!", description: "Texto OCR salvo no documento." });
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleFile = async (file: File) => {
    setText("");
    setProgress(0);

    if (file.type === "application/pdf") {
      setIsPdf(true);
      setPreview(null);
      await processPdf(file);
    } else {
      setIsPdf(false);
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        setPreview(dataUrl);
        runOCR(dataUrl);
      };
      reader.readAsDataURL(file);
    }
  };

  const processPdf = async (file: File) => {
    setLoading(true);
    setProgress(0);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const totalPages = pdf.numPages;
      let allText = "";

      for (let i = 1; i <= totalPages; i++) {
        setProgress(Math.round(((i - 1) / totalPages) * 50));
        const page = await pdf.getPage(i);

        // Try text extraction first
        const content = await page.getTextContent();
        const pageText = content.items.map((item: any) => item.str).join(" ");

        if (pageText.trim().length > 20) {
          allText += `--- Página ${i} ---\n${pageText}\n\n`;
        } else {
          // Fallback: render to canvas and OCR
          const viewport = page.getViewport({ scale: 2 });
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext("2d")!;
          await page.render({ canvasContext: ctx, viewport }).promise;
          const dataUrl = canvas.toDataURL("image/png");

          if (i === 1) setPreview(dataUrl);

          const result = await Tesseract.recognize(dataUrl, "por", {
            logger: (m) => {
              if (m.status === "recognizing text") {
                setProgress(50 + Math.round((m.progress || 0) * (50 / totalPages)));
              }
            },
          });
          allText += `--- Página ${i} ---\n${result.data.text}\n\n`;
        }
      }

      setText(allText.trim());
      toast({ title: "OCR concluído!", description: `${totalPages} página(s) processada(s).` });
    } catch (err: any) {
      toast({ title: "Erro ao processar PDF", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
      setProgress(100);
    }
  };

  const runOCR = async (src: string) => {
    setLoading(true);
    setProgress(0);
    try {
      const result = await Tesseract.recognize(src, "por", {
        logger: (m) => {
          if (m.status === "recognizing text") {
            setProgress(Math.round((m.progress || 0) * 100));
          }
        },
      });
      setText(result.data.text);
      toast({ title: "OCR concluído!", description: "Texto extraído com sucesso." });
    } catch (err: any) {
      toast({ title: "Erro no OCR", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
      setProgress(100);
    }
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    toast({ title: "Copiado!", description: "Texto copiado para a área de transferência." });
    setTimeout(() => setCopied(false), 2000);
  };

  const resetState = () => {
    setPreview(null);
    setIsPdf(false);
    setText("");
    setProgress(0);
  };

  return (
    <AppLayout>
      <h1 className="font-display text-2xl font-bold text-foreground mb-6 flex items-center gap-2">
        <ScanText className="w-6 h-6 text-primary" />
        Scanner OCR
      </h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Arquivo</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div
              onClick={() => fileRef.current?.click()}
              className="border-2 border-dashed border-accent/40 rounded-xl p-8 flex flex-col items-center justify-center gap-3 min-h-[250px] hover:border-accent transition-colors cursor-pointer"
            >
              {preview ? (
                <img src={preview} alt="Preview" className="max-h-[300px] rounded-lg object-contain" />
              ) : isPdf && loading ? (
                <div className="flex flex-col items-center gap-3">
                  <FileText className="w-12 h-12 text-primary" />
                  <p className="text-sm text-muted-foreground">Processando PDF…</p>
                </div>
              ) : (
                <>
                  <div className="w-14 h-14 rounded-full bg-accent/10 flex items-center justify-center">
                    <Camera className="w-7 h-7 text-accent" />
                  </div>
                  <p className="font-semibold text-foreground">Arraste ou clique para selecionar</p>
                  <p className="text-sm text-muted-foreground">PNG, JPG, PDF — ou tire uma foto pelo celular</p>
                </>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,application/pdf"
                capture="environment"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              />
            </div>

            {(preview || isPdf) && !loading && (
              <Button variant="outline" className="w-full gap-2" onClick={resetState}>
                <Upload className="w-4 h-4" /> Novo arquivo
              </Button>
            )}

            {loading && (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Processando OCR… {progress}%</p>
                <Progress value={progress} />
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Texto Extraído</CardTitle>
            <div className="flex gap-2">
              {text && docId && (
                <Button size="sm" className="gap-2" onClick={saveOcrResult} disabled={saving}>
                  <Save className="w-4 h-4" />
                  {saving ? "Salvando..." : "Salvar OCR"}
                </Button>
              )}
              {text && (
                <Button size="sm" variant="outline" className="gap-2" onClick={handleCopy}>
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  {copied ? "Copiado" : "Copiar"}
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <Textarea
              className="min-h-[350px] font-mono text-sm"
              placeholder={loading ? "Aguardando processamento…" : "O texto extraído aparecerá aqui…"}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
