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
  // ─── Phase 2: Legal Operations ────────────────────────────
  // Legal Requests
  { code: 'request.create', name: 'إنشاء طلب قانوني', nameEn: 'Create Legal Request', module: 'legal-requests' },
  { code: 'request.read', name: 'عرض الطلبات القانونية', nameEn: 'Read Legal Requests', module: 'legal-requests' },
  { code: 'request.update', name: 'تعديل طلب قانوني', nameEn: 'Update Legal Request', module: 'legal-requests' },
  { code: 'request.transition', name: 'تغيير حالة الطلب', nameEn: 'Transition Legal Request', module: 'legal-requests' },
  { code: 'request.delete', name: 'حذف طلب قانوني', nameEn: 'Delete Legal Request', module: 'legal-requests' },
  // Matters
  { code: 'matter.create', name: 'إنشاء قضية', nameEn: 'Create Matter', module: 'matters' },
  { code: 'matter.read', name: 'عرض القضايا', nameEn: 'Read Matters', module: 'matters' },
  { code: 'matter.update', name: 'تعديل قضية', nameEn: 'Update Matter', module: 'matters' },
  { code: 'matter.transition', name: 'تغيير حالة القضية', nameEn: 'Transition Matter', module: 'matters' },
  { code: 'matter.convert', name: 'تحويل طلب إلى قضية', nameEn: 'Convert Request to Matter', module: 'matters' },
  // Conflict Checks
  { code: 'conflict_check.create', name: 'إنشاء فحص تعارض', nameEn: 'Create Conflict Check', module: 'conflict-checks' },
  { code: 'conflict_check.read', name: 'عرض فحوصات التعارض', nameEn: 'Read Conflict Checks', module: 'conflict-checks' },
  { code: 'conflict_check.update', name: 'تعديل فحص تعارض', nameEn: 'Update Conflict Check', module: 'conflict-checks' },
  { code: 'conflict_check.transition', name: 'تغيير حالة فحص التعارض', nameEn: 'Transition Conflict Check', module: 'conflict-checks' },
  // ─── Phase 3: Contracts ────────────────────────────────────
  { code: 'contract.create', name: 'إنشاء عقد', nameEn: 'Create Contract', module: 'contracts' },
  { code: 'contract.read', name: 'عرض العقود', nameEn: 'Read Contracts', module: 'contracts' },
  { code: 'contract.update', name: 'تعديل عقد', nameEn: 'Update Contract', module: 'contracts' },
  { code: 'contract.transition', name: 'تغيير حالة العقد', nameEn: 'Transition Contract', module: 'contracts' },
  { code: 'contract.delete', name: 'حذف عقد', nameEn: 'Delete Contract', module: 'contracts' },
  { code: 'contract.party.manage', name: 'إدارة أطراف العقد', nameEn: 'Manage Contract Parties', module: 'contracts' },
  { code: 'contract.value.manage', name: 'إدارة قيم العقد', nameEn: 'Manage Contract Values', module: 'contracts' },
  { code: 'contract.signature.manage', name: 'إدارة توقيعات العقد', nameEn: 'Manage Contract Signatures', module: 'contracts' },
];

// ─── Role → Permission mapping ─────────────────────────────

