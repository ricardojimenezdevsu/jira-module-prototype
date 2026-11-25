/**
 * Converts a Jira description (Atlassian Document Format) to Markdown, which is what Velx
 * expects in an initiative goal. Covers the common nodes; anything else falls back to its
 * plain text so no content is lost.
 */
import type { AdfNode } from './types.ts';

const inline = (nodes: AdfNode[] = []): string => nodes.map(inlineNode).join('');

function inlineNode(node: AdfNode): string {
  switch (node.type) {
    case 'text':
      return applyMarks(node.text ?? '', node.marks ?? []);
    case 'hardBreak':
      return '\n';
    case 'mention':
    case 'emoji':
    case 'status':
      return String(node.attrs?.text ?? node.attrs?.shortName ?? '');
    case 'inlineCard':
      return String(node.attrs?.url ?? '');
    default:
      return inline(node.content);
  }
}

function applyMarks(text: string, marks: NonNullable<AdfNode['marks']>): string {
  // `code` wins over other marks: Markdown does not format inside code spans.
  if (marks.some((m) => m.type === 'code')) return `\`${text}\``;
  let out = text;
  for (const mark of marks) {
    if (mark.type === 'strong') out = `**${out}**`;
    else if (mark.type === 'em') out = `_${out}_`;
    else if (mark.type === 'strike') out = `~~${out}~~`;
    else if (mark.type === 'link' && typeof mark.attrs?.href === 'string') out = `[${out}](${mark.attrs.href})`;
  }
  return out;
}

const indent = (text: string, prefix: string) =>
  text
    .split('\n')
    .map((line) => (line ? prefix + line : line))
    .join('\n');

function list(node: AdfNode, ordered: boolean): string {
  const start = typeof node.attrs?.order === 'number' ? node.attrs.order : 1;
  return (node.content ?? [])
    .map((item, i) => {
      const marker = ordered ? `${start + i}. ` : '- ';
      const body = blocks(item.content);
      const [first = '', ...rest] = body.split('\n');
      return [marker + first, ...rest.map((line) => (line ? ' '.repeat(marker.length) + line : line))].join('\n');
    })
    .join('\n');
}

function block(node: AdfNode): string {
  switch (node.type) {
    case 'paragraph':
      return inline(node.content);
    case 'heading': {
      const level = Math.min(Math.max(Number(node.attrs?.level ?? 1), 1), 6);
      return `${'#'.repeat(level)} ${inline(node.content)}`;
    }
    case 'bulletList':
      return list(node, false);
    case 'orderedList':
      return list(node, true);
    case 'codeBlock': {
      const language = typeof node.attrs?.language === 'string' ? node.attrs.language : '';
      return `\`\`\`${language}\n${(node.content ?? []).map((n) => n.text ?? '').join('')}\n\`\`\``;
    }
    case 'blockquote':
      return indent(blocks(node.content), '> ');
    case 'rule':
      return '---';
    case 'panel':
    case 'expand':
    case 'nestedExpand':
      return blocks(node.content);
    default:
      return node.content ? blocks(node.content) : inlineNode(node);
  }
}

const blocks = (nodes: AdfNode[] = []): string =>
  nodes
    .map(block)
    .filter((text) => text.trim() !== '')
    .join('\n\n');

/** Markdown for an ADF document, or '' when there is none. */
export const adfToMarkdown = (doc: AdfNode | null | undefined): string => (doc ? blocks(doc.content).trim() : '');
