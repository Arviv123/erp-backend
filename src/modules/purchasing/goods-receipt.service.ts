import { prisma } from '../../config/database';

// ─── Auto-Numbering ───────────────────────────────────────────────

async function generateGRNumber(tenantId: string): Promise<string> {
  const year  = new Date().getFullYear();
  const count = await prisma.goodsReceipt.count({ where: { tenantId } });
  return `GR-${year}-${String(count + 1).padStart(4, '0')}`;
}

// ─── List Goods Receipts ──────────────────────────────────────────

export async function listGoodsReceipts(
  tenantId: string,
  filters: {
    purchaseOrderId?: string;
    status?:          string;
    from?:            string;
    to?:              string;
  }
) {
  const where: Record<string, unknown> = { tenantId };

  if (filters.purchaseOrderId) where['purchaseOrderId'] = filters.purchaseOrderId;
  if (filters.status)          where['status']          = filters.status;
  if (filters.from || filters.to) {
    where['receivedDate'] = {
      ...(filters.from ? { gte: new Date(filters.from) } : {}),
      ...(filters.to   ? { lte: new Date(filters.to)   } : {}),
    };
  }

  return prisma.goodsReceipt.findMany({
    where: where as any,
    include: {
      purchaseOrder: {
        select: { number: true, vendor: { select: { name: true } } },
      },
      lines: true,
    },
    orderBy: { receivedDate: 'desc' },
  });
}

// ─── Get Single Goods Receipt ─────────────────────────────────────

export async function getGoodsReceipt(id: string, tenantId: string) {
  const gr = await prisma.goodsReceipt.findFirst({
    where: { id, tenantId },
    include: {
      lines: true,
      purchaseOrder: {
        include: {
          vendor: true,
          lines:  true,
        },
      },
    },
  });

  if (!gr) throw new Error('Goods receipt not found');
  return gr;
}

// ─── Create Goods Receipt ─────────────────────────────────────────

export interface CreateGoodsReceiptInput {
  purchaseOrderId: string;
  receivedDate?:   Date | string;
  warehouseId?:    string;
  notes?:          string;
  lines: Array<{
    productId?:  string;
    description: string;
    orderedQty:  number;
    receivedQty: number;
    unitPrice:   number;
  }>;
}

export async function createGoodsReceipt(
  data:     CreateGoodsReceiptInput,
  tenantId: string,
  userId:   string
) {
  // Verify PO belongs to this tenant and is in a receivable state
  const po = await prisma.purchaseOrder.findFirst({
    where:   { id: data.purchaseOrderId, tenantId },
    include: { lines: true },
  });
  if (!po) throw new Error('Purchase order not found');
  if (po.status === 'CANCELLED') {
    throw new Error('Cannot receive goods against a cancelled purchase order');
  }

  const number       = await generateGRNumber(tenantId);
  const receivedDate = data.receivedDate ? new Date(data.receivedDate) : new Date();

  return prisma.$transaction(async (tx) => {
    // Create the GR record with its lines
    const gr = await tx.goodsReceipt.create({
      data: {
        tenantId,
        purchaseOrderId: data.purchaseOrderId,
        number,
        receivedDate,
        status:      'RECEIVED',
        warehouseId: data.warehouseId ?? null,
        notes:       data.notes       ?? null,
        createdBy:   userId,
        lines: {
          create: data.lines.map((l) => ({
            productId:   l.productId   ?? null,
            description: l.description,
            orderedQty:  l.orderedQty,
            receivedQty: l.receivedQty,
            unitPrice:   l.unitPrice,
          })),
        },
      },
      include: { lines: true },
    });

    // Propagate received quantities back onto the PO lines so that PO status logic is accurate.
    // Match by productId first; fall back to description.
    for (const grLine of data.lines) {
      const poLine = grLine.productId
        ? po.lines.find((l) => l.productId === grLine.productId)
        : po.lines.find((l) => l.description === grLine.description);

      if (poLine && grLine.receivedQty > 0) {
        await tx.purchaseOrderLine.update({
          where: { id: poLine.id },
          data:  { receivedQty: { increment: grLine.receivedQty } },
        });
      }
    }

    // Re-read the PO lines to evaluate the new overall status
    const updatedPOLines = await tx.purchaseOrderLine.findMany({
      where: { poId: data.purchaseOrderId },
    });

    const allReceived = updatedPOLines.every((l) => Number(l.receivedQty) >= Number(l.quantity));
    const anyReceived = updatedPOLines.some((l)  => Number(l.receivedQty) > 0);

    await tx.purchaseOrder.update({
      where: { id: data.purchaseOrderId },
      data:  {
        status: allReceived ? 'RECEIVED'
               : anyReceived ? 'PARTIALLY_RECEIVED'
               : po.status as any,
      },
    });

    // Update stock levels inside the same transaction for lines that have a productId.
    // We require a warehouseId; if none is provided, skip stock updates.
    if (data.warehouseId) {
      for (const grLine of data.lines) {
        if (!grLine.productId || grLine.receivedQty <= 0) continue;

        // Upsert StockLevel — increment quantity for inbound goods
        await tx.stockLevel.upsert({
          where: {
            productId_warehouseId: {
              productId:   grLine.productId,
              warehouseId: data.warehouseId,
            },
          },
          create: {
            tenantId,
            productId:   grLine.productId,
            warehouseId: data.warehouseId,
            quantity:    grLine.receivedQty,
          },
          update: {
            quantity: { increment: grLine.receivedQty },
          },
        });

        // Record the stock movement for the audit trail
        await tx.stockMovement.create({
          data: {
            tenantId,
            productId:   grLine.productId,
            warehouseId: data.warehouseId,
            type:        'IN',
            quantity:    grLine.receivedQty,
            unitCost:    grLine.unitPrice,
            totalCost:   Math.round(grLine.receivedQty * grLine.unitPrice * 100) / 100,
            reference:   number,
            sourceType:  'GR',
            sourceId:    gr.id,
            createdBy:   userId,
          },
        });
      }
    }

    return gr;
  });
}

