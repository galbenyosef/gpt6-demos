import React, { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, RotateCw } from "lucide-react";
import {
  getDocument,
  GlobalWorkerOptions,
  TextLayer,
  type PDFDocumentProxy,
  type RenderTask,
} from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
GlobalWorkerOptions.workerSrc = workerUrl;

export default function PdfReader({
  url,
  name,
}: {
  url: string;
  name: string;
}) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null),
    [page, setPage] = useState(1),
    [zoom, setZoom] = useState("fit"),
    [rotation, setRotation] = useState(0);
  const [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [width, setWidth] = useState(800),
    [retry, setRetry] = useState(0);
  const viewport = useRef<HTMLDivElement>(null),
    canvasHost = useRef<HTMLDivElement>(null),
    layer = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = viewport.current!;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.max(180, entry!.contentRect.width)),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    let disposed = false;
    setError("");
    setLoading(true);
    setPdf(null);
    const task = getDocument({
      url,
      cMapUrl: "/api/pdf-assets/cmaps/",
      cMapPacked: true,
      standardFontDataUrl: "/api/pdf-assets/standard_fonts/",
      wasmUrl: "/api/pdf-assets/wasm/",
    });
    task.promise
      .then((doc) => {
        if (!disposed) {
          setPdf(doc);
          setPage(1);
        }
      })
      .catch((e) => {
        if (!disposed) {
          setError(
            e.name === "PasswordException"
              ? "This PDF is password protected. Download it to open with your password."
              : "This PDF could not be opened. Try again or download the original.",
          );
          setLoading(false);
        }
      });
    return () => {
      disposed = true;
      void task.destroy();
    };
  }, [url, retry]);
  useEffect(() => {
    if (!pdf) return;
    let disposed = false,
      render: RenderTask | undefined,
      textLayer: TextLayer | undefined;
    setLoading(true);
    setError("");
    // A fresh canvas prevents a cancelled render from sharing a drawing surface.
    const target = document.createElement("canvas");
    canvasHost.current!.replaceChildren(target);
    target.setAttribute("aria-label", `${name}, page ${page}`);
    target.setAttribute("role", "img");
    const container = layer.current!;
    container.replaceChildren();
    (async () => {
      const documentPage = await pdf.getPage(page);
      if (disposed) return;
      const angle = (documentPage.rotate + rotation) % 360;
      const natural = documentPage.getViewport({ scale: 1, rotation: angle });
      const scale =
        zoom === "fit" ? Math.min(width / natural.width, 1.6) : Number(zoom);
      const visible = documentPage.getViewport({ scale, rotation: angle });
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      target.width = Math.floor(visible.width * ratio);
      target.height = Math.floor(visible.height * ratio);
      target.style.width = `${visible.width}px`;
      target.style.height = `${visible.height}px`;
      container.parentElement!.style.width = `${visible.width}px`;
      container.parentElement!.style.height = `${visible.height}px`;
      container.style.setProperty("--total-scale-factor", String(scale));
      render = documentPage.render({
        canvas: target,
        viewport: visible,
        transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],
      });
      await render.promise;
      if (disposed) return;
      textLayer = new TextLayer({
        textContentSource: documentPage.streamTextContent(),
        container,
        viewport: visible,
      });
      await textLayer.render();
      if (!disposed) setLoading(false);
    })().catch((e) => {
      if (!disposed && e.name !== "RenderingCancelledException") {
        setError(
          "This page could not be rendered. Try another page or download the original.",
        );
        setLoading(false);
      }
    });
    return () => {
      disposed = true;
      render?.cancel();
      textLayer?.cancel();
    };
  }, [pdf, page, zoom, width, rotation]);
  return (
    <div className="pdf-reader">
      <div className="pdf-toolbar">
        <div className="reader-controls">
          <button
            className="icon-button"
            aria-label="Previous page"
            disabled={!pdf || page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            <ChevronLeft size={18} />
          </button>
          <label className="pdf-page-label">
            Page
            <input
              aria-label="PDF page"
              type="number"
              min={1}
              max={pdf?.numPages ?? 1}
              value={page}
              disabled={!pdf}
              onChange={(e) => {
                const next = Number(e.target.value);
                if (
                  Number.isInteger(next) &&
                  next >= 1 &&
                  next <= (pdf?.numPages ?? 1)
                )
                  setPage(next);
              }}
            />
            <span>of {pdf?.numPages ?? "…"}</span>
          </label>
          <button
            className="icon-button"
            aria-label="Next page"
            disabled={!pdf || page >= pdf.numPages}
            onClick={() => setPage((p) => p + 1)}
          >
            <ChevronRight size={18} />
          </button>
        </div>
        <div className="reader-controls">
          <select
            aria-label="PDF zoom"
            value={zoom}
            onChange={(e) => setZoom(e.target.value)}
          >
            <option value="fit">Fit width</option>
            <option value="0.75">75%</option>
            <option value="1">100%</option>
            <option value="1.5">150%</option>
            <option value="2">200%</option>
          </select>
          <button
            className="icon-button"
            aria-label="Rotate page"
            onClick={() => setRotation((r) => (r + 90) % 360)}
            disabled={!pdf}
          >
            <RotateCw size={17} />
          </button>
        </div>
      </div>
      <div
        className="pdf-viewport"
        ref={viewport}
        aria-busy={loading}
        tabIndex={0}
        role="region"
        aria-label="PDF pages"
      >
        {loading && (
          <p className="pdf-status" role="status">
            Rendering page {page}…
          </p>
        )}
        {error && (
          <div className="reader-error" role="alert">
            <p>{error}</p>
            <button onClick={() => setRetry((r) => r + 1)}>Try again</button>
          </div>
        )}
        <div
          className="pdf-page"
          style={{ visibility: loading || error ? "hidden" : "visible" }}
        >
          <div ref={canvasHost} />
          <div ref={layer} className="textLayer" />
        </div>
      </div>
    </div>
  );
}
