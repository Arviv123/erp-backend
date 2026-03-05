import { z } from 'zod';
import { prisma } from '../../config/database';

// ─── Validation Schemas ───────────────────────────────────────────

export const PriceListItemSchema = z.object({
  productId: z.string(),
  unitPrice: z.number().positive(),
  minQty:    z.number().positive().default(1),
});

export const CreatePriceListSchema = z.object({
  name:        z.string().min(1),
  type:        z.enum(['CUSTOMER_SPECIFIC', 'VOLUME_DISCOUNT', 'PROMOTIONAL']).default('CUSTOMER_SPECIFIC'),
  discountPct: z.number().min(0).max(100).optional(),
  startDate:   z.string().datetime().optional(),
  endDate:     z.string().datetime().optional(),
  isDefault:   z.boolean().default(false),
  items:       z.array(PriceListItemSchema).optional(),
});

export const UpdatePriceListSchema = CreatePriceListSchema.partial().extend({
  replaceItems: z.boolean().default(false),
});

export type CreatePriceListInput = z.infer<typeof CreatePriceListSchema>;
export type UpdatePriceListInput = z.infer<typeof UpdatePriceListSchema>;
export type PriceListItemInput   = z.infer<typeof PriceListItemSchema>;

// ─── List Price Lists ─────────────────────────────────────────────

export async function listPriceLists(
  tenantId: string,
  filters: { type?: string; isDefault?: boolean } = {}
) {
  const where: Record<string, unknown> = { tenantId };

  if (filters.type      !== undefined) where.type      = filters.type;
  if (filters.isDefault !== undefined) where.isDefault = filters.isDefault;

  const priceLists = await prisma.priceList.findMany({
    where,
    include: {
      _count: {
        select: {
          items:     true,
          customers: true,
        },
      },
    },
    orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
  });

  return priceLists.map(pl => ({
    ...pl,
    itemCount:    pl._count.items,
    customerCount: pl._count.customers,
    _count:       undefined,
  }));
}

// ─── Get Single Price List ────────────────────────────────────────

export async function getPriceList(id: string, tenantId: string) {
  const priceList = await prisma.priceList.findUnique({
    where:   { id },
    include: {
      items: {
        include: {
          product: { select: { id: true, name: true, sku: true, sellingPrice: true } },
        },
        orderBy: { product: { name: 'asc' } },
      },
      customers: {
        select: {
          id:     true,
          name:   true,
          email:  true,
          status: true,
        },
      },
    },
  });

  if (!priceList || priceList.tenantId !== tenantId) {
    throw new Error('Price list not found');
  }

  return priceList;
}

// ─── Create Price List ────────────────────────────────────────────

export async function createPriceList(tenantId: string, data: CreatePriceListInput) {
  const { items, isDefault, ...headerData } = data;

  return prisma.$transaction(async (tx) => {
    // Enforce single default: clear any existing default first
    if (isDefault) {
      await tx.priceList.updateMany({
        where: { tenantId, isDefault: true },
        data:  { isDefault: false },
      });
    }

    const priceList = await tx.priceList.create({
      data: {
        tenantId,
        ...headerData,
        isDefault,
        discountPct: headerData.discountPct !== undefined ? headerData.discountPct : null,
        startDate:   headerData.startDate   ? new Date(headerData.startDate) : null,
        endDate:     headerData.endDate     ? new Date(headerData.endDate)   : null,
        items: items && items.length > 0
          ? {
              create: items.map(item => ({
                productId: item.productId,
                unitPrice: item.unitPrice,
                minQty:    item.minQty,
              })),
            }
          : undefined,
      },
      include: {
        items: {
          include: {
            product: { select: { id: true, name: true, sku: true } },
          },
        },
      },
    });

    return priceList;
  });
}

// ─── Update Price List ────────────────────────────────────────────

