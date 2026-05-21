import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

export type SignaturePosition = {
  page: number;
  xRatio: number;
  yRatio: number;
  wRatio: number;
  hRatio: number;
};

type Props = {
  file: File;
  signerLabel: string;
  value: SignaturePosition | null;
  onChange: (pos: SignaturePosition) => void;
};

const DEFAULT_W = 0.28;
const DEFAULT_H = 0.08;
const MIN_W = 0.08;
const MIN_H = 0.03;

type DragMode =
  | { kind: "move"; dx: number; dy: number }
  | { kind: "resize"; handle: "nw" | "ne" | "sw" | "se"; startX: number; startY: number; startW: number; startH: number; anchorX: number; anchorY: number };

export function SignaturePlacer({ file, signerLabel, value, onChange }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [pdf, setPdf] = useState<any>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [renderSize, setRenderSize] = useState({ w: 0, h: 0 });
  const dragRef = useRef<DragMode | null>(null);
  const valueRef = useRef<SignaturePosition | null>(value);
  const pageRef = useRef<number>(page);
  useEffect(() => { valueRef.current = value; }, [value]);
  useEffect(() => { pageRef.current = page; }, [page]);

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
      if (!cancelled) setRenderSize({ w: viewport.width, h: viewport.height });
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
    const next = { page: pageRef.current, xRatio: xr, yRatio: yr, wRatio: wr, hRatio: hr };
    valueRef.current = next;
    onChange(next);
  };

  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (!renderSize.w) return;
    e.preventDefault();
    const { x, y } = getRatio(e);
    const w = valueRef.current?.wRatio ?? DEFAULT_W;
    const h = valueRef.current?.hRatio ?? DEFAULT_H;
    const xr = clamp(x - w / 2, 0, 1 - w);
    const yr = clamp(y - h / 2, 0, 1 - h);
    emit(xr, yr, w, h);
    dragRef.current = { kind: "move", dx: x - xr, dy: y - yr };
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
              className="absolute shadow-sm overflow-hidden"
              style={{
                left: `${value!.xRatio * 100}%`,
                top: `${value!.yRatio * 100}%`,
                width: `${value!.wRatio * 100}%`,
                height: `${value!.hRatio * 100}%`,
                cursor: "move",
                background: "linear-gradient(135deg, #e8f0e4 0%, #d4e4d0 50%, #c8dcc4 100%)",
                border: "2.5px solid #2d5a3d",
                outline: "1px solid #2d5a3d",
                outlineOffset: "-5px",
                borderRadius: "6px",
              }}
            >
              <div className="px-2 pt-1.5 text-center text-[7px] font-bold tracking-wide leading-none" style={{ color: "#2d5a3d" }}>
                CERTIFICADO DIGITAL ICP-BRASIL
              </div>
              <div className="mx-2 mt-1 mb-1.5 px-2 py-1.5 leading-tight" style={{ border: "1px solid #2d5a3d", background: "transparent", borderRadius: "4px", height: "calc(100% - 24px)" }}>
                <div className="text-[6.5px] font-bold mb-0.5" style={{ color: "#2d5a3d" }}>DADOS DO TITULAR:</div>
                <div className="text-[6px] truncate" style={{ color: "#2d5a3d" }}>
                  <span className="font-semibold">Nome (CN):</span> <span className="font-bold">{signerLabel}</span>
                </div>
                <div className="text-[6px] truncate" style={{ color: "#2d5a3d" }}>
                  <span className="font-semibold">Organização (O):</span> ICP-Brasil
                </div>
                <div className="text-[6px] truncate" style={{ color: "#2d5a3d" }}>
                  <span className="font-semibold">Data:</span> {new Date().toUTCString().replace("GMT", "(UTC)")}
                </div>
                <div className="text-[5.5px] truncate mt-0.5" style={{ color: "#3a4a3a" }}>hash: a1b2c3d4e5f6…</div>
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