// ─── Approve / Inspect Goods Receipt (RECEIVED → INSPECTED) ───────

export async function approveGoodsReceipt(id: string, tenantId: string) {
  const gr = await prisma.goodsReceipt.findFirst({ where: { id, tenantId } });
  if (!gr) throw new Error('Goods receipt not found');

  const statusTransitions: Record<string, string> = {
    DRAFT:    'RECEIVED',
    RECEIVED: 'INSPECTED',
  };

  const nextStatus = statusTransitions[gr.status];
  if (!nextStatus) {
    throw new Error(
      `Goods receipt status is '${gr.status}' — no further approval step available`
    );
  }

  return prisma.goodsReceipt.update({
    where: { id },
    data:  { status: nextStatus },
    include: {
      lines: true,
      purchaseOrder: { select: { number: true } },
    },
  });
}

// Keep the legacy name as an alias so the existing route still compiles
export const inspectGoodsReceipt = approveGoodsReceipt;

// ─── Get All GRs for a PO ─────────────────────────────────────────

export async function getGoodsReceiptsForPO(purchaseOrderId: string, tenantId: string) {
  // Verify the PO exists and belongs to this tenant before returning GRs
  const po = await prisma.purchaseOrder.findFirst({
    where: { id: purchaseOrderId, tenantId },
    select: { id: true },
  });
  if (!po) throw new Error('Purchase order not found');

  return prisma.goodsReceipt.findMany({
    where:   { purchaseOrderId, tenantId },
    include: { lines: true },
    orderBy: { receivedDate: 'desc' },
  });
}

// ─── Three-Way Match — PO-centric (used by existing routes) ───────

export interface ThreeWayMatchResult {
  purchaseOrderId: string;
  poNumber:        string;
  poTotal:         number;
  goodsReceipts: Array<{
    id:           string;
    number:       string;
    receivedDate: Date;
    total:        number;
  }>;
  bills: Array<{
    id:         string;
    billNumber: string;
    total:      number;
    status:     string;
  }>;
  match: {
    poVsGR:        'MATCH' | 'PARTIAL' | 'OVER_RECEIVED' | 'NOT_RECEIVED';
    poVsBill:      'MATCH' | 'PARTIAL' | 'OVER_BILLED'   | 'NOT_BILLED';
    grVsBill:      'MATCH' | 'PARTIAL' | 'DISCREPANCY'   | 'PENDING';
    overallStatus: 'OK' | 'WARNING' | 'DISCREPANCY';
    discrepancies: string[];
  };
}

