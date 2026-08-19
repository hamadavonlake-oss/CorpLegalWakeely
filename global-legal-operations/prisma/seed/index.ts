/**
 * Phase 1 Seed Script
 *
 * Inserts demo data for development and testing.
 * NO REAL PII — all names/emails are fictional.
 *
 * Usage: npx tsx prisma/seed/index.ts
 */

import { PrismaClient, UserStatus } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

// ─── Demo Data (NO real PII) ────────────────────────────────

const DEMO_ORG = {
  name: 'شركة النور القانونية',
  nameEn: 'Al-Noor Legal Co.',
  slug: 'al-noor-legal',
};

const DEMO_OWNER = {
  email: 'owner@al-noor.demo',
  password: 'DemoP@ssw0rd!',
  firstName: 'سعيد',
  firstNameEn: 'Saeed',
  lastName: 'الحسيني',
  lastNameEn: 'Al-Husayni',
  displayName: 'سعيد الحسيني',
};

const DEMO_LEGAL_ADMIN = {
  email: 'legal-admin@al-noor.demo',
  password: 'DemoP@ssw0rd!',
  firstName: 'فاطمة',
  firstNameEn: 'Fatima',
  lastName: 'العمري',
  lastNameEn: 'Al-Omari',
  displayName: 'فاطمة العمري',
};

const DEMO_LAWYER = {
  email: 'lawyer@al-noor.demo',
  password: 'DemoP@ssw0rd!',
  firstName: 'خالد',
  firstNameEn: 'Khaled',
  lastName: 'المصري',
  lastNameEn: 'Al-Masri',
  displayName: 'خالد المصري',
};

const DEMO_ENTITY = {
  name: 'فرع عمّان الرئيسي',
  nameEn: 'Amman Main Branch',
  legalName: 'شركة النور القانونية – فرع عمّان',
  registrationNo: 'DEMO-REG-001',
  countryCode: 'JO',
  entityType: 'limited_liability_company',
};

const DEMO_DEPARTMENTS = [
  { name: 'قسم العقود', nameEn: 'Contracts Department' },
  { name: 'قسم التقاضي', nameEn: 'Litigation Department' },
  { name: 'قسم الامتثال', nameEn: 'Compliance Department' },
];

// ─── 10 Roles ──────────────────────────────────────────────

const ROLES = [
  { code: 'enterprise_owner', name: 'Enterprise Owner', nameEn: 'Enterprise Owner', isSystem: true },
  { code: 'legal_admin', name: 'مدير القسم القانوني', nameEn: 'Legal Admin', isSystem: true },
  { code: 'general_counsel', name: 'المستشار العام', nameEn: 'General Counsel', isSystem: true },
  { code: 'lawyer', name: 'محامي', nameEn: 'Lawyer', isSystem: false },
  { code: 'contract_manager', name: 'مدير العقود', nameEn: 'Contract Manager', isSystem: false },
  { code: 'business_requester', name: 'طالب خدمة', nameEn: 'Business Requester', isSystem: false },
  { code: 'finance_approver', name: 'معتمد مالي', nameEn: 'Finance Approver', isSystem: false },
  { code: 'executive_approver', name: 'معتمد تنفيذي', nameEn: 'Executive Approver', isSystem: false },
  { code: 'auditor', name: 'مراجع', nameEn: 'Auditor', isSystem: false },
  { code: 'platform_admin', name: 'مدير المنصة', nameEn: 'Platform Admin', isSystem: true },
];

// ─── 15+ Permissions ───────────────────────────────────────

