import { prisma } from '../../config/database';
import { DepreciationMethod } from '@prisma/client';

/**
 * FIXED ASSETS SERVICE
 * Manages asset lifecycle and depreciation calculations (Israeli accounting standards).
 * Supports Straight-Line (קו ישר) and Declining Balance (יתרה פוחתת) methods.
 */

// ─── Depreciation Calculation ─────────────────────────────────────

export function calculateMonthlyDepreciation(params: {
  purchasePrice:     number;
  salvageValue:      number;
  usefulLifeYears:   number;
  depreciationMethod: DepreciationMethod;
  accumulatedDepreciation: number;
}): number {
  const { purchasePrice, salvageValue, usefulLifeYears, depreciationMethod, accumulatedDepreciation } = params;
  const depreciableBase = purchasePrice - salvageValue;
  const bookValue       = purchasePrice - accumulatedDepreciation;

  // Asset fully depreciated
  if (bookValue <= salvageValue) return 0;

  if (depreciationMethod === 'STRAIGHT_LINE') {
    // Monthly = (Cost - Salvage) / (Years × 12)
    const monthly = depreciableBase / (usefulLifeYears * 12);
    // Don't depreciate below salvage value
    return Math.min(monthly, bookValue - salvageValue);
  } else {
    // Declining Balance: double the straight-line rate
    const annualRate = (1 / usefulLifeYears) * 2;
    const monthly    = bookValue * annualRate / 12;
    return Math.min(monthly, bookValue - salvageValue);
  }
}

// ─── Generate Full Depreciation Schedule ──────────────────────────

export function generateDepreciationSchedule(params: {
  purchasePrice:     number;
  salvageValue:      number;
  usefulLifeYears:   number;
  depreciationMethod: DepreciationMethod;
  purchaseDate:      Date;
}) {
  const { purchasePrice, salvageValue, usefulLifeYears, depreciationMethod, purchaseDate } = params;

  const schedule: Array<{
    period:                  string;
    amount:                  number;
    accumulatedDepreciation: number;
    bookValue:               number;
  }> = [];

  let accumulated = 0;
  const totalMonths = usefulLifeYears * 12;
  const startYear   = purchaseDate.getFullYear();
  const startMonth  = purchaseDate.getMonth(); // 0-indexed

  for (let i = 0; i < totalMonths; i++) {
    const bookValue = purchasePrice - accumulated;
    if (bookValue <= salvageValue) break;

    const monthly = calculateMonthlyDepreciation({
      purchasePrice,
      salvageValue,
      usefulLifeYears,
      depreciationMethod,
      accumulatedDepreciation: accumulated,
    });

    if (monthly <= 0) break;

    accumulated += monthly;

    const date   = new Date(startYear, startMonth + i + 1, 1);
    const period = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

    schedule.push({
      period,
      amount:                  Math.round(monthly * 100) / 100,
      accumulatedDepreciation: Math.round(accumulated * 100) / 100,
      bookValue:               Math.round((purchasePrice - accumulated) * 100) / 100,
    });
  }

  return schedule;
}

// ─── Get Accumulated Depreciation for Asset ───────────────────────

export async function getAccumulatedDepreciation(assetId: string): Promise<number> {
  const result = await prisma.assetDepreciation.aggregate({
    where:  { assetId },
    _sum:   { amount: true },
  });
  return Number(result._sum.amount ?? 0);
}

// ─── Post Monthly Depreciation ────────────────────────────────────

