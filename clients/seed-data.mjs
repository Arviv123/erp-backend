/**
 * seed-data.mjs — מכניס נתוני דמו דרך ה-API
 * הרץ: node seed-data.mjs
 */

const BASE = 'https://erp-backend-n433.onrender.com/api';
const EMAIL = 'admin2@test.co.il';
const PASSWORD = 'Admin1234!';
const TENANT_ID = 'cmm95megs00014n265h3objd5';

let token = '';

async function req(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) {
    console.error(`  ✗ ${method} ${path} → ${res.status}:`, typeof data === 'object' ? data?.error ?? data : text.slice(0, 200));
    return null;
  }
  return data;
}

const get  = (p) => req('GET', p);
const post = (p, b) => req('POST', p, b);
const put  = (p, b) => req('PUT', p, b);

// ────────────────────────────────────────────────────────────────────
async function login() {
  console.log('\n▶ מתחבר...');
  const r = await post('/users/auth/login', { email: EMAIL, password: PASSWORD, tenantId: TENANT_ID });
  if (!r) { console.error('Login failed'); process.exit(1); }
  token = r.token ?? r.data?.token ?? r.accessToken ?? r.data?.accessToken;
  if (!token) { console.error('No token in response:', r); process.exit(1); }
  console.log('  ✔ מחובר בתור:', EMAIL);
}

// ────────────────────────────────────────────────────────────────────
async function seedInventory() {
  console.log('\n▶ מלאי — מחסן וקטגוריות...');

  // Warehouse
  let warehouseId;
  const warehouses = await get('/inventory/warehouses');
  const wList = Array.isArray(warehouses) ? warehouses : warehouses?.data ?? [];
  if (wList.length > 0) {
    warehouseId = wList[0].id;
    console.log(`  ✔ מחסן קיים: ${wList[0].name} (${warehouseId})`);
  } else {
    const w = await post('/inventory/warehouses', { name: 'מחסן ראשי', location: 'תל אביב', isDefault: true });
    warehouseId = w?.id ?? w?.data?.id;
    console.log('  ✔ מחסן נוצר:', warehouseId);
  }

  // Categories
  const catNames = ['מזון יבש', 'שתייה', 'ניקיון', 'ירקות ופירות', 'חלבי'];
  const catIds = {};
  for (const name of catNames) {
    const existing = await get(`/inventory/categories?name=${encodeURIComponent(name)}`);
    const exList = Array.isArray(existing) ? existing : existing?.data ?? [];
    const found = exList.find(c => c.name === name);
    if (found) {
      catIds[name] = found.id;
      console.log(`  ✔ קטגוריה קיימת: ${name}`);
    } else {
      const c = await post('/inventory/categories', { name });
      catIds[name] = c?.id ?? c?.data?.id;
      console.log(`  ✔ קטגוריה נוצרה: ${name} (${catIds[name]})`);
    }
  }

  // Products
  const products = [
    { name: 'אורז בסמטי 1ק"ג', sku: 'RICE001', categoryName: 'מזון יבש', unitOfMeasure: 'ק"ג', costPrice: 8, sellingPrice: 14, barcode: '7290000001' },
    { name: 'שמן זית 750מל', sku: 'OIL001', categoryName: 'מזון יבש', unitOfMeasure: 'בקבוק', costPrice: 22, sellingPrice: 38, barcode: '7290000002' },
    { name: 'פסטה ספגטי 500ג', sku: 'PAST001', categoryName: 'מזון יבש', unitOfMeasure: 'חבילה', costPrice: 4, sellingPrice: 7, barcode: '7290000003' },
    { name: 'קוקה קולה 1.5ל', sku: 'COKE001', categoryName: 'שתייה', unitOfMeasure: 'בקבוק', costPrice: 5, sellingPrice: 9, barcode: '7290000004' },
    { name: 'מים מינרל 1.5ל', sku: 'WATR001', categoryName: 'שתייה', unitOfMeasure: 'בקבוק', costPrice: 2, sellingPrice: 4, barcode: '7290000005' },
    { name: 'מיץ תפוזים טרי 1ל', sku: 'JUICE001', categoryName: 'שתייה', unitOfMeasure: 'בקבוק', costPrice: 8, sellingPrice: 15, barcode: '7290000006' },
    { name: 'אקונומיקה 750מל', sku: 'BLEACH001', categoryName: 'ניקיון', unitOfMeasure: 'בקבוק', costPrice: 4, sellingPrice: 7, barcode: '7290000007' },
    { name: 'אבקת כביסה 3ק"ג', sku: 'WASH001', categoryName: 'ניקיון', unitOfMeasure: 'אריזה', costPrice: 28, sellingPrice: 49, barcode: '7290000008' },
    { name: 'עגבניות שרי 500ג', sku: 'TOM001', categoryName: 'ירקות ופירות', unitOfMeasure: 'ק"ג', costPrice: 6, sellingPrice: 12, barcode: '7290000009' },
    { name: 'מלפפונים 1ק"ג', sku: 'CUC001', categoryName: 'ירקות ופירות', unitOfMeasure: 'ק"ג', costPrice: 3, sellingPrice: 6, barcode: '7290000010' },
    { name: 'חלב טרי 3% 1ל', sku: 'MILK001', categoryName: 'חלבי', unitOfMeasure: 'שקית', costPrice: 4, sellingPrice: 7, barcode: '7290000011' },
    { name: 'גבינה צהובה 200ג', sku: 'CHEES001', categoryName: 'חלבי', unitOfMeasure: 'אריזה', costPrice: 12, sellingPrice: 22, barcode: '7290000012' },
    { name: 'יוגורט 3% 150ג', sku: 'YOG001', categoryName: 'חלבי', unitOfMeasure: 'גביע', costPrice: 2, sellingPrice: 4, barcode: '7290000013' },
  ];

  for (const p of products) {
    const existing = await get(`/inventory/products?sku=${p.sku}`);
    const exList = Array.isArray(existing) ? existing : existing?.data ?? [];
    if (exList.find(x => x.sku === p.sku)) {
      console.log(`  ✔ מוצר קיים: ${p.name}`);
      continue;
    }
    const created = await post('/inventory/products', {
      name: p.name,
      sku: p.sku,
      barcode: p.barcode,
      categoryId: catIds[p.categoryName],
      unitOfMeasure: p.unitOfMeasure,
      costPrice: p.costPrice,
      sellingPrice: p.sellingPrice,
      isActive: true,
      isService: false,
    });
    const productId = created?.id ?? created?.data?.id;
    if (productId && warehouseId) {
      // Add initial stock
      await post('/inventory/stock/adjust', {
        productId,
        warehouseId,
        newQuantity: Math.floor(Math.random() * 80) + 20,
        reason: 'מלאי פתיחה',
      });
    }
    console.log(`  ✔ מוצר נוצר: ${p.name}`);
  }
}