const PERMISSIONS = [
  // Organization
  { code: 'organization.read', name: 'عرض المؤسسة', nameEn: 'Read Organization', module: 'organizations' },
  { code: 'organization.update', name: 'تعديل المؤسسة', nameEn: 'Update Organization', module: 'organizations' },
  { code: 'organization.settings', name: 'إعدادات المؤسسة', nameEn: 'Manage Organization Settings', module: 'organizations' },
  // Entities
  { code: 'entity.create', name: 'إنشاء كيان', nameEn: 'Create Entity', module: 'entities' },
  { code: 'entity.read', name: 'عرض الكيانات', nameEn: 'Read Entities', module: 'entities' },
  { code: 'entity.update', name: 'تعديل كيان', nameEn: 'Update Entity', module: 'entities' },
  // Departments
  { code: 'department.create', name: 'إنشاء قسم', nameEn: 'Create Department', module: 'departments' },
  { code: 'department.read', name: 'عرض الأقسام', nameEn: 'Read Departments', module: 'departments' },
  // Users
  { code: 'user.create', name: 'إنشاء مستخدم', nameEn: 'Create User', module: 'users' },
  { code: 'user.read', name: 'عرض المستخدمين', nameEn: 'Read Users', module: 'users' },
  { code: 'user.update', name: 'تعديل مستخدم', nameEn: 'Update User', module: 'users' },
  { code: 'user.deactivate', name: 'تعطيل مستخدم', nameEn: 'Deactivate User', module: 'users' },
  // Roles
  { code: 'role.assign', name: 'تعيين دور', nameEn: 'Assign Role', module: 'roles' },
  // Country Packs
  { code: 'country_pack.activate', name: 'تفعيل حزمة بلد', nameEn: 'Activate Country Pack', module: 'country-packs' },
  // Audit
  { code: 'audit.read', name: 'عرض سجل التدقيق', nameEn: 'Read Audit Log', module: 'audit' },
];

// ─── Role → Permission mapping ─────────────────────────────

const ROLE_PERMISSIONS: Record<string, string[]> = {
  enterprise_owner: [
    'organization.read', 'organization.update', 'organization.settings',
    'entity.create', 'entity.read', 'entity.update',
    'department.create', 'department.read',
    'user.create', 'user.read', 'user.update', 'user.deactivate',
    'role.assign', 'country_pack.activate', 'audit.read',
  ],
  legal_admin: [
    'organization.read', 'organization.settings',
    'entity.create', 'entity.read', 'entity.update',
    'department.create', 'department.read',
    'user.create', 'user.read', 'user.update',
    'role.assign', 'audit.read',
  ],
  general_counsel: [
    'organization.read',
    'entity.read',
    'department.read',
    'user.read',
    'audit.read',
  ],
  lawyer: [
    'organization.read',
    'entity.read',
    'department.read',
  ],
  contract_manager: [
    'organization.read',
    'entity.read',
    'department.read',
  ],
  business_requester: [
    'organization.read',
  ],
  finance_approver: [
    'organization.read',
    'audit.read',
  ],
  executive_approver: [
    'organization.read',
    'audit.read',
  ],
  auditor: [
    'organization.read',
    'entity.read',
    'department.read',
    'user.read',
    'audit.read',
  ],
  platform_admin: [
    'organization.read', 'organization.update', 'organization.settings',
    'entity.create', 'entity.read', 'entity.update',
    'department.create', 'department.read',
    'user.create', 'user.read', 'user.update', 'user.deactivate',
    'role.assign', 'country_pack.activate', 'audit.read',
  ],
};

// ─── Reference Data ────────────────────────────────────────

const COUNTRIES = [
  { id: 'JO', code: 'JO', name: 'الأردن', nameEn: 'Jordan' },
  { id: 'SA', code: 'SA', name: 'المملكة العربية السعودية', nameEn: 'Saudi Arabia' },
  { id: 'AE', code: 'AE', name: 'الإمارات العربية المتحدة', nameEn: 'United Arab Emirates' },
  { id: 'EG', code: 'EG', name: 'مصر', nameEn: 'Egypt' },
];

const LOCALES = [
  { countryCode: 'JO', code: 'ar', name: 'العربية', isRtl: true },
  { countryCode: 'JO', code: 'en', name: 'English', isRtl: false },
  { countryCode: 'SA', code: 'ar', name: 'العربية', isRtl: true },
  { countryCode: 'AE', code: 'ar', name: 'العربية', isRtl: true },
  { countryCode: 'AE', code: 'en', name: 'English', isRtl: false },
  { countryCode: 'EG', code: 'ar', name: 'العربية', isRtl: true },
];

const CURRENCIES = [
  { id: 'JOD', code: 'JOD', name: 'دينار أردني', nameEn: 'Jordanian Dinar', symbol: 'د.أ' },
  { id: 'SAR', code: 'SAR', name: 'ريال سعودي', nameEn: 'Saudi Riyal', symbol: 'ر.س' },
  { id: 'AED', code: 'AED', name: 'درهم إماراتي', nameEn: 'UAE Dirham', symbol: 'د.إ' },
  { id: 'EGP', code: 'EGP', name: 'جنيه مصري', nameEn: 'Egyptian Pound', symbol: 'ج.م' },
  { id: 'USD', code: 'USD', name: 'دولار أمريكي', nameEn: 'US Dollar', symbol: '$' },
];

