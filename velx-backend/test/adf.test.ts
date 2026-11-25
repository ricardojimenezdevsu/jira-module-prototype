// Jira descriptions (Atlassian Document Format) to Markdown for initiative goals.
import { test } from 'bun:test';
import assert from 'node:assert/strict';
import { adfToMarkdown } from '../src/adf.ts';
import type { AdfNode } from '../src/types.ts';

const doc = (...content: AdfNode[]): AdfNode => ({ type: 'doc', content });
const text = (t: string, ...marks: string[]): AdfNode => ({ type: 'text', text: t, marks: marks.map((type) => ({ type })) });
const p = (...content: AdfNode[]): AdfNode => ({ type: 'paragraph', content });
const li = (...content: AdfNode[]): AdfNode => ({ type: 'listItem', content });

test('no description gives an empty goal', () => {
  assert.equal(adfToMarkdown(null), '');
  assert.equal(adfToMarkdown(doc()), '');
});

test('headings, paragraphs and marks', () => {
  const md = adfToMarkdown(
    doc(
      { type: 'heading', attrs: { level: 2 }, content: [text('Why')] },
      p(text('Make it '), text('fast', 'strong'), text(' and '), text('safe', 'em'), text(' with '), text('cache()', 'code', 'strong'))
    )
  );
  assert.equal(md, '## Why\n\nMake it **fast** and _safe_ with `cache()`');
});

test('nested lists and ordered lists', () => {
  const md = adfToMarkdown(
    doc(
      { type: 'bulletList', content: [li(p(text('One')), { type: 'bulletList', content: [li(p(text('One a')))] }), li(p(text('Two')))] },
      { type: 'orderedList', attrs: { order: 3 }, content: [li(p(text('Third'))), li(p(text('Fourth')))] }
    )
  );
  assert.equal(md, '- One\n\n  - One a\n- Two\n\n3. Third\n4. Fourth');
});

test('code blocks, links, quotes and rules', () => {
  const md = adfToMarkdown(
    doc(
      { type: 'codeBlock', attrs: { language: 'ts' }, content: [{ type: 'text', text: 'const a = 1;' }] },
      p({ type: 'text', text: 'docs', marks: [{ type: 'link', attrs: { href: 'https://example.com' } }] }),
      { type: 'blockquote', content: [p(text('Quoted'))] },
      { type: 'rule' }
    )
  );
  assert.equal(md, '```ts\nconst a = 1;\n```\n\n[docs](https://example.com)\n\n> Quoted\n\n---');
});

test('unknown nodes keep their text', () => {
  const md = adfToMarkdown(
    doc({ type: 'table', content: [{ type: 'tableRow', content: [{ type: 'tableCell', content: [p(text('cell'))] }] }] }, p({ type: 'mention', attrs: { text: '@someone' } }))
  );
  assert.equal(md, 'cell\n\n@someone');
});
