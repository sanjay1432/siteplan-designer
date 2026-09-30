export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportProjectJson(projectName: string, data: unknown) {
  const safeName = projectName.trim().replace(/[^a-z0-9-_]+/gi, "-") || "site-plan";
  downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }), `${safeName}.siteplan.json`);
}

function serializeCanvas(svg: SVGSVGElement, multiplier = 1) {
  const rect = svg.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width));
  const height = Math.max(1, Math.round(rect.height));
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(width * multiplier));
  clone.setAttribute("height", String(height * multiplier));
  clone.setAttribute("viewBox", `0 0 ${width} ${height}`);
  clone.style.background = "#f1f5f9";
  return { source: new XMLSerializer().serializeToString(clone), width, height };
}

export function exportCanvasSvg(svg: SVGSVGElement, name: string) {
  const { source } = serializeCanvas(svg);
  const safeName = name.trim().replace(/[^a-z0-9-_]+/gi, "-") || "site-plan";
  downloadBlob(new Blob([source], { type: "image/svg+xml;charset=utf-8" }), `${safeName}.svg`);
}

export function exportCanvasPng(svg: SVGSVGElement, name: string) {
  const { source, width, height } = serializeCanvas(svg, 2);
  const image = new Image();
  image.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = width * 2;
    canvas.height = height * 2;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.fillStyle = "#f1f5f9";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const safeName = name.trim().replace(/[^a-z0-9-_]+/gi, "-") || "site-plan";
    canvas.toBlob(blob => {
      if (blob) downloadBlob(blob, `${safeName}.png`);
    }, "image/png");
  };
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`;
}

export function printCanvasPdf(svg: SVGSVGElement) {
  const popup = window.open("", "_blank");
  if (!popup) return false;
  const { source } = serializeCanvas(svg);
  popup.document.title = "Site plan PDF";
  popup.document.body.style.cssText = "margin:0;display:grid;place-items:center;min-height:100vh;background:white";
  const image = popup.document.createElement("img");
  image.alt = "Site plan";
  image.style.cssText = "width:100%;height:100%;max-width:100vw;max-height:100vh;object-fit:contain";
  image.onload = () => popup.print();
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`;
  popup.document.body.append(image);
  const style = popup.document.createElement("style");
  style.textContent = "@page{size:landscape;margin:10mm}body{print-color-adjust:exact;-webkit-print-color-adjust:exact}@media print{img{width:100%;height:95vh}}";
  popup.document.head.append(style);
  return true;
}