// ────────────────────────────────────────────────────────────────────
async function seedCRM() {
  console.log('\n▶ לקוחות CRM...');
  const customers = [
    { name: 'סופרמרקט כהן בע"מ', email: 'cohen@supermarket.co.il', phone: '03-1234567', type: 'B2B', vatNumber: '123456789' },
    { name: 'מסעדת הים הכחול', email: 'info@bluecafe.co.il', phone: '04-7654321', type: 'B2B', vatNumber: '987654321' },
    { name: 'מכולת נאסר', email: 'nasser@gmail.com', phone: '052-1111111', type: 'B2B' },
    { name: 'ישראל ישראלי', email: 'israel@gmail.com', phone: '050-2222222', type: 'B2C' },
    { name: 'דבי כהן', email: 'dabi@gmail.com', phone: '054-3333333', type: 'B2C' },
    { name: 'חברת אבג תוכנה', email: 'info@abg.co.il', phone: '03-5555555', type: 'B2B', vatNumber: '111222333' },
  ];

  const createdIds = [];
  for (const c of customers) {
    const existing = await get(`/crm/customers?email=${encodeURIComponent(c.email)}`);
    const exList = Array.isArray(existing) ? existing : existing?.data ?? [];
    if (exList.find(x => x.email === c.email)) {
      const found = exList.find(x => x.email === c.email);
      createdIds.push(found.id);
      console.log(`  ✔ לקוח קיים: ${c.name}`);
      continue;
    }
    const r = await post('/crm/customers', c);
    const id = r?.id ?? r?.data?.id;
    if (id) {
      createdIds.push(id);
      console.log(`  ✔ לקוח נוצר: ${c.name} (${id})`);
    } else {
      console.log(`  ✗ כישלון יצירת לקוח: ${c.name}`);
    }
  }
  return createdIds;
}