const ROLE_PERMISSIONS: Record<string, string[]> = {
  enterprise_owner: [
    'organization.read', 'organization.update', 'organization.settings',
    'entity.create', 'entity.read', 'entity.update',
    'department.create', 'department.read',
    'user.create', 'user.read', 'user.update', 'user.deactivate',
    'role.assign', 'country_pack.activate', 'audit.read',
    // Phase 2
    'request.create', 'request.read', 'request.update', 'request.transition', 'request.delete',
    'matter.create', 'matter.read', 'matter.update', 'matter.transition', 'matter.convert',
    'conflict_check.create', 'conflict_check.read', 'conflict_check.update', 'conflict_check.transition',
    // Phase 3
    'contract.create', 'contract.read', 'contract.update', 'contract.transition', 'contract.delete',
    'contract.party.manage', 'contract.value.manage', 'contract.signature.manage',
  ],
  legal_admin: [
    'organization.read', 'organization.settings',
    'entity.create', 'entity.read', 'entity.update',
    'department.create', 'department.read',
    'user.create', 'user.read', 'user.update',
    'role.assign', 'audit.read',
    // Phase 2
    'request.create', 'request.read', 'request.update', 'request.transition', 'request.delete',
    'matter.create', 'matter.read', 'matter.update', 'matter.transition', 'matter.convert',
    'conflict_check.create', 'conflict_check.read', 'conflict_check.update', 'conflict_check.transition',
    // Phase 3
    'contract.create', 'contract.read', 'contract.update', 'contract.transition', 'contract.delete',
    'contract.party.manage', 'contract.value.manage', 'contract.signature.manage',
  ],
  general_counsel: [
    'organization.read',
    'entity.read', 'department.read', 'user.read', 'audit.read',
    // Phase 2
    'request.read', 'request.transition',
    'matter.read', 'matter.update', 'matter.transition',
    'conflict_check.read', 'conflict_check.transition',
    // Phase 3
    'contract.read', 'contract.update', 'contract.transition',
    'contract.party.manage', 'contract.value.manage', 'contract.signature.manage',
  ],
  lawyer: [
    'organization.read', 'entity.read', 'department.read',
    // Phase 2
    'request.read', 'request.update', 'request.transition',
    'matter.read', 'matter.update', 'matter.transition',
    'conflict_check.read', 'conflict_check.update', 'conflict_check.transition',
    // Phase 3
    'contract.read', 'contract.update', 'contract.transition',
    'contract.party.manage', 'contract.value.manage', 'contract.signature.manage',
  ],
  contract_manager: [
    'organization.read', 'entity.read', 'department.read',
    // Phase 2
    'request.read',
    'matter.read',
    'conflict_check.read',
    // Phase 3 — contract managers are the primary contract users
    'contract.create', 'contract.read', 'contract.update', 'contract.transition',
    'contract.party.manage', 'contract.value.manage', 'contract.signature.manage',
  ],
  business_requester: [
    'organization.read',
    // Phase 2 — business users can submit and read their own requests
    'request.create', 'request.read',
  ],
  finance_approver: [
    'organization.read', 'audit.read',
    // Phase 2
    'matter.read',
    'request.read',
    // Phase 3 — finance can see contract values
    'contract.read',
  ],
  executive_approver: [
    'organization.read', 'audit.read',
    // Phase 2 — read-only visibility for executive oversight
    'matter.read',
    'request.read',
    // Phase 3 — read-only contract visibility
    'contract.read',
  ],
  auditor: [
    'organization.read', 'entity.read', 'department.read', 'user.read', 'audit.read',
    // Phase 2 — auditors see everything but change nothing
    'request.read',
    'matter.read',
    'conflict_check.read',
    // Phase 3
    'contract.read',
  ],
  platform_admin: [
    'organization.read', 'organization.update', 'organization.settings',
    'entity.create', 'entity.read', 'entity.update',
    'department.create', 'department.read',
    'user.create', 'user.read', 'user.update', 'user.deactivate',
    'role.assign', 'country_pack.activate', 'audit.read',
    // Phase 2
    'request.create', 'request.read', 'request.update', 'request.transition', 'request.delete',
    'matter.create', 'matter.read', 'matter.update', 'matter.transition', 'matter.convert',
    'conflict_check.create', 'conflict_check.read', 'conflict_check.update', 'conflict_check.transition',
    // Phase 3
    'contract.create', 'contract.read', 'contract.update', 'contract.transition', 'contract.delete',
    'contract.party.manage', 'contract.value.manage', 'contract.signature.manage',
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

  // 10. Phase 2 sample data — Legal Requests, Matters, Conflict Checks
  // These are demo records for development/testing only. NO real PII.
  console.log('  → Phase 2 sample data');

  const owner = await prisma.user.findUnique({
    where: { organizationId_email: { organizationId: org.id, email: DEMO_OWNER.email } },
  });
  const lawyer = await prisma.user.findUnique({
    where: { organizationId_email: { organizationId: org.id, email: DEMO_LAWYER.email } },
  });

  if (owner && lawyer) {
    // 10a. Three sample legal requests in different states
    const req1 = await prisma.legalRequest.create({
      data: {
        organizationId: org.id,
        entityId: entity.id,
        requestNumber: `REQ-${new Date().getUTCFullYear()}-0001`,
        title: 'مراجعة عقد توريد',
        titleEn: 'Supply Contract Review',
        description: 'طلب مراجعة عقد توريد مع مورد جديد قبل التوقيع',
        type: 'contract_review',
        priority: 'high',
        status: 'draft',
        requestedBy: owner.id,
        assignedTo: lawyer.id,
        classification: 'internal',
      },
    }).catch(() => null);
    console.log(`    → Request: ${req1?.requestNumber ?? 'REQ-0001 (exists)'}`);

    const req2 = await prisma.legalRequest.create({
      data: {
        organizationId: org.id,
        entityId: entity.id,
        requestNumber: `REQ-${new Date().getUTCFullYear()}-0002`,
        title: 'استشارة قانونية حول الامتثال الضريبي',
        titleEn: 'Tax Compliance Inquiry',
        description: 'استفسار حول المتطلبات الضريبية للكيان',
        type: 'compliance_inquiry',
        priority: 'medium',
        status: 'submitted',
        requestedBy: owner.id,
        assignedTo: lawyer.id,
        classification: 'confidential',
      },
    }).catch(() => null);
    console.log(`    → Request: ${req2?.requestNumber ?? 'REQ-0002 (exists)'}`);

    const req3 = await prisma.legalRequest.create({
      data: {
        organizationId: org.id,
        entityId: entity.id,
        requestNumber: `REQ-${new Date().getUTCFullYear()}-0003`,
        title: 'نزاع تجاري مع مورد',
        titleEn: 'Commercial Dispute with Supplier',
        description: 'نزاع يتعلق بتأخر تسليم بضائع',
        type: 'dispute',
        priority: 'urgent',
        status: 'in_progress',
        requestedBy: owner.id,
        assignedTo: lawyer.id,
        classification: 'restricted',
      },
    }).catch(() => null);
    console.log(`    → Request: ${req3?.requestNumber ?? 'REQ-0003 (exists)'}`);

    // 10b. Two sample matters
    const matter1 = await prisma.matter.create({
      data: {
        organizationId: org.id,
        entityId: entity.id,
        matterNumber: `MTR-${new Date().getUTCFullYear()}-0001`,
        title: 'قضية نزاع تجاري - مورد',
        titleEn: 'Commercial Dispute Matter - Supplier',
        description: 'قضية نزاع مع مورد بشأن تأخر التسليم',
        type: 'litigation',
        status: 'in_progress',
        priority: 'high',
        assignedTo: lawyer.id,
        responsibleUser: lawyer.id,
        classification: 'restricted',
      },
    }).catch(() => null);
    console.log(`    → Matter: ${matter1?.matterNumber ?? 'MTR-0001 (exists)'}`);

    const matter2 = await prisma.matter.create({
      data: {
        organizationId: org.id,
        entityId: entity.id,
        matterNumber: `MTR-${new Date().getUTCFullYear()}-0002`,
        title: 'مراجعة عقد إيجار',
        titleEn: 'Lease Agreement Review',
        description: 'مراجعة شروط عقد إيجار فرع جديد',
        type: 'contract_review',
        status: 'open',
        priority: 'medium',
        assignedTo: lawyer.id,
        classification: 'internal',
      },
    }).catch(() => null);
    console.log(`    → Matter: ${matter2?.matterNumber ?? 'MTR-0002 (exists)'}`);

    // 10c. Link one request to matter1 (if both exist)
    if (req3 && matter1) {
      await prisma.legalRequestMatterLink.create({
        data: { requestId: req3.id, matterId: matter1.id, linkedBy: owner.id },
      }).catch(() => { /* already linked */ });
      console.log(`    → Link: ${req3.requestNumber} ↔ ${matter1.matterNumber}`);
    }

    // 10d. One sample conflict check on matter1 (administrative-only, no AI)
    if (matter1) {
      await prisma.conflictCheck.create({
        data: {
          organizationId: org.id,
          parentType: 'matter',
          parentId: matter1.id,
          status: 'not_checked',
          names: [
            { name: 'شركة الموردين المتحدون', nameEn: 'United Suppliers Co.' },
            { name: 'مؤسسة التجارة الحديثة', nameEn: 'Modern Trade Establishment' },
          ],
          registrationNumbers: ['CR-2024-001234', 'CR-2024-005678'],
          notes: 'فحص تعارض قبل بدء الإجراءات القانونية',
        },
      }).catch(() => { /* already exists */ });
      console.log(`    → Conflict check on ${matter1.matterNumber}`);
    }
  }

  // 11. Phase 3 sample data — Contracts
  console.log('  → Phase 3 sample data: Contracts');

  if (owner && lawyer && entity) {
    // 11a. Two sample contracts in different states
    const contract1 = await prisma.contract.create({
      data: {
        organizationId: org.id,
        entityId: entity.id,
        contractNumber: `CTR-${new Date().getUTCFullYear()}-0001`,
        title: 'اتفاقية عدم إفصاح - شركة الموردين المتحدون',
        titleEn: 'NDA - United Suppliers Co.',
        description: 'اتفاقية عدم إفصاح متبادل مع شركة الموردين المتحدون قبل بدء المفاوضات',
        type: 'nda',
        category: 'nda',
        status: 'draft',
        priority: 'medium',
        counterpartyName: 'شركة الموردين المتحدون',
        counterpartyNameEn: 'United Suppliers Co.',
        totalValue: null,
        totalCurrency: 'JOD',
        assignedTo: lawyer.id,
        createdBy: owner.id,
        classification: 'confidential',
      },
    }).catch(() => null);
    console.log(`    → Contract: ${contract1?.contractNumber ?? 'CTR-0001 (exists)'}`);

    const contract2 = await prisma.contract.create({
      data: {
        organizationId: org.id,
        entityId: entity.id,
        matterId: matter1?.id ?? null,
        contractNumber: `CTR-${new Date().getUTCFullYear()}-0002`,
        title: 'عقد توريد سنوي - معدات تقنية',
        titleEn: 'Annual Supply Contract - Tech Equipment',
        description: 'عقد توريد معدات تقنية لمدة سنة مع شركة التقنية الحديثة',
        type: 'vendor_agreement',
        category: 'vendor',
        status: 'pending_signature',
        priority: 'high',
        effectiveDate: new Date('2026-01-01'),
        expiryDate: new Date('2026-12-31'),
        counterpartyName: 'شركة التقنية الحديثة',
        counterpartyNameEn: 'Modern Tech Co.',
        totalValue: 75000,
        totalCurrency: 'JOD',
        assignedTo: lawyer.id,
        createdBy: owner.id,
        classification: 'internal',
      },
    }).catch(() => null);
    console.log(`    → Contract: ${contract2?.contractNumber ?? 'CTR-0002 (exists)'}`);

    // 11b. Add parties to contract2 (if it was created)
    if (contract2) {
      await prisma.contractParty.create({
        data: {
          contractId: contract2.id,
          organizationId: org.id,
          partyType: 'internal',
          entityId: entity.id,
          name: entity.name,
          nameEn: entity.nameEn,
          role: 'buyer',
          registrationNo: entity.registrationNo,
        },
      }).catch(() => { /* already exists */ });

      await prisma.contractParty.create({
        data: {
          contractId: contract2.id,
          organizationId: org.id,
          partyType: 'external',
          name: 'شركة التقنية الحديثة',
          nameEn: 'Modern Tech Co.',
          role: 'seller',
          contactInfo: {
            email: 'legal@moderntech.example',
            phone: '+962-6-555-1234',
            address: 'عمان، الأردن',
          },
          registrationNo: 'CR-2024-009988',
          taxId: 'TAX-2024-5678',
        },
      }).catch(() => { /* already exists */ });
      console.log(`    → Parties added to ${contract2.contractNumber}`);
    }

    // 11c. Add value lines to contract2
    if (contract2) {
      await prisma.contractValue.create({
        data: {
          contractId: contract2.id,
          organizationId: org.id,
          valueType: 'base',
          description: ' Base price for tech equipment supply',
          amount: 75000,
          currency: 'JOD',
        },
      }).catch(() => { /* already exists */ });

      await prisma.contractValue.create({
        data: {
          contractId: contract2.id,
          organizationId: org.id,
          valueType: 'tax',
          description: 'VAT 16%',
          amount: 12000,
          currency: 'JOD',
        },
      }).catch(() => { /* already exists */ });
      console.log(`    → Values added to ${contract2.contractNumber}`);
    }

    // 11d. Add signatures to contract2 (pending)
    if (contract2) {
      await prisma.contractSignature.create({
        data: {
          contractId: contract2.id,
          organizationId: org.id,
          signerName: 'سعيد الحسيني',
          signerNameEn: 'Saeed Al-Husayni',
          signerTitle: 'CEO',
          signerUserId: owner.id,
          sequence: 1,
          status: 'pending',
        },
      }).catch(() => { /* already exists */ });

      await prisma.contractSignature.create({
        data: {
          contractId: contract2.id,
          organizationId: org.id,
          signerName: 'مدير التقنية الحديثة',
          signerNameEn: 'Modern Tech CEO',
          signerTitle: 'CEO',
          sequence: 2,
          status: 'pending',
        },
      }).catch(() => { /* already exists */ });
      console.log(`    → Signatures added to ${contract2.contractNumber}`);
    }
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
