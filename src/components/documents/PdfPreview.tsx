import { useEffect, useState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { GlobalWorkerOptions, getDocument } from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";

GlobalWorkerOptions.workerSrc = pdfWorker;

interface PdfPreviewProps {
  fileUrl: string;
  title: string;
}

interface RenderedPage {
  pageNumber: number;
  src: string;
}

export function PdfPreview({ fileUrl, title }: PdfPreviewProps) {
  const [pages, setPages] = useState<RenderedPage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    let loadingTask: ReturnType<typeof getDocument> | null = null;
    const generatedUrls: string[] = [];

    const renderPdf = async () => {
      setIsLoading(true);
      setError(null);
      setPages([]);

      try {
        loadingTask = getDocument(fileUrl);
        const pdf = await loadingTask.promise;
        const nextPages: RenderedPage[] = [];

        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
          const page = await pdf.getPage(pageNumber);
          const viewport = page.getViewport({ scale: 1.2 });
          const canvas = document.createElement("canvas");
          const context = canvas.getContext("2d");

          if (!context) {
            throw new Error("Não foi possível preparar a visualização do PDF.");
          }

          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);

          await page.render({ canvasContext: context, viewport }).promise;

          const pageBlob = await new Promise<Blob | null>((resolve) => {
            canvas.toBlob(resolve, "image/png");
          });

          if (!pageBlob) {
            throw new Error("Não foi possível renderizar o PDF.");
          }

          const pageUrl = URL.createObjectURL(pageBlob);
          generatedUrls.push(pageUrl);
          nextPages.push({ pageNumber, src: pageUrl });
        }

        if (isMounted) {
          setPages(nextPages);
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : "Não foi possível abrir o PDF.");
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    void renderPdf();

    return () => {
      isMounted = false;
      generatedUrls.forEach((url) => URL.revokeObjectURL(url));
      loadingTask?.destroy();
    };
  }, [fileUrl]);

  if (isLoading) {
    return (
      <div className="flex h-[70vh] flex-col items-center justify-center gap-3 rounded-lg bg-muted/30 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
        <p>Carregando pré-visualização do PDF...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-[70vh] flex-col items-center justify-center gap-3 rounded-lg bg-muted/30 px-6 text-center text-muted-foreground">
        <AlertCircle className="h-6 w-6" />
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div className="max-h-[70vh] space-y-4 overflow-y-auto rounded-lg bg-muted/30 p-4">
      {pages.map((page) => (
        <img
          key={page.pageNumber}
          src={page.src}
          alt={`${title} - página ${page.pageNumber}`}
          className="w-full rounded-lg border border-border bg-background shadow-sm"
          loading="lazy"
        />
      ))}
    </div>
  );
}