// ────────────────────────────────────────────────────────────────────
async function seedInvoices(customerIds) {
  if (!customerIds?.length) { console.log('\n  ⚠ אין לקוחות — דולג על חשבוניות'); return; }
  console.log('\n▶ חשבוניות...');

  const today = new Date().toISOString();
  const due30 = new Date(Date.now() + 30 * 86400000).toISOString();

  const invoiceSets = [
    { customerId: customerIds[0], lines: [
      { description: 'אורז בסמטי x100', quantity: 100, unitPrice: 14, vatRate: 0.18, discount: 0 },
      { description: 'שמן זית x50', quantity: 50, unitPrice: 38, vatRate: 0.18, discount: 0 },
    ]},
    { customerId: customerIds[1], lines: [
      { description: 'מים מינרל x200', quantity: 200, unitPrice: 4, vatRate: 0.18, discount: 0 },
      { description: 'מיץ תפוזים x50', quantity: 50, unitPrice: 15, vatRate: 0.18, discount: 0.05 },
    ]},
    { customerId: customerIds[2], lines: [
      { description: 'אבקת כביסה x20', quantity: 20, unitPrice: 49, vatRate: 0.18, discount: 0 },
    ]},
  ];

  for (const inv of invoiceSets) {
    const r = await post('/invoices', {
      customerId: inv.customerId,
      date: today,
      dueDate: due30,
      lines: inv.lines,
      notes: 'נוצר ע"י סקריפט seed',
    });
    const id = r?.id ?? r?.data?.id;
    if (!id) { console.log('  ✗ שגיאה ביצירת חשבונית'); continue; }
    console.log(`  ✔ חשבונית נוצרה: ${id}`);
    // Send it
    await post(`/invoices/${id}/send`, {});
    console.log(`    → נשלחה`);
  }
}

// ────────────────────────────────────────────────────────────────────
async function seedEmployees() {
  console.log('\n▶ עובדים...');
  const employees = [
    {
      firstName: 'דני', lastName: 'לוי', email: 'danny@company.co.il', phone: '052-9001001',
      personalEmail: 'danny.levi@gmail.com', idNumber: '123456789', gender: 'M',
      birthDate: '1985-05-15T00:00:00.000Z', startDate: '2022-01-15T00:00:00.000Z',
      jobTitle: 'מנהל מכירות', department: 'מכירות', grossSalary: 12000,
      address: { street: 'רחוב הרצל 10', city: 'תל אביב', zip: '6100000' },
    },
    {
      firstName: 'רחל', lastName: 'כהן', email: 'rachel@company.co.il', phone: '054-9002002',
      personalEmail: 'rachel.cohen@gmail.com', idNumber: '234567890', gender: 'F',
      birthDate: '1992-08-20T00:00:00.000Z', startDate: '2023-03-01T00:00:00.000Z',
      jobTitle: 'קופאית', department: 'קופה', grossSalary: 7000,
      address: { street: 'שדרות בן גוריון 5', city: 'רמת גן', zip: '5200000' },
    },
    {
      firstName: 'משה', lastName: 'גרינברג', email: 'moshe@company.co.il', phone: '050-9003003',
      personalEmail: 'moshe.g@gmail.com', idNumber: '345678901', gender: 'M',
      birthDate: '1980-03-10T00:00:00.000Z', startDate: '2021-06-10T00:00:00.000Z',
      jobTitle: 'מחסנאי', department: 'לוגיסטיקה', grossSalary: 8000,
      address: { street: 'רחוב ויצמן 22', city: 'פתח תקווה', zip: '4900000' },
    },
    {
      firstName: 'שרה', lastName: 'אביב', email: 'sara@company.co.il', phone: '058-9004004',
      personalEmail: 'sara.aviv@gmail.com', idNumber: '456789012', gender: 'F',
      birthDate: '1978-11-01T00:00:00.000Z', startDate: '2020-09-01T00:00:00.000Z',
      jobTitle: 'חשבת', department: 'כספים', grossSalary: 14000,
      address: { street: 'רחוב אלנבי 40', city: 'תל אביב', zip: '6100000' },
    },
  ];

  for (const e of employees) {
    const existing = await get(`/employees?email=${encodeURIComponent(e.email)}`);
    const exList = Array.isArray(existing) ? existing : existing?.data ?? [];
    if (exList.find(x => x.email === e.email)) {
      console.log(`  ✔ עובד קיים: ${e.firstName} ${e.lastName}`);
      continue;
    }
    const r = await post('/employees', e);
    if (r?.id ?? r?.data?.id) console.log(`  ✔ עובד נוצר: ${e.firstName} ${e.lastName}`);
    else console.log(`  ✗ כישלון יצירת עובד: ${e.firstName} ${e.lastName}`);
  }
}

// ────────────────────────────────────────────────────────────────────
async function main() {
  console.log('=== ERP Seed Script ===');
  console.log('שרת:', BASE);
  console.log('');

  await login();
  await seedInventory();
  const customerIds = await seedCRM();
  await seedInvoices(customerIds);
  await seedEmployees();

  console.log('\n=== הסתיים! ===');
  console.log('פתח את הפורטל ב-http://localhost:5200 לראות את הדאטה');
}

main().catch(err => {
  console.error('\nError:', err.message);
  process.exit(1);
});
