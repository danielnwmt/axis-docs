import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import axisLogo from "@/assets/axis-logo-transparent.png";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

export type SignaturePosition = {
  page: number;
  xRatio: number;
  yRatio: number;
  wRatio: number;
  hRatio: number;
  pdfRect?: { x: number; y: number; width: number; height: number };
  pdfX?: number;
  pdfY?: number;
  pdfW?: number;
  pdfH?: number;
  pdfQuad?: {
    tl: [number, number];
    tr: [number, number];
    br: [number, number];
    bl: [number, number];
  };
};

type Props = {
  file: File;
  signerLabel: string;
  value: SignaturePosition | null;
  onChange: (pos: SignaturePosition) => void;
  logoUrl?: string | null;
  logoSizePct?: number; // largura máx. do logo em % da largura do carimbo (1-50)
};

const DEFAULT_W = 0.28;
const DEFAULT_H = 0.08;
const MIN_W = 0.08;
const MIN_H = 0.03;
const CLICK_OFFSET_CM = 7;
const PDF_POINTS_PER_CM = 72 / 2.54;

type DragMode =
  | { kind: "move"; dx: number; dy: number }
  | { kind: "resize"; handle: "nw" | "ne" | "sw" | "se"; startX: number; startY: number; startW: number; startH: number; anchorX: number; anchorY: number };

