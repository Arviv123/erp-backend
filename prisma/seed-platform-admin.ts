/**
 * Create initial platform admin
 * Run: npx ts-node prisma/seed-platform-admin.ts
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const email    = process.env.PLATFORM_ADMIN_EMAIL    ?? 'platform@admin.com';
  const password = process.env.PLATFORM_ADMIN_PASSWORD ?? 'Platform123!';
  const name     = process.env.PLATFORM_ADMIN_NAME     ?? 'מנהל פלטפורמה';

  const existing = await prisma.platformAdmin.findUnique({ where: { email } });
  if (existing) {
    console.log(`✓ Platform admin already exists: ${email}`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const admin = await prisma.platformAdmin.create({
    data: { email, passwordHash, name },
  });

  console.log('✓ Platform admin created:');
  console.log(`  Email:    ${admin.email}`);
  console.log(`  Name:     ${admin.name}`);
  console.log(`  Password: ${password}`);
  console.log('');
  console.log('  Login at: /platform/login');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
