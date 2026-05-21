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

  // Drag state
  const dragOffset = useRef<{ dx: number; dy: number } | null>(null);

  const clampPos = (xRatio: number, yRatio: number, wRatio: number, hRatio: number) => ({
    xRatio: Math.max(0, Math.min(1 - wRatio, xRatio)),
    yRatio: Math.max(0, Math.min(1 - hRatio, yRatio)),
    wRatio, hRatio,
  });

  const setFromMouse = (e: React.MouseEvent | MouseEvent, centered: boolean) => {
    if (!renderSize.w) return;
    const target = canvasRef.current!.getBoundingClientRect();
    const x = (e.clientX - target.left) / renderSize.w;
    const y = (e.clientY - target.top) / renderSize.h;
    const w = value?.wRatio ?? BOX_W;
    const h = value?.hRatio ?? BOX_H;
    const off = dragOffset.current && !centered ? dragOffset.current : { dx: w / 2, dy: h / 2 };
    const c = clampPos(x - off.dx, y - off.dy, w, h);
    onChange({ page, ...c });
  };

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    dragOffset.current = null;
    setFromMouse(e, true);
    const move = (ev: MouseEvent) => setFromMouse(ev, false);
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  const handleBoxMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (!value || !renderSize.w) return;
    const target = canvasRef.current!.getBoundingClientRect();
    const x = (e.clientX - target.left) / renderSize.w;
    const y = (e.clientY - target.top) / renderSize.h;
    dragOffset.current = { dx: x - value.xRatio, dy: y - value.yRatio };
    const move = (ev: MouseEvent) => setFromMouse(ev, false);
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  const totalPages = pdf?.numPages || 0;
  const showBox = value && value.page === page;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs text-muted-foreground">
          Clique e arraste para posicionar a assinatura
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
        <div className="relative select-none" onMouseDown={handleCanvasMouseDown} style={{ cursor: "crosshair" }}>
          <canvas ref={canvasRef} className="block" />
          {showBox && (
            <div
              onMouseDown={handleBoxMouseDown}
              className="absolute border-2 border-primary bg-primary/15 rounded-sm flex flex-col items-start justify-center text-[9px] font-semibold text-primary px-1.5 leading-tight overflow-hidden"
              style={{
                left: `${value!.xRatio * 100}%`,
                top: `${value!.yRatio * 100}%`,
                width: `${value!.wRatio * 100}%`,
                height: `${value!.hRatio * 100}%`,
                cursor: "move",
              }}
            >
              <span className="opacity-70">Assinado por:</span>
              <span className="truncate w-full font-bold">{signerLabel}</span>
            </div>
          )}
        </div>
      </div>

      {value ? (
        <p className="text-xs text-success">
          ✓ Posição definida na página {value.page}. Arraste a caixa para ajustar.
        </p>
      ) : (
        <p className="text-xs text-warning">⚠ Clique no PDF para posicionar a assinatura visível.</p>
      )}
    </div>
  );
}