export function SignaturePlacer({ file, signerLabel, value, onChange, logoUrl, logoSizePct }: Props) {
  const effectiveLogo = logoUrl || axisLogo;
  const effectiveLogoMaxPct = Math.min(50, Math.max(5, logoSizePct ?? 22));
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [pdf, setPdf] = useState<any>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [renderSize, setRenderSize] = useState({ w: 0, h: 0 });
  const [now, setNow] = useState(() => new Date());
  const dragRef = useRef<DragMode | null>(null);
  const viewportRef = useRef<any>(null);
  const renderSizeRef = useRef({ w: 0, h: 0 });
  const valueRef = useRef<SignaturePosition | null>(value);
  const pageRef = useRef<number>(page);
  useEffect(() => { valueRef.current = value; }, [value]);
  useEffect(() => { pageRef.current = page; }, [page]);
  useEffect(() => { renderSizeRef.current = renderSize; }, [renderSize]);
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

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
    let renderTask: any = null;
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
      renderTask = p.render({ canvasContext: ctx, viewport });
      try { await renderTask.promise; } catch (e: any) { if (e?.name !== "RenderingCancelledException") throw e; }
      if (!cancelled) {
        viewportRef.current = viewport;
        setRenderSize({ w: viewport.width, h: viewport.height });
      }
    })();
    return () => { cancelled = true; try { renderTask?.cancel(); } catch {} };
  }, [pdf, page]);

  const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

  const getRatio = (e: MouseEvent | React.MouseEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return {
      x: clamp((e.clientX - r.left) / r.width, 0, 1),
      y: clamp((e.clientY - r.top) / r.height, 0, 1),
    };
  };

  const emit = (xr: number, yr: number, wr: number, hr: number) => {
    wr = clamp(wr, MIN_W, 1);
    hr = clamp(hr, MIN_H, 1);
    xr = clamp(xr, 0, 1 - wr);
    yr = clamp(yr, 0, 1 - hr);
    const next: SignaturePosition = { page: pageRef.current, xRatio: xr, yRatio: yr, wRatio: wr, hRatio: hr };
    const viewport = viewportRef.current;
    const size = renderSizeRef.current;
    if (viewport?.convertToPdfPoint && size.w && size.h) {
      const tl = viewport.convertToPdfPoint(xr * size.w, yr * size.h) as [number, number];
      const br = viewport.convertToPdfPoint((xr + wr) * size.w, (yr + hr) * size.h) as [number, number];
      const x1 = Math.min(tl[0], br[0]);
      const x2 = Math.max(tl[0], br[0]);
      const y1 = Math.min(tl[1], br[1]);
      const y2 = Math.max(tl[1], br[1]);
      next.pdfRect = { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
      next.pdfX = x1;
      next.pdfY = y1;
      next.pdfW = x2 - x1;
      next.pdfH = y2 - y1;
    }
    valueRef.current = next;
    onChange(next);
  };

  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (!renderSize.w) return;
    e.preventDefault();
    const { x, y } = getRatio(e);
    const w = valueRef.current?.wRatio ?? DEFAULT_W;
    const h = valueRef.current?.hRatio ?? DEFAULT_H;
    const viewportScale = viewportRef.current?.scale || 1;
    const yOffsetRatio = renderSize.h ? (CLICK_OFFSET_CM * PDF_POINTS_PER_CM * viewportScale) / renderSize.h : 0;
    const xr = clamp(x - w / 2, 0, 1 - w);
    const yr = clamp(y + yOffsetRatio, 0, 1 - h);
    emit(xr, yr, w, h);
    dragRef.current = { kind: "move", dx: w / 2, dy: -yOffsetRatio };
    attachWindow();
  };

  const handleBoxMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!valueRef.current) return;
    const { x, y } = getRatio(e);
    dragRef.current = { kind: "move", dx: x - valueRef.current.xRatio, dy: y - valueRef.current.yRatio };
    attachWindow();
  };

  const handleResizeMouseDown = (handle: "nw" | "ne" | "sw" | "se") => (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const v = valueRef.current;
    if (!v) return;
    const { x, y } = getRatio(e);
    const anchorX = handle === "nw" || handle === "sw" ? v.xRatio + v.wRatio : v.xRatio;
    const anchorY = handle === "nw" || handle === "ne" ? v.yRatio + v.hRatio : v.yRatio;
    dragRef.current = { kind: "resize", handle, startX: x, startY: y, startW: v.wRatio, startH: v.hRatio, anchorX, anchorY };
    attachWindow();
  };

  const attachWindow = () => {
    const move = (ev: MouseEvent) => {
      const d = dragRef.current;
      const v = valueRef.current;
      if (!d || !v) return;
      const { x, y } = getRatio(ev);
      if (d.kind === "move") {
        emit(x - d.dx, y - d.dy, v.wRatio, v.hRatio);
      } else {
        const newW = Math.abs(x - d.anchorX);
        const newH = Math.abs(y - d.anchorY);
        const newX = Math.min(x, d.anchorX);
        const newY = Math.min(y, d.anchorY);
        emit(newX, newY, newW, newH);
      }
    };
    const up = () => {
      dragRef.current = null;
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  const totalPages = pdf?.numPages || 0;
  const showBox = value && value.page === page;

  const handleStyle = "absolute w-3 h-3 bg-primary border-2 border-background rounded-sm";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs text-muted-foreground">
          Clique no PDF para posicionar. Arraste para mover. Use os cantos para redimensionar.
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-xs font-medium tabular-nums">{page} / {totalPages || "—"}</span>
          <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div ref={containerRef} className="relative border border-border rounded-lg overflow-auto bg-muted/30 max-h-[75vh] flex justify-center">
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
              className="absolute overflow-hidden flex"
              style={{
                left: `${value!.xRatio * 100}%`,
                top: `${value!.yRatio * 100}%`,
                width: `${value!.wRatio * 100}%`,
                height: `${value!.hRatio * 100}%`,
                cursor: "move",
                background: "#ffffff",
                border: "1px solid #1e3a5f",
                borderRadius: "3px",
                boxShadow: "0 1px 3px rgba(15,27,61,0.12)",
              }}
            >
              <div style={{ width: "5px", background: "#1e3a5f", flexShrink: 0 }} />
              <div className="flex-1 min-w-0 px-2 py-1.5 flex items-center gap-2 leading-tight">
                <img src={effectiveLogo} alt="" className="h-full max-h-[90%] w-auto object-contain flex-shrink-0" style={{ maxWidth: `${effectiveLogoMaxPct}%` }} />
                <div className="flex-1 min-w-0 flex flex-col justify-center">
                  <div className="text-[9px] font-bold uppercase mb-0.5" style={{ color: "#1e3a5f", letterSpacing: "0.6px" }}>
                    Assinado digitalmente por
                  </div>
                  {(() => {
                    const idx = signerLabel.lastIndexOf(":");
                    const nameOnly = idx > 0 ? signerLabel.slice(0, idx).trim() : signerLabel;
                    const cpfOnly = idx > 0 ? signerLabel.slice(idx + 1).trim() : "";
                    const formatCPF = (raw: string) => {
                      const digits = raw.replace(/\D/g, "");
                      if (digits.length === 11) return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
                      return raw;
                    };
                    return (
                      <>
                        <div className="text-[13px] font-extrabold truncate" style={{ color: "#0a1430" }}>
                          {nameOnly}
                        </div>
                        {cpfOnly && (
                          <div className="text-[11px] font-bold truncate" style={{ color: "#0a1430" }}>
                            CPF: {formatCPF(cpfOnly)}
                          </div>
                        )}
                      </>
                    );
                  })()}
                  <div className="text-[9px] font-semibold truncate mt-0.5" style={{ color: "#334155" }}>
                    {now.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", hour12: false })}
                  </div>
                </div>
              </div>
              <div onMouseDown={handleResizeMouseDown("nw")} className={handleStyle} style={{ left: -6, top: -6, cursor: "nwse-resize" }} />
              <div onMouseDown={handleResizeMouseDown("ne")} className={handleStyle} style={{ right: -6, top: -6, cursor: "nesw-resize" }} />
              <div onMouseDown={handleResizeMouseDown("sw")} className={handleStyle} style={{ left: -6, bottom: -6, cursor: "nesw-resize" }} />
              <div onMouseDown={handleResizeMouseDown("se")} className={handleStyle} style={{ right: -6, bottom: -6, cursor: "nwse-resize" }} />
            </div>
          )}
        </div>
      </div>

      {value ? (
        <p className="text-xs text-success">✓ Pág. {value.page} · {Math.round(value.wRatio * 100)}% × {Math.round(value.hRatio * 100)}%</p>
      ) : (
        <p className="text-xs text-warning">⚠ Clique no PDF para posicionar a assinatura.</p>
      )}
    </div>
  );
}