const TOLERANCE = 0.01; // NIS tolerance for floating-point comparisons

function formatNIS(amount: number): string {
  return `₪${amount.toLocaleString('he-IL', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export async function threeWayMatch(
  purchaseOrderId: string,
  tenantId:        string
): Promise<ThreeWayMatchResult> {
  // 1. Fetch PO with all lines and all linked GRs
  const po = await prisma.purchaseOrder.findFirst({
    where:   { id: purchaseOrderId, tenantId },
    include: {
      lines:         true,
      goodsReceipts: { include: { lines: true } },
    },
  });
  if (!po) throw new Error('Purchase order not found');

  // 2. Fetch all Bills linked to this PO
  const bills = await prisma.bill.findMany({
    where: { tenantId, purchaseOrderId },
  });

  // 3. Aggregate totals
  const poTotal = Number(po.total);

  const grTotal = po.goodsReceipts.reduce((grSum, gr) =>
    grSum + gr.lines.reduce(
      (lineSum, line) => lineSum + Number(line.receivedQty) * Number(line.unitPrice),
      0
    ),
    0
  );

  const billTotal = bills.reduce((s, b) => s + Number(b.total), 0);

  // 4. Classify each comparison
  const discrepancies: string[] = [];

  // PO vs GR
  let poVsGR: ThreeWayMatchResult['match']['poVsGR'];
  if (po.goodsReceipts.length === 0) {
    poVsGR = 'NOT_RECEIVED';
    discrepancies.push('לא התקבלה סחורה עבור הזמנת הרכש הזאת');
  } else if (Math.abs(grTotal - poTotal) <= TOLERANCE) {
    poVsGR = 'MATCH';
  } else if (grTotal > poTotal + TOLERANCE) {
    poVsGR = 'OVER_RECEIVED';
    discrepancies.push(
      `סחורה שהתקבלה (${formatNIS(grTotal)}) גדולה מהזמנת הרכש (${formatNIS(poTotal)})`
    );
  } else {
    poVsGR = 'PARTIAL';
    discrepancies.push(
      `סחורה שהתקבלה (${formatNIS(grTotal)}) קטנה מהזמנת הרכש (${formatNIS(poTotal)})`
    );
  }

  // PO vs Bill
  let poVsBill: ThreeWayMatchResult['match']['poVsBill'];
  if (bills.length === 0) {
    poVsBill = 'NOT_BILLED';
    // Not a discrepancy — the vendor invoice may not have arrived yet
  } else if (Math.abs(billTotal - poTotal) <= TOLERANCE) {
    poVsBill = 'MATCH';
  } else if (billTotal > poTotal + TOLERANCE) {
    poVsBill = 'OVER_BILLED';
    discrepancies.push(
      `חשבונית ספק (${formatNIS(billTotal)}) גדולה מהזמנת הרכש (${formatNIS(poTotal)})`
    );
  } else {
    poVsBill = 'PARTIAL';
    discrepancies.push(
      `חשבונית ספק (${formatNIS(billTotal)}) קטנה מהזמנת הרכש (${formatNIS(poTotal)})`
    );
  }

  // GR vs Bill
  let grVsBill: ThreeWayMatchResult['match']['grVsBill'];
  if (bills.length === 0 || po.goodsReceipts.length === 0) {
    grVsBill = 'PENDING';
  } else if (Math.abs(grTotal - billTotal) <= TOLERANCE) {
    grVsBill = 'MATCH';
  } else if (billTotal > grTotal + TOLERANCE) {
    grVsBill = 'DISCREPANCY';
    discrepancies.push(
      `חשבונית ספק (${formatNIS(billTotal)}) גדולה מסחורה שהתקבלה (${formatNIS(grTotal)})`
    );
  } else {
    grVsBill = 'PARTIAL';
    discrepancies.push(
      `חשבונית ספק (${formatNIS(billTotal)}) קטנה מסחורה שהתקבלה (${formatNIS(grTotal)})`
    );
  }

  // 5. Overall status
  const hasCritical =
    poVsGR   === 'OVER_RECEIVED' ||
    poVsBill === 'OVER_BILLED'   ||
    grVsBill === 'DISCREPANCY';

  const overallStatus: ThreeWayMatchResult['match']['overallStatus'] =
    discrepancies.length === 0 ? 'OK'
    : hasCritical              ? 'DISCREPANCY'
    :                            'WARNING';

  return {
    purchaseOrderId: po.id,
    poNumber:        po.number,
    poTotal,
    goodsReceipts: po.goodsReceipts.map((gr) => ({
      id:           gr.id,
      number:       gr.number,
      receivedDate: gr.receivedDate,
      total:        gr.lines.reduce(
        (s, l) => s + Number(l.receivedQty) * Number(l.unitPrice),
        0
      ),
    })),
    bills: bills.map((b) => ({
      id:         b.id,
      billNumber: b.number,
      total:      Number(b.total),
      status:     b.status,
    })),
    match: { poVsGR, poVsBill, grVsBill, overallStatus, discrepancies },
  };
}

// ─── Match Status For All POs ─────────────────────────────────────

export async function getMatchStatusForAllPOs(tenantId: string) {
  const pos = await prisma.purchaseOrder.findMany({
    where: {
      tenantId,
      status: { notIn: ['DRAFT', 'CANCELLED'] as any[] },
    },
    include: {
      vendor:        { select: { name: true } },
      lines:         true,
      goodsReceipts: { include: { lines: true } },
    },
    orderBy: { date: 'desc' },
  });

  return Promise.all(
    pos.map(async (po) => {
      try {
        const matchResult = await threeWayMatch(po.id, tenantId);
        return {
          purchaseOrderId:    po.id,
          poNumber:           po.number,
          vendor:             po.vendor?.name ?? null,
          date:               po.date,
          poTotal:            Number(po.total),
          status:             po.status,
          overallMatchStatus: matchResult.match.overallStatus,
          poVsGR:             matchResult.match.poVsGR,
          poVsBill:           matchResult.match.poVsBill,
          grVsBill:           matchResult.match.grVsBill,
          discrepancyCount:   matchResult.match.discrepancies.length,
        };
      } catch {
        return {
          purchaseOrderId:    po.id,
          poNumber:           po.number,
          vendor:             po.vendor?.name ?? null,
          date:               po.date,
          poTotal:            Number(po.total),
          status:             po.status,
          overallMatchStatus: 'WARNING',
          poVsGR:             'NOT_RECEIVED',
          poVsBill:           'NOT_BILLED',
          grVsBill:           'PENDING',
          discrepancyCount:   0,
        };
      }
    })
  );
}

// ─── Three-Way Match — Bill-centric (validateThreeWayMatch) ───────
//
// This is the spec-required entry point: given a Bill ID, determine
// whether the bill is safe to pay by verifying it matches both a PO
// (amount within ±5%) and at least one approved GR (RECEIVED or INSPECTED).

export interface BillMatchResult {
  isValid:       boolean;
  poMatch:       boolean;   // bill amount matches linked PO total ±5%
  grMatch:       boolean;   // approved GR exists and quantities cover the bill
  discrepancies: string[];  // human-readable issues in English
}

export async function validateThreeWayMatch(
  billId:   string,
  tenantId: string
): Promise<BillMatchResult> {
  const discrepancies: string[] = [];

  // 1. Load the bill with its lines and vendor
  const bill = await prisma.bill.findFirst({
    where:   { id: billId, tenantId },
    include: { lines: true, vendor: { select: { name: true, id: true } } },
  });
  if (!bill) throw new Error('Bill not found');

  const billTotal = Number(bill.total);

  // 2. Resolve the linked PO.
  //    The Bill schema has an optional purchaseOrderId field — use it when present.
  //    Fallback: find a PO for the same vendor whose total is within ±5% of the bill.
  let po: Awaited<ReturnType<typeof prisma.purchaseOrder.findFirst>> & {
    lines: Awaited<ReturnType<typeof prisma.purchaseOrderLine.findMany>>;
  } | null = null;

  if (bill.purchaseOrderId) {
    const found = await prisma.purchaseOrder.findFirst({
      where:   { id: bill.purchaseOrderId, tenantId },
      include: { lines: true },
    });
    if (found) po = found as any;
  }

  if (!po) {
    // Fuzzy fallback: same vendor, not cancelled, amount within ±5%
    const tolerance = billTotal * 0.05;
    const candidates = await prisma.purchaseOrder.findMany({
      where: {
        tenantId,
        vendorId: bill.vendorId,
        status:   { not: 'CANCELLED' as any },
        total: {
          gte: billTotal - tolerance,
          lte: billTotal + tolerance,
        },
      },
      include: { lines: true },
      orderBy: { createdAt: 'desc' },
    });
    if (candidates.length > 0) po = candidates[0] as any;
  }

  // ── PO Match ──────────────────────────────────────────────────────
  let poMatch = false;

  if (!po) {
    discrepancies.push(
      `No purchase order found for bill ${bill.number} (vendor: "${bill.vendor.name}")` +
      ` — either link the bill to a PO or ensure a matching PO exists`
    );
  } else {
    const poTotal    = Number(po.total);
    const tolerance  = poTotal * 0.05;
    const amountDiff = Math.abs(billTotal - poTotal);

    if (amountDiff <= tolerance) {
      poMatch = true;
    } else {
      discrepancies.push(
        `Bill total ${billTotal.toFixed(2)} ILS deviates from PO total ${poTotal.toFixed(2)} ILS ` +
        `by ${amountDiff.toFixed(2)} ILS (limit: ${tolerance.toFixed(2)} ILS / 5%)`
      );
    }

    // Line-level quantity cross-check (best-effort — service lines may be description-only)
    const billQty: Record<string, number> = {};
    for (const bl of bill.lines) {
      const key = bl.productId ?? bl.description;
      billQty[key] = (billQty[key] ?? 0) + Number(bl.quantity);
    }

    for (const poLine of po.lines) {
      const key    = poLine.productId ?? poLine.description;
      const billed = billQty[key];
      if (billed === undefined) {
        discrepancies.push(
          `PO line "${poLine.description}" (ordered: ${Number(poLine.quantity)}) not found in bill lines`
        );
        poMatch = false;
      } else {
        const diff = Math.abs(billed - Number(poLine.quantity));
        if (diff > 0.001) {
          discrepancies.push(
            `Quantity mismatch for "${poLine.description}": ` +
            `PO ordered ${Number(poLine.quantity)}, bill states ${billed}`
          );
          poMatch = false;
        }
      }
    }
  }

  // ── GR Match ──────────────────────────────────────────────────────
  let grMatch = false;

  if (!po) {
    discrepancies.push('Cannot validate goods receipt: no purchase order identified for this bill');
  } else {
    // Accept RECEIVED and INSPECTED GRs as "approved"
    const approvedGRs = await prisma.goodsReceipt.findMany({
      where:   {
        purchaseOrderId: po.id,
        tenantId,
        status: { in: ['RECEIVED', 'INSPECTED'] },
      },
      include: { lines: true },
    });

    if (approvedGRs.length === 0) {
      discrepancies.push(
        `No approved goods receipts (status RECEIVED or INSPECTED) found for PO ${po.number}`
      );
    } else {
      // Sum received quantities across all approved GRs, keyed by productId or description
      const grReceived: Record<string, number> = {};
      for (const gr of approvedGRs) {
        for (const line of gr.lines) {
          const key = line.productId ?? line.description;
          grReceived[key] = (grReceived[key] ?? 0) + Number(line.receivedQty);
        }
      }

      // Verify every bill line is covered by received goods
      let allCovered = true;
      for (const bl of bill.lines) {
        const key      = bl.productId ?? bl.description;
        const received = grReceived[key] ?? 0;
        const billed   = Number(bl.quantity);

        if (received < billed - 0.001) {
          allCovered = false;
          discrepancies.push(
            `Goods receipt shortfall for "${bl.description}": ` +
            `billed qty ${billed}, but only ${received} units received and approved`
          );
        }
      }

      if (allCovered) grMatch = true;
    }
  }

  return {
    isValid: poMatch && grMatch,
    poMatch,
    grMatch,
    discrepancies,
  };
}
