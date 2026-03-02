/**
 * Fixed Assets Service Unit Tests
 * Tests pure mathematical functions — no database required.
 */

import { describe, it, expect } from 'vitest';
import {
  calculateMonthlyDepreciation,
  generateDepreciationSchedule,
} from '../assets.service';

describe('Fixed Assets — Depreciation Calculations', () => {

  // ─── Straight-Line ────────────────────────────────────────────

  describe('Straight-Line (קו ישר)', () => {
    it('monthly amount = (cost − salvage) / (years × 12)', () => {
      const monthly = calculateMonthlyDepreciation({
        purchasePrice:          120_000,
        salvageValue:           0,
        usefulLifeYears:        10,
        depreciationMethod:     'STRAIGHT_LINE',
        accumulatedDepreciation: 0,
      });
      // (120,000 − 0) / (10 × 12) = 1,000 ₪/month
      expect(monthly).toBeCloseTo(1_000, 2);
    });

    it('residual value is subtracted from depreciable base', () => {
      const monthly = calculateMonthlyDepreciation({
        purchasePrice:          120_000,
        salvageValue:           12_000,
        usefulLifeYears:        10,
        depreciationMethod:     'STRAIGHT_LINE',
        accumulatedDepreciation: 0,
      });
      // (120,000 − 12,000) / 120 = 900 ₪/month
      expect(monthly).toBeCloseTo(900, 2);
    });

    it('returns 0 when fully depreciated (book value = salvage)', () => {
      const monthly = calculateMonthlyDepreciation({
        purchasePrice:          50_000,
        salvageValue:           5_000,
        usefulLifeYears:        5,
        depreciationMethod:     'STRAIGHT_LINE',
        accumulatedDepreciation: 45_000, // fully depreciated
      });
      expect(monthly).toBe(0);
    });

    it('last period does not depreciate below salvage value', () => {
      // Near fully depreciated — only 300 left to depreciate but monthly would be 1,000
      const monthly = calculateMonthlyDepreciation({
        purchasePrice:          120_000,
        salvageValue:           0,
        usefulLifeYears:        10,
        depreciationMethod:     'STRAIGHT_LINE',
        accumulatedDepreciation: 119_700, // only 300 left
      });
      expect(monthly).toBeCloseTo(300, 2); // capped at remaining
    });
  });

  // ─── Declining Balance ────────────────────────────────────────

  describe('Declining Balance (יתרה פוחתת)', () => {
    it('first month = book_value × (2 / years) / 12', () => {
      const monthly = calculateMonthlyDepreciation({
        purchasePrice:          100_000,
        salvageValue:           0,
        usefulLifeYears:        5,
        depreciationMethod:     'DECLINING_BALANCE',
        accumulatedDepreciation: 0,
      });
      // rate = 2/5 = 40% per year → 40%/12 per month
      // 100,000 × 0.40 / 12 = 3,333.33
      expect(monthly).toBeCloseTo(3_333.33, 0);
    });

    it('amount decreases each period (declining balance)', () => {
      const params = {
        purchasePrice:      100_000,
        salvageValue:       0,
        usefulLifeYears:    5,
        depreciationMethod: 'DECLINING_BALANCE' as const,
      };

      const month1 = calculateMonthlyDepreciation({ ...params, accumulatedDepreciation: 0 });
      const month2 = calculateMonthlyDepreciation({ ...params, accumulatedDepreciation: month1 });
      const month3 = calculateMonthlyDepreciation({ ...params, accumulatedDepreciation: month1 + month2 });

      expect(month2).toBeLessThan(month1);
      expect(month3).toBeLessThan(month2);
    });

    it('returns 0 when book value ≤ salvage', () => {
      const monthly = calculateMonthlyDepreciation({
        purchasePrice:          50_000,
        salvageValue:           10_000,
        usefulLifeYears:        5,
        depreciationMethod:     'DECLINING_BALANCE',
        accumulatedDepreciation: 40_000, // book value = 10,000 = salvage
      });
      expect(monthly).toBe(0);
    });
  });

  // ─── Schedule Generation ──────────────────────────────────────

  describe('generateDepreciationSchedule', () => {
    it('straight-line: total depreciation = cost − salvage', () => {
      const schedule = generateDepreciationSchedule({
        purchasePrice:     60_000,
        salvageValue:      6_000,
        usefulLifeYears:   5,
        depreciationMethod: 'STRAIGHT_LINE',
        purchaseDate:      new Date('2026-01-01'),
      });

      const total = schedule.reduce((s, p) => s + p.amount, 0);
      expect(total).toBeCloseTo(60_000 - 6_000, 1); // 54,000
    });

    it('straight-line: produces exactly years × 12 periods', () => {
      const schedule = generateDepreciationSchedule({
        purchasePrice:     60_000,
        salvageValue:      0,
        usefulLifeYears:   5,
        depreciationMethod: 'STRAIGHT_LINE',
        purchaseDate:      new Date('2026-01-01'),
      });
      expect(schedule.length).toBe(5 * 12); // 60 periods
    });

    it('final book value equals salvage value', () => {
      const salvage  = 5_000;
      const schedule = generateDepreciationSchedule({
        purchasePrice:     100_000,
        salvageValue:      salvage,
        usefulLifeYears:   10,
        depreciationMethod: 'STRAIGHT_LINE',
        purchaseDate:      new Date('2026-01-01'),
      });

      const last = schedule[schedule.length - 1];
      expect(last.bookValue).toBeCloseTo(salvage, 1);
    });

    it('period format is YYYY-MM', () => {
      const schedule = generateDepreciationSchedule({
        purchasePrice:     10_000,
        salvageValue:      0,
        usefulLifeYears:   1,
        depreciationMethod: 'STRAIGHT_LINE',
        purchaseDate:      new Date('2026-01-01'),
      });

      expect(schedule[0].period).toMatch(/^\d{4}-\d{2}$/);
      expect(schedule[0].period).toBe('2026-02'); // first depreciation month after purchase
    });

    it('accumulated depreciation increases monotonically', () => {
      const schedule = generateDepreciationSchedule({
        purchasePrice:     24_000,
        salvageValue:      0,
        usefulLifeYears:   2,
        depreciationMethod: 'STRAIGHT_LINE',
        purchaseDate:      new Date('2026-01-01'),
      });

      for (let i = 1; i < schedule.length; i++) {
        expect(schedule[i].accumulatedDepreciation)
          .toBeGreaterThan(schedule[i - 1].accumulatedDepreciation);
      }
    });

    it('declining balance: schedule terminates when fully depreciated', () => {
      const schedule = generateDepreciationSchedule({
        purchasePrice:     50_000,
        salvageValue:      0,
        usefulLifeYears:   5,
        depreciationMethod: 'DECLINING_BALANCE',
        purchaseDate:      new Date('2026-01-01'),
      });

      // Should have no period where book value goes negative
      for (const period of schedule) {
        expect(period.bookValue).toBeGreaterThanOrEqual(0);
      }
    });
  });
});
