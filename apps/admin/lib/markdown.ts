function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sanitizeUrl(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (/^(https?:|mailto:)/i.test(trimmed)) return trimmed;
  if (trimmed.startsWith("/")) return trimmed;
  return "";
}

function renderInline(value: string) {
  let html = escapeHtml(value);
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, text, url) => {
    const safeUrl = sanitizeUrl(url);
    if (!safeUrl) return text;
    return `<a href="${escapeHtml(safeUrl)}" target="_blank" rel="noreferrer">${text}</a>`;
  });
  return html;
}

function renderBlocks(value: string) {
  const lines = value.split(/\r?\n/);
  const chunks: string[] = [];
  let paragraphLines: string[] = [];
  let inList = false;

  const flushParagraph = () => {
    if (!paragraphLines.length) return;
    const content = paragraphLines.map(renderInline).join("<br />");
    chunks.push(`<p>${content}</p>`);
    paragraphLines = [];
  };

  const closeList = () => {
    if (!inList) return;
    chunks.push("</ul>");
    inList = false;
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      flushParagraph();
      closeList();
      continue;
    }

    const headingMatch = /^(#{1,3})\s+(.*)$/.exec(trimmed);
    if (headingMatch) {
      const level = headingMatch[1].length;
      flushParagraph();
      closeList();
      chunks.push(`<h${level}>${renderInline(headingMatch[2])}</h${level}>`);
      continue;
    }

    const listMatch = /^[-*]\s+(.*)$/.exec(trimmed);
    if (listMatch) {
      flushParagraph();
      if (!inList) {
        chunks.push("<ul>");
        inList = true;
      }
      chunks.push(`<li>${renderInline(listMatch[1])}</li>`);
      continue;
    }

    paragraphLines.push(trimmed);
  }

  flushParagraph();
  closeList();

  return chunks.join("");
}

export function renderMarkdownToHtml(markdown: string) {
  if (!markdown) return "";
  const segments = markdown.split(/```/);
  return segments
    .map((segment, index) => {
      if (index % 2 === 1) {
        return `<pre><code>${escapeHtml(segment)}</code></pre>`;
      }
      return renderBlocks(segment);
    })
    .join("");
}
