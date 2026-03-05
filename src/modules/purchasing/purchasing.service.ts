import { prisma } from '../../config/database';
import { createTransaction } from '../accounting/accounting.service';
import { moveStock } from '../inventory/inventory.service';

// ─── Purchase Order Numbers ───────────────────────────────────────

async function generatePONumber(tenantId: string): Promise<string> {
  const year  = new Date().getFullYear();
  const count = await prisma.purchaseOrder.count({ where: { tenantId } });
  return `PO-${year}-${String(count + 1).padStart(4, '0')}`;
}

async function generateBillNumber(tenantId: string): Promise<string> {
  const year  = new Date().getFullYear();
  const count = await prisma.bill.count({ where: { tenantId } });
  return `BILL-${year}-${String(count + 1).padStart(4, '0')}`;
}

// ─── Create Purchase Order ────────────────────────────────────────

export interface CreatePOInput {
  tenantId:     string;
  vendorId:     string;
  date:         Date;
  expectedDate?: Date;
  notes?:       string;
  createdBy:    string;
  lines: Array<{
    productId?:  string;
    description: string;
    quantity:    number;
    unitCost:    number;
    vatRate?:    number;
  }>;
}

export async function createPurchaseOrder(input: CreatePOInput) {
  const vendor = await prisma.vendor.findUnique({ where: { id: input.vendorId } });
  if (!vendor || vendor.tenantId !== input.tenantId) throw new Error('Vendor not found');

  const processedLines = input.lines.map((l, idx) => {
    const vatRate   = l.vatRate ?? 0.18;
    const lineTotal = Math.round(l.quantity * l.unitCost * 100) / 100;
    return { ...l, vatRate, lineTotal, sortOrder: idx };
  });

  const subtotal  = processedLines.reduce((s, l) => s + l.lineTotal, 0);
  const vatAmount = Math.round(processedLines.reduce((s, l) => s + l.lineTotal * l.vatRate, 0) * 100) / 100;
  const total     = Math.round((subtotal + vatAmount) * 100) / 100;
  const number    = await generatePONumber(input.tenantId);

  return prisma.purchaseOrder.create({
    data: {
      tenantId:     input.tenantId,
      vendorId:     input.vendorId,
      number,
      date:         input.date,
      expectedDate: input.expectedDate,
      notes:        input.notes,
      subtotal,
      vatAmount,
      total,
      createdBy:    input.createdBy,
      lines: { create: processedLines },
    },
    include: { lines: true, vendor: { select: { name: true } } },
  });
}

// ─── Receive PO (creates stock movement) ──────────────────────────

export async function receivePurchaseOrder(
  poId: string,
  tenantId: string,
  warehouseId: string,
  receivedLines: Array<{ lineId: string; receivedQty: number }>,
  userId: string
) {
  const po = await prisma.purchaseOrder.findUnique({
    where: { id: poId },
    include: { lines: { include: { product: true } } },
  });

  if (!po || po.tenantId !== tenantId) throw new Error('Purchase order not found');
  if (po.status === 'CANCELLED') throw new Error('Cannot receive a cancelled PO');

  return prisma.$transaction(async (tx) => {
    for (const recv of receivedLines) {
      const line = po.lines.find(l => l.id === recv.lineId);
      if (!line || !line.productId) continue;
      if (recv.receivedQty <= 0) continue;

      // Move stock in
      await moveStock({
        tenantId,
        productId:   line.productId,
        warehouseId,
        type:        'IN',
        quantity:    recv.receivedQty,
        unitCost:    Number(line.unitCost),
        reference:   po.number,
        sourceType:  'PO',
        sourceId:    poId,
        createdBy:   userId,
      });

      // Update received qty on line
      await tx.purchaseOrderLine.update({
        where: { id: recv.lineId },
        data:  { receivedQty: { increment: recv.receivedQty } },
      });
    }

    // Update PO status
    const updatedLines = await tx.purchaseOrderLine.findMany({ where: { poId } });
    const allReceived  = updatedLines.every(l => Number(l.receivedQty) >= Number(l.quantity));
    const anyReceived  = updatedLines.some(l => Number(l.receivedQty) > 0);

    await tx.purchaseOrder.update({
      where: { id: poId },
      data: {
        status: allReceived ? 'RECEIVED'
               : anyReceived ? 'PARTIALLY_RECEIVED'
               : 'SENT',
      },
    });

    return { poId, status: allReceived ? 'RECEIVED' : 'PARTIALLY_RECEIVED' };
  });
}

// ─── Create Bill ──────────────────────────────────────────────────

export interface CreateBillInput {
  tenantId:       string;
  vendorId:       string;
  purchaseOrderId?: string;
  vendorRef?:     string;
  date:           Date;
  dueDate:        Date;
  notes?:         string;
  createdBy:      string;
  lines: Array<{
    productId?:  string;
    accountId?:  string;
    description: string;
    quantity:    number;
    unitCost:    number;
    vatRate?:    number;
  }>;
}

