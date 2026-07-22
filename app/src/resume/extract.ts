import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

/**
 * PDF → plain text, in the browser/webview. Runs locally: the resume never
 * leaves the machine except as part of the interview context the user's own
 * BYOK provider call carries.
 */

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export async function extractPdfText(data: ArrayBuffer): Promise<string> {
  const task = pdfjs.getDocument({ data: new Uint8Array(data) });
  const doc = await task.promise;
  const pages: string[] = [];

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();

    // pdf.js emits positioned fragments, not lines. Rebuild lines by Y so
    // section headings and bullets survive — an LLM parses "PROJECTS\n- X"
    // far more reliably than a soup of fragments.
    const rows = new Map<number, { x: number; s: string }[]>();
    for (const item of content.items) {
      if (!("str" in item) || !item.str.trim()) continue;
      const [, , , , x, y] = item.transform as number[];
      const key = Math.round(y);
      const row = rows.get(key) ?? [];
      row.push({ x, s: item.str });
      rows.set(key, row);
    }

    const lines = [...rows.entries()]
      .sort((a, b) => b[0] - a[0]) // top of page down
      .map(([, frags]) =>
        frags
          .sort((a, b) => a.x - b.x)
          .map((f) => f.s)
          .join(" ")
          .replace(/\s+/g, " ")
          .trim(),
      )
      .filter(Boolean);

    pages.push(lines.join("\n"));
  }

  await task.destroy();
  return pages.join("\n\n");
}