export async function postMonthlyDepreciation(
  assetId:  string,
  tenantId: string,
  period:   string, // "2026-03"
  createdBy: string
) {
  // Validate period format
  if (!/^\d{4}-\d{2}$/.test(period)) throw new Error('Period must be YYYY-MM');

  const asset = await prisma.fixedAsset.findUnique({ where: { id: assetId } });
  if (!asset || asset.tenantId !== tenantId) throw new Error('Asset not found');
  if (asset.status !== 'ACTIVE') throw new Error('Asset is not active');

  // Check if already posted for this period
  const existing = await prisma.assetDepreciation.findUnique({
    where: { assetId_period: { assetId, period } },
  });
  if (existing) throw new Error(`Depreciation for ${period} already posted`);

  const accumulated = await getAccumulatedDepreciation(assetId);
  const bookValue   = Number(asset.purchasePrice) - accumulated;

  if (bookValue <= Number(asset.salvageValue)) {
    // Fully depreciated — mark asset
    await prisma.fixedAsset.update({
      where: { id: assetId },
      data:  { status: 'DISPOSED' }, // or add FULLY_DEPRECIATED status
    });
    throw new Error('Asset is fully depreciated');
  }

  const monthly = calculateMonthlyDepreciation({
    purchasePrice:          Number(asset.purchasePrice),
    salvageValue:           Number(asset.salvageValue),
    usefulLifeYears:        asset.usefulLifeYears,
    depreciationMethod:     asset.depreciationMethod,
    accumulatedDepreciation: accumulated,
  });

  if (monthly <= 0) throw new Error('No depreciation to post');

  const bookValueAfter = bookValue - monthly;

  // Try to post GL entry if accounts are configured
  let journalTransactionId: string | undefined;
  if (asset.depreciationExpenseAccountId && asset.accumulatedDepreciationAccountId) {
    try {
      const [expenseAcc, accumAcc] = await Promise.all([
        prisma.account.findUnique({ where: { id: asset.depreciationExpenseAccountId } }),
        prisma.account.findUnique({ where: { id: asset.accumulatedDepreciationAccountId } }),
      ]);

      if (expenseAcc && accumAcc) {
        const tx = await prisma.transaction.create({
          data: {
            tenantId,
            date:        new Date(),
            reference:   `DEP-${asset.code}-${period}`,
            description: `פחת חודשי — ${asset.name} (${period})`,
            sourceType:  'DEPRECIATION',
            sourceId:    assetId,
            totalAmount: monthly,
            status:      'POSTED',
            postedAt:    new Date(),
            createdBy,
            lines: {
              create: [{
                debitAccountId:  asset.depreciationExpenseAccountId,
                creditAccountId: asset.accumulatedDepreciationAccountId,
                amount:          monthly,
                description:     `פחת ${asset.name} ${period}`,
                sortOrder:       0,
              }],
            },
          },
        });
        journalTransactionId = tx.id;
      }
    } catch {
      // GL posting failed — record depreciation without journal link
    }
  }

  const record = await prisma.assetDepreciation.create({
    data: {
      assetId,
      tenantId,
      period,
      amount:              monthly,
      bookValueAfter:      bookValueAfter,
      journalTransactionId,
      postedAt:            new Date(),
    },
  });

  // If fully depreciated after this period, update asset status
  if (bookValueAfter <= Number(asset.salvageValue) + 0.01) {
    await prisma.fixedAsset.update({
      where: { id: assetId },
      data:  { status: 'DISPOSED' },
    });
  }

  return record;
}

// ─── Bulk Post Depreciation for All Active Assets ─────────────────

export async function postAllDepreciationsForPeriod(
  tenantId:  string,
  period:    string,
  createdBy: string
) {
  const assets = await prisma.fixedAsset.findMany({
    where: { tenantId, status: 'ACTIVE' },
  });

  const results: Array<{ assetId: string; assetCode: string; status: string; amount?: number; error?: string }> = [];

  for (const asset of assets) {
    try {
      // Skip assets purchased after this period
      const [year, month]  = period.split('-').map(Number);
      const purchaseYearM  = asset.purchaseDate.getFullYear() * 12 + asset.purchaseDate.getMonth();
      const periodYearM    = year * 12 + (month - 1);
      if (purchaseYearM >= periodYearM) {
        results.push({ assetId: asset.id, assetCode: asset.code, status: 'skipped', error: 'Asset purchased in or after this period' });
        continue;
      }

      const record = await postMonthlyDepreciation(asset.id, tenantId, period, createdBy);
      results.push({ assetId: asset.id, assetCode: asset.code, status: 'posted', amount: Number(record.amount) });
    } catch (err: any) {
      results.push({ assetId: asset.id, assetCode: asset.code, status: 'error', error: err.message });
    }
  }

  return results;
}

// ─── Dispose Asset ────────────────────────────────────────────────

export async function disposeAsset(params: {
  assetId:      string;
  tenantId:     string;
  disposedAt:   Date;
  disposalPrice: number;
  notes?:       string;
  createdBy:    string;
}) {
  const { assetId, tenantId, disposedAt, disposalPrice, notes, createdBy } = params;

  const asset = await prisma.fixedAsset.findUnique({ where: { id: assetId } });
  if (!asset || asset.tenantId !== tenantId) throw new Error('Asset not found');
  if (asset.status === 'DISPOSED') throw new Error('Asset already disposed');

  const accumulated = await getAccumulatedDepreciation(assetId);
  const bookValue   = Number(asset.purchasePrice) - accumulated;
  const gainLoss    = disposalPrice - bookValue;

  // GL Entry for disposal:
  // DR: Accumulated Depreciation (2900) = accumulated
  // DR/CR: Bank (1200) = disposalPrice
  // DR/CR: Gain/Loss on disposal (5xxx/6xxx) = gainLoss
  // CR: Fixed Asset (2100) = purchasePrice

  const updated = await prisma.fixedAsset.update({
    where: { id: assetId },
    data: {
      status:       'DISPOSED',
      disposedAt,
      disposalPrice,
      notes:        notes ?? asset.notes,
    },
  });

  return { ...updated, bookValueAtDisposal: bookValue, gainLoss, accumulated };
}