export async function createBill(input: CreateBillInput) {
  const vendor = await prisma.vendor.findUnique({ where: { id: input.vendorId } });
  if (!vendor || vendor.tenantId !== input.tenantId) throw new Error('Vendor not found');

  const processedLines = input.lines.map((l, idx) => ({
    ...l,
    vatRate:   l.vatRate ?? 0.18,
    lineTotal: Math.round(l.quantity * l.unitCost * 100) / 100,
    sortOrder: idx,
  }));

  const subtotal  = processedLines.reduce((s, l) => s + l.lineTotal, 0);
  const vatAmount = Math.round(processedLines.reduce((s, l) => s + l.lineTotal * l.vatRate, 0) * 100) / 100;
  const total     = Math.round((subtotal + vatAmount) * 100) / 100;
  const number    = await generateBillNumber(input.tenantId);

  // Find AP account (3100 - ספקים) and VAT input account (1600)
  const [apAccount, vatInputAccount] = await Promise.all([
    prisma.account.findFirst({ where: { tenantId: input.tenantId, code: '3100' } }),
    prisma.account.findFirst({ where: { tenantId: input.tenantId, code: '1600' } }),
  ]);

  return prisma.$transaction(async (tx) => {
    const bill = await tx.bill.create({
      data: {
        tenantId:       input.tenantId,
        vendorId:       input.vendorId,
        purchaseOrderId: input.purchaseOrderId,
        vendorRef:      input.vendorRef,
        number,
        date:           input.date,
        dueDate:        input.dueDate,
        notes:          input.notes,
        subtotal,
        vatAmount,
        total,
        createdBy:      input.createdBy,
        lines: { create: processedLines },
      },
      include: { lines: true },
    });

    // Auto-create journal entry when bill is created
    // DR: Expense accounts / Inventory, DR: VAT Input, CR: Accounts Payable
    if (apAccount) {
      const expenseAccount = await tx.account.findFirst({
        where: { tenantId: input.tenantId, code: '7600' }, // הוצאות ספקים
      });

      const journalLines = [];

      if (expenseAccount) {
        journalLines.push({
          debitAccountId:  expenseAccount.id,
          creditAccountId: apAccount.id,
          amount:          subtotal,
          description:     `חשבונית ספק ${number}`,
        });
      }

      if (vatInputAccount && apAccount && vatAmount > 0) {
        journalLines.push({
          debitAccountId:  vatInputAccount.id,
          creditAccountId: apAccount.id,
          amount:          vatAmount,
          description:     `מע"מ תשומות ${number}`,
        });
      }

      if (journalLines.length > 0) {
        const journalTx = await createTransaction({
          tenantId:    input.tenantId,
          date:        input.date,
          reference:   number,
          description: `חשבונית ספק ${vendor.name} - ${number}`,
          sourceType:  'BILL',
          sourceId:    bill.id,
          createdBy:   input.createdBy,
          lines:       journalLines,
        });

        await tx.bill.update({
          where: { id: bill.id },
          data:  { journalTransactionId: journalTx.id, status: 'POSTED' },
        });
      }

      return bill;
    }

    return bill;
  });
}

// ─── Pay Bill ─────────────────────────────────────────────────────

export async function payBill(input: {
  billId:    string;
  tenantId:  string;
  amount:    number;
  method:    string;
  date:      Date;
  reference?: string;
  createdBy: string;
}) {
  const bill = await prisma.bill.findUnique({
    where: { id: input.billId },
    include: { vendor: true },
  });

  if (!bill || bill.tenantId !== input.tenantId) throw new Error('Bill not found');
  if (bill.status === 'CANCELLED') throw new Error('Cannot pay a cancelled bill');

  const [bankAccount, apAccount] = await Promise.all([
    prisma.account.findFirst({ where: { tenantId: input.tenantId, code: '1200' } }),
    prisma.account.findFirst({ where: { tenantId: input.tenantId, code: '3100' } }),
  ]);

  return prisma.$transaction(async (tx) => {
    const payment = await tx.billPayment.create({
      data: {
        billId:    input.billId,
        tenantId:  input.tenantId,
        amount:    input.amount,
        method:    input.method as any,
        date:      input.date,
        reference: input.reference,
        createdBy: input.createdBy,
      },
    });

    // Total paid
    const totalPaid = await tx.billPayment.aggregate({
      where: { billId: input.billId },
      _sum:  { amount: true },
    });

    const paid = Number(totalPaid._sum.amount ?? 0);
    const newStatus = paid >= Number(bill.total) ? 'PAID'
                    : paid > 0 ? 'PARTIALLY_PAID'
                    : bill.status;

    await tx.bill.update({
      where: { id: input.billId },
      data:  { status: newStatus as any, paidAt: newStatus === 'PAID' ? new Date() : undefined },
    });

    // Journal: DR: AP, CR: Bank
    if (apAccount && bankAccount) {
      const journalTx = await createTransaction({
        tenantId:    input.tenantId,
        date:        input.date,
        reference:   `PAY-${bill.number}`,
        description: `תשלום לספק ${bill.vendor.name}`,
        sourceType:  'BILL_PAYMENT',
        sourceId:    payment.id,
        createdBy:   input.createdBy,
        lines: [{
          debitAccountId:  apAccount.id,
          creditAccountId: bankAccount.id,
          amount:          input.amount,
        }],
      });

      await tx.billPayment.update({
        where: { id: payment.id },
        data:  { journalTransactionId: journalTx.id },
      });
    }

    return payment;
  });
}
