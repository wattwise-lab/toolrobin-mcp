// ToolRobin core copied from src/tools/seo/meta-core.ts; see PROVENANCE.json.
const MAX_TITLE_LENGTH = 120;
const MAX_DESCRIPTION_LENGTH = 320;
const MAX_URL_LENGTH = 2_048;

export interface MetaFields {
  title: string;
  description: string;
  pageUrl: string;
  imageUrl: string;
}

export interface MetaPreviewResult {
  title: string;
  description: string;
  pageUrl: string;
  imageUrl: string;
  domain: string;
  tags: string;
}

function escapeAttribute(value: string) {
  return value.replace(/[&<>"']/gu, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
}

function absoluteHttpUrl(value: string, field: string, required = false) {
  const input = value.trim();
  if (!input && !required) return '';
  const message = field === 'Page URL' ? 'Page URL must be an absolute HTTP or HTTPS URL.' : 'Social image URL must be an absolute HTTP or HTTPS URL.';
  if (!input || input.length > MAX_URL_LENGTH) throw new Error(message);
  let url: URL;
  try { url = new URL(input); }
  catch { throw new Error(message); }
  if ((url.protocol !== 'https:' && url.protocol !== 'http:') || url.username || url.password) throw new Error(message);
  return url.href;
}

export function buildMetaPreview(fields: MetaFields): MetaPreviewResult {
  const title = fields.title.trim();
  const description = fields.description.trim();
  if (!title) throw new Error('Enter a page title.');
  if (title.length > MAX_TITLE_LENGTH) throw new Error('Page title must be 120 characters or fewer.');
  if (!description) throw new Error('Enter a page description.');
  if (description.length > MAX_DESCRIPTION_LENGTH) throw new Error('Page description must be 320 characters or fewer.');

  const pageUrl = absoluteHttpUrl(fields.pageUrl, 'Page URL', true);
  const imageUrl = absoluteHttpUrl(fields.imageUrl, 'Social image URL');
  const safeTitle = escapeAttribute(title);
  const safeDescription = escapeAttribute(description);
  const safePageUrl = escapeAttribute(pageUrl);
  const safeImageUrl = imageUrl ? escapeAttribute(imageUrl) : '';
  const lines = [
    `<title>${safeTitle}</title>`,
    `<meta name="description" content="${safeDescription}">`,
    `<link rel="canonical" href="${safePageUrl}">`,
    '<meta property="og:type" content="website">',
    `<meta property="og:url" content="${safePageUrl}">`,
    `<meta property="og:title" content="${safeTitle}">`,
    `<meta property="og:description" content="${safeDescription}">`,
  ];
  if (safeImageUrl) lines.push(`<meta property="og:image" content="${safeImageUrl}">`);
  lines.push(`<meta name="twitter:card" content="${safeImageUrl ? 'summary_large_image' : 'summary'}">`);
  lines.push(`<meta name="twitter:title" content="${safeTitle}">`);
  lines.push(`<meta name="twitter:description" content="${safeDescription}">`);
  if (safeImageUrl) lines.push(`<meta name="twitter:image" content="${safeImageUrl}">`);

  return { title, description, pageUrl, imageUrl, domain: new URL(pageUrl).host, tags: lines.join('\n') };
}
