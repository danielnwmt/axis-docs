import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

export type SignaturePosition = {
  page: number;        // 1-based
  xRatio: number;      // 0..1 (left)
  yRatio: number;      // 0..1 (top, from top of page)
  wRatio: number;
  hRatio: number;
};

type Props = {
  file: File;
  signerLabel: string;
  value: SignaturePosition | null;
  onChange: (pos: SignaturePosition) => void;
};

const BOX_W = 0.28; // fraction of page width
const BOX_H = 0.08; // fraction of page height

export function SignaturePlacer({ file, signerLabel, value, onChange }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [pdf, setPdf] = useState<any>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [renderSize, setRenderSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const buf = await file.arrayBuffer();
      const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
      if (cancelled) return;
      setPdf(doc);
      setPage(1);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [file]);

  useEffect(() => {
    if (!pdf || !canvasRef.current) return;
    let cancelled = false;
    (async () => {
      const p = await pdf.getPage(page);
      const containerW = containerRef.current?.clientWidth || 800;
      const baseViewport = p.getViewport({ scale: 1 });
      const scale = Math.min(1.6, containerW / baseViewport.width);
      const viewport = p.getViewport({ scale });
      const canvas = canvasRef.current!;
      const ctx = canvas.getContext("2d")!;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      await p.render({ canvasContext: ctx, viewport }).promise;
      if (!cancelled) setRenderSize({ w: viewport.width, h: viewport.height });
    })();
    return () => { cancelled = true; };
  }, [pdf, page]);

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!renderSize.w) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    // center box on click
    let xRatio = x / renderSize.w - BOX_W / 2;
    let yRatio = y / renderSize.h - BOX_H / 2;
    xRatio = Math.max(0, Math.min(1 - BOX_W, xRatio));
    yRatio = Math.max(0, Math.min(1 - BOX_H, yRatio));
    onChange({ page, xRatio, yRatio, wRatio: BOX_W, hRatio: BOX_H });
  };

  const totalPages = pdf?.numPages || 0;
  const showBox = value && value.page === page;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs text-muted-foreground">
          Clique no local onde deseja inserir a assinatura
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-xs font-medium tabular-nums">
            {page} / {totalPages || "—"}
          </span>
          <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div
        ref={containerRef}
        className="relative border border-border rounded-lg overflow-auto bg-muted/30 max-h-[600px] flex justify-center"
      >
        {loading && (
          <div className="flex items-center gap-2 p-10 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Carregando PDF…
          </div>
        )}
        <div className="relative" onClick={handleClick} style={{ cursor: "crosshair" }}>
          <canvas ref={canvasRef} className="block" />
          {showBox && (
            <div
              className="absolute border-2 border-primary bg-primary/15 rounded-sm pointer-events-none flex items-center justify-center text-[10px] font-semibold text-primary px-1 text-center leading-tight"
              style={{
                left: `${value!.xRatio * 100}%`,
                top: `${value!.yRatio * 100}%`,
                width: `${value!.wRatio * 100}%`,
                height: `${value!.hRatio * 100}%`,
              }}
            >
              <span className="truncate">✍ {signerLabel}</span>
            </div>
          )}
        </div>
      </div>

      {value ? (
        <p className="text-xs text-success">
          ✓ Assinatura posicionada na página {value.page}. Clique novamente para mover.
        </p>
      ) : (
        <p className="text-xs text-warning">⚠ Nenhuma posição definida — a assinatura ficará invisível.</p>
      )}
    </div>
  );
}
