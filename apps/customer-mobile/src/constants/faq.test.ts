import { describe, expect, it } from 'vitest';
import { allFaqItems, faqSections } from './faq';

describe('FAQ content', () => {
  it('has sections, each with at least one question, and every question has an answer', () => {
    const sections = faqSections();
    expect(sections.length).toBeGreaterThan(3);
    for (const section of sections) {
      expect(section.title.trim()).not.toBe('');
      expect(section.items.length).toBeGreaterThan(0);
    }
    for (const item of allFaqItems()) {
      expect(item.question.trim().length).toBeGreaterThan(5);
      expect(item.answer.trim().length).toBeGreaterThan(15);
    }
  });

  it('gives every question a different id (they are used as list keys)', () => {
    const ids = allFaqItems().map(item => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('makes no promises about price, speed, free services or places', () => {
    const text = allFaqItems().map(item => item.answer).join('\n');
    expect(text).not.toMatch(/\bfree\b|₹|\bRs\b|guarantee|within \d|minutes? delivery|best in|no\.? ?1/i);
  });

  it('says rentals are coming soon while the rental feature is not open', () => {
    expect(allFaqItems().find(item => item.id === 'what-can-i-do')?.answer).toMatch(/rentals are coming soon/i);
  });
});