export async function updatePriceList(
  id:       string,
  tenantId: string,
  data:     UpdatePriceListInput
) {
  const existing = await prisma.priceList.findUnique({ where: { id } });
  if (!existing || existing.tenantId !== tenantId) {
    throw new Error('Price list not found');
  }

  const { items, replaceItems, isDefault, ...headerData } = data;

  return prisma.$transaction(async (tx) => {
    // Enforce single default
    if (isDefault) {
      await tx.priceList.updateMany({
        where: { tenantId, isDefault: true, NOT: { id } },
        data:  { isDefault: false },
      });
    }

    const updateData: Record<string, unknown> = { ...headerData };
    if (isDefault          !== undefined) updateData.isDefault   = isDefault;
    if (headerData.discountPct !== undefined) updateData.discountPct = headerData.discountPct;
    if (headerData.startDate   !== undefined) updateData.startDate   = headerData.startDate ? new Date(headerData.startDate) : null;
    if (headerData.endDate     !== undefined) updateData.endDate     = headerData.endDate   ? new Date(headerData.endDate)   : null;

    const updated = await tx.priceList.update({
      where: { id },
      data:  updateData,
    });

    // Optionally replace items
    if (items !== undefined && replaceItems) {
      await tx.priceListItem.deleteMany({ where: { priceListId: id } });
      if (items.length > 0) {
        await tx.priceListItem.createMany({
          data: items.map(item => ({
            priceListId: id,
            productId:   item.productId,
            unitPrice:   item.unitPrice,
            minQty:      item.minQty,
          })),
        });
      }
    }

    return getPriceList(id, tenantId);
  });
}

// ─── Delete Price List ────────────────────────────────────────────

export async function deletePriceList(id: string, tenantId: string) {
  const priceList = await prisma.priceList.findUnique({
    where:   { id },
    include: { _count: { select: { customers: true } } },
  });

  if (!priceList || priceList.tenantId !== tenantId) {
    throw new Error('Price list not found');
  }

  if (priceList._count.customers > 0) {
    throw new Error(
      `Cannot delete price list: ${priceList._count.customers} customer(s) are assigned to it. ` +
      `Please unassign them first.`
    );
  }

  await prisma.priceList.delete({ where: { id } });

  return { message: 'Price list deleted successfully' };
}

// ─── Add Item ─────────────────────────────────────────────────────

export async function addItem(
  priceListId: string,
  tenantId:    string,
  data:        PriceListItemInput
) {
  const priceList = await prisma.priceList.findUnique({ where: { id: priceListId } });
  if (!priceList || priceList.tenantId !== tenantId) {
    throw new Error('Price list not found');
  }

  // Verify product belongs to tenant
  const product = await prisma.product.findUnique({ where: { id: data.productId } });
  if (!product || product.tenantId !== tenantId) {
    throw new Error('Product not found');
  }

  try {
    const item = await prisma.priceListItem.create({
      data: {
        priceListId,
        productId: data.productId,
        unitPrice: data.unitPrice,
        minQty:    data.minQty,
      },
      include: {
        product: { select: { id: true, name: true, sku: true, sellingPrice: true } },
      },
    });
    return item;
  } catch (err: any) {
    if (err.code === 'P2002') {
      throw new Error(`Product ${product.name} is already in this price list`);
    }
    throw err;
  }
}

// ─── Remove Item ──────────────────────────────────────────────────

export async function removeItem(
  priceListId: string,
  itemId:      string,
  tenantId:    string
) {
  // Verify price list belongs to tenant
  const priceList = await prisma.priceList.findUnique({ where: { id: priceListId } });
  if (!priceList || priceList.tenantId !== tenantId) {
    throw new Error('Price list not found');
  }

  const item = await prisma.priceListItem.findUnique({ where: { id: itemId } });
  if (!item || item.priceListId !== priceListId) {
    throw new Error('Price list item not found');
  }

  await prisma.priceListItem.delete({ where: { id: itemId } });

  return { message: 'Item removed from price list' };
}

// ─── Assign to Customer ───────────────────────────────────────────

