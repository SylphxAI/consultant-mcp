import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readText = (path: string) => readFileSync(path, 'utf8');

describe('README discovery surfaces', () => {
  it('keeps pain-first fold content and honest discovery status', () => {
    const readme = readText('README.md');

    expect(readme).toContain('Did anyone else weigh in?');
    expect(readme).toContain('## Why not one big prompt?');
    expect(readme).toContain('irreversible decision');
    expect(readme).toMatch(/Star the repo|Star this repo/);
    expect(readme).toContain('Not listed yet');
    expect(readme).toContain('consultant.review_decision');
    expect(readme).toContain('consultant.challenge_answer');
    expect(readme).toContain('4 typed MCP tools');
    expect(readme).toContain('OpenRouter');
  });
});