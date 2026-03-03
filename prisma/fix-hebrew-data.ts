/**
 * Fix all garbled Hebrew data in the database.
 * Runs as a single transaction.
 */
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const LEAVE_TYPE_FIXES: { id: string; name: string }[] = [
  { id: 'cmm98plm60023y0fw46wa0dju', name: 'חופשה שנתית' },
  { id: 'cmm98ppwz0025y0fwczl7ceaj', name: 'מחלה' },
  { id: 'cmm98ptsf0027y0fwixry7djo', name: 'חופשת לידה' },
  { id: 'cmm98pxmv0029y0fwigh1mpx8', name: 'אבל' },
  { id: 'cmm98q285002by0fweyeg1bsj', name: 'מילואים' },
];

async function main() {
  console.log('🔧 Fixing Hebrew data in database...');

  await prisma.$transaction([
    // Fix tenant name
    prisma.tenant.update({
      where: { id: 'cmm95megs00014n265h3objd5' },
      data: { name: 'חברת הדגמה 2 בע"מ' },
    }),
    // Fix leave types
    ...LEAVE_TYPE_FIXES.map(({ id, name }) =>
      prisma.leaveType.update({ where: { id }, data: { name } })
    ),
  ]);

  console.log('✅ Fixed: tenant name + 5 leave types');
}

main()
  .catch(e => { console.error('❌ Failed:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