// ─── Main ──────────────────────────────────────────────────

async function main() {
  console.log('Seeding database...');

  // 1. Reference data
  console.log('  → Countries (4)');
  for (const c of COUNTRIES) {
    await prisma.country.upsert({
      where: { code: c.code },
      update: {},
      create: c,
    });
  }

  console.log('  → Locales (6)');
  for (const l of LOCALES) {
    await prisma.locale.upsert({
      where: { countryCode_code: { countryCode: l.countryCode, code: l.code } },
      update: {},
      create: l,
    });
  }

  console.log('  → Currencies (5)');
  for (const c of CURRENCIES) {
    await prisma.currency.upsert({
      where: { code: c.code },
      update: {},
      create: c,
    });
  }

  // 2. Organization
  console.log('  → Organization: Al-Noor Legal Co.');
  const org = await prisma.organization.upsert({
    where: { slug: DEMO_ORG.slug },
    update: {},
    create: DEMO_ORG,
  });

  // 3. Organization Settings
  console.log('  → Organization Settings');
  await prisma.organizationSetting.upsert({
    where: { organizationId: org.id },
    update: {},
    create: {
      organizationId: org.id,
      defaultLocale: 'ar',
      defaultTimezone: 'Asia/Amman',
      defaultCurrency: 'JOD',
      mfaMandatory: false,
    },
  });

  // 4. Entity
  console.log('  → Entity: Amman Main Branch');
  const entity = await prisma.entity.upsert({
    where: { organizationId_registrationNo: {
      organizationId: org.id,
      registrationNo: DEMO_ENTITY.registrationNo,
    }},
    update: {},
    create: { ...DEMO_ENTITY, organizationId: org.id },
  });

  // 5. Departments
  console.log('  → Departments (3)');
  for (const d of DEMO_DEPARTMENTS) {
    await prisma.department.create({
      data: { ...d, organizationId: org.id, entityId: entity.id },
    }).catch(() => { /* already exists */ });
  }

  // 6. Permissions
  console.log('  → Permissions (15)');
  const permissionMap = new Map<string, string>();
  for (const p of PERMISSIONS) {
    const perm = await prisma.permission.upsert({
      where: { code: p.code },
      update: {},
      create: p,
    });
    permissionMap.set(p.code, perm.id);
  }

  // 7. Roles
  console.log('  → Roles (10)');
  const roleMap = new Map<string, string>();
  for (const r of ROLES) {
    const role = await prisma.role.upsert({
      where: { code: r.code },
      update: {},
      create: { ...r, organizationId: org.id },
    });
    roleMap.set(r.code, role.id);
  }

  // 8. Role → Permission mappings
  console.log('  → Role-Permission mappings');
  let rpCount = 0;
  for (const [roleCode, permCodes] of Object.entries(ROLE_PERMISSIONS)) {
    const roleId = roleMap.get(roleCode);
    if (!roleId) continue;

    for (const pc of permCodes) {
      const permId = permissionMap.get(pc);
      if (!permId) continue;

      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId, permissionId: permId } },
        update: {},
        create: { roleId, permissionId: permId },
      });
      rpCount++;
    }
  }
  console.log(`    → ${rpCount} role-permission links created`);

  // 9. Demo Users
  console.log('  → Users (3)');
  const users = [
    { ...DEMO_OWNER, roleCode: 'enterprise_owner' as const },
    { ...DEMO_LEGAL_ADMIN, roleCode: 'legal_admin' as const },
    { ...DEMO_LAWYER, roleCode: 'lawyer' as const },
  ];

  for (const u of users) {
    const passwordHash = await argon2.hash(u.password, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });

    const roleId = roleMap.get(u.roleCode)!;

    const user = await prisma.user.upsert({
      where: { organizationId_email: { organizationId: org.id, email: u.email } },
      update: {},
      create: {
        organizationId: org.id,
        email: u.email,
        passwordHash,
        firstName: u.firstName,
        firstNameEn: u.firstNameEn,
        lastName: u.lastName,
        lastNameEn: u.lastNameEn,
        displayName: u.displayName,
        status: UserStatus.active,
      },
    });

    // Assign role
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId } },
      update: {},
      create: { userId: user.id, roleId },
    });

    console.log(`    → ${u.email} (${u.roleCode})`);
  }

  console.log('Seed complete.');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