export async function assignToCustomer(
  priceListId: string,
  customerId:  string,
  tenantId:    string
) {
  // Verify price list belongs to tenant
  const priceList = await prisma.priceList.findUnique({ where: { id: priceListId } });
  if (!priceList || priceList.tenantId !== tenantId) {
    throw new Error('Price list not found');
  }

  // Verify customer belongs to tenant
  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer || customer.tenantId !== tenantId) {
    throw new Error('Customer not found');
  }

  const updated = await prisma.customer.update({
    where: { id: customerId },
    data:  { priceListId },
    select: {
      id:          true,
      name:        true,
      email:       true,
      priceListId: true,
    },
  });

  return updated;
}

// ─── Unassign from Customer ───────────────────────────────────────

export async function unassignFromCustomer(customerId: string, tenantId: string) {
  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer || customer.tenantId !== tenantId) {
    throw new Error('Customer not found');
  }

  const updated = await prisma.customer.update({
    where: { id: customerId },
    data:  { priceListId: null },
    select: {
      id:          true,
      name:        true,
      email:       true,
      priceListId: true,
    },
  });

  return updated;
}

// ─── Get Effective Price ──────────────────────────────────────────

export interface EffectivePriceResult {
  price:          number;
  source:         'pricelist' | 'discount' | 'default';
  priceListName?: string;
  priceListId?:   string;
}

export async function getEffectivePrice(
  productId: string,
  customerId: string,
  tenantId:   string,
  quantity:   number = 1
): Promise<EffectivePriceResult> {
  // 1. Fetch product (verify it belongs to tenant)
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product || product.tenantId !== tenantId) {
    throw new Error('Product not found');
  }

  const defaultPrice = Number(product.sellingPrice);

  // 2. Fetch customer and its assigned price list
  const customer = await prisma.customer.findUnique({
    where:   { id: customerId },
    include: {
      priceList: {
        include: {
          items: {
            where:   { productId },
            orderBy: { minQty: 'desc' }, // highest minQty first → best matching tier
          },
        },
      },
    },
  });

  if (!customer || customer.tenantId !== tenantId) {
    throw new Error('Customer not found');
  }

  // 3. No price list assigned — return product default
  if (!customer.priceList) {
    return { price: defaultPrice, source: 'default' };
  }

  const priceList = customer.priceList;

  // Check price list date validity
  const now = new Date();
  if (priceList.startDate && now < priceList.startDate) {
    return { price: defaultPrice, source: 'default' };
  }
  if (priceList.endDate && now > priceList.endDate) {
    return { price: defaultPrice, source: 'default' };
  }

  // 4. Look for a matching PriceListItem (where minQty <= quantity), best tier first
  const matchingItem = priceList.items.find(
    item => Number(item.minQty) <= quantity
  );

  if (matchingItem) {
    return {
      price:         Number(matchingItem.unitPrice),
      source:        'pricelist',
      priceListName: priceList.name,
      priceListId:   priceList.id,
    };
  }

  // 5. No per-product override — check flat discountPct on the price list
  if (priceList.discountPct !== null && priceList.discountPct !== undefined) {
    const discountFactor = 1 - Number(priceList.discountPct) / 100;
    const discountedPrice = Math.round(defaultPrice * discountFactor * 100) / 100;
    return {
      price:         discountedPrice,
      source:        'discount',
      priceListName: priceList.name,
      priceListId:   priceList.id,
    };
  }

  // 6. Fall back to product's selling price
  return { price: defaultPrice, source: 'default' };
}

// ─── Get Price List for Customer ──────────────────────────────────

export async function getPriceListForCustomer(customerId: string, tenantId: string) {
  const customer = await prisma.customer.findUnique({
    where:   { id: customerId },
    include: {
      priceList: {
        include: {
          items: {
            include: {
              product: { select: { id: true, name: true, sku: true, sellingPrice: true } },
            },
          },
        },
      },
    },
  });

  if (!customer || customer.tenantId !== tenantId) {
    throw new Error('Customer not found');
  }

  return {
    customerId:   customer.id,
    customerName: customer.name,
    priceList:    customer.priceList ?? null,
  };
}
