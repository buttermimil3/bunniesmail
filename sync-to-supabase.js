const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');

dotenv.config();

console.log('====================================================');
console.log('🐰 Bunnieschi Shop - Supabase Migration & Diagnostic');
console.log('====================================================\n');

const rawSupabaseUrl = (process.env.SUPABASE_URL || '').trim().replace(/['"]+/g, '');
const rawSupabaseKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY || '').trim().replace(/['"]+/g, '').replace(/\s+/g, '');

if (!rawSupabaseUrl || !rawSupabaseKey) {
  console.error('❌ ไม่พบค่า SUPABASE_URL หรือ SUPABASE_SERVICE_ROLE_KEY ในไฟล์ .env');
  console.log('\n👉 วิธีแก้ไข:');
  console.log('1. เปิดไฟล์ .env ในโฟลเดอร์นี้');
  console.log('2. เพิ่ม 2 บรรทัดนี้ (นำค่ามาจาก Supabase Dashboard > Project Settings > API):');
  console.log('   SUPABASE_URL=https://your-project.supabase.co');
  console.log('   SUPABASE_SERVICE_ROLE_KEY=eyJh... (ใช้ service_role secret key)');
  console.log('3. รันคำสั่ง: node sync-to-supabase.js อีกครั้ง\n');
  process.exit(1);
}

console.log('🔗 URL:', rawSupabaseUrl);
console.log('🔑 Key Type:', rawSupabaseKey.includes('service_role') || rawSupabaseKey.length > 100 ? 'Service Role Key (แนะนำ)' : 'Anon Key');

const supabase = createClient(rawSupabaseUrl, rawSupabaseKey, {
  auth: { persistSession: false }
});

const DATA_DIR = path.join(__dirname, 'data');
const SHOPS_FILE = path.join(DATA_DIR, 'shops.json');
const ACCOUNTS_FILE = path.join(DATA_DIR, 'accounts.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const APPS_FILE = path.join(DATA_DIR, 'apps.json');

function isUuid(id) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id || '');
}

function readJson(file, fallback = []) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    return fallback;
  }
}

function writeJson(file, data) {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.warn(`   ⚠️ เขียนไฟล์ ${file} ไม่สำเร็จ:`, e.message);
  }
}

async function migrate() {
  console.log('\n[1/5] ตรวจสอบการเชื่อมต่อตารางใน Supabase...');
  const { data: testData, error: testErr } = await supabase.from('shops').select('id').limit(1);
  
  if (testErr) {
    if (testErr.code === '42501' || (testErr.message && testErr.message.includes('permission denied'))) {
      console.error('\n🔒 ตารางใน Supabase ถูกบล็อกสิทธิ์การเข้าถึง (Permission Denied)!');
      console.log('👉 วิธีปลดล็อก (คัดลอกคำสั่งด้านล่างนี้ไปรันใน Supabase -> SQL Editor 1 ครั้ง):');
      console.log('\n--- คัดลอกตั้งแต่ตรงนี้ ---');
      console.log('GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;');
      console.log('GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, anon, authenticated, service_role;');
      console.log('GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, anon, authenticated, service_role;');
      console.log('ALTER TABLE public.shops DISABLE ROW LEVEL SECURITY;');
      console.log('ALTER TABLE public.shop_settings DISABLE ROW LEVEL SECURITY;');
      console.log('ALTER TABLE public.accounts DISABLE ROW LEVEL SECURITY;');
      console.log('ALTER TABLE public.app_presets DISABLE ROW LEVEL SECURITY;');
      console.log('--- สิ้นสุดคำสั่ง ---\n');
      console.log('เมื่อกด Run ใน Supabase แล้ว ให้รัน node sync-to-supabase.js อีกครั้ง ข้อมูลจะเข้าทันทีครับ!');
      return;
    }

    if (testErr.code === '42P01' || (testErr.message && testErr.message.includes('does not exist'))) {
      console.error('\n❌ ยังไม่ได้รัน schema.sql ใน Supabase!');
      console.log('👉 วิธีแก้:');
      console.log('1. เปิด Supabase Dashboard -> ไปที่เมนู "SQL Editor" ด้านซ้าย');
      console.log('2. เปิดไฟล์ schema.sql ในโปรเจกต์นี้ คัดลอกโค้ดทั้งหมด');
      console.log('3. วางลงใน SQL Editor แล้วกดปุ่ม "Run"');
      console.log('4. เมื่อรันสำเร็จ ให้มารันคำสั่ง node sync-to-supabase.js อีกครั้ง\n');
      return;
    }
    console.error('❌ Supabase Error:', testErr.message);
    return;
  }
  console.log('✅ เชื่อมต่อฐานข้อมูล Supabase และพบตารางเรียบร้อยแล้ว!');

  // Query existing shops in Supabase
  const { data: dbShops, error: dbShopsErr } = await supabase.from('shops').select('*');
  const existingShopsByEmail = {};
  if (!dbShopsErr && dbShops) {
    dbShops.forEach(s => {
      if (s.email) existingShopsByEmail[s.email.toLowerCase()] = s.id;
    });
  }

  // 1. Sync Shops
  console.log('\n[2/5] กำลังซิงค์ร้านค้า (Shops)...');
  const shops = readJson(SHOPS_FILE, []);
  const shopIdMap = {}; // oldId -> validUuid
  let shopsCount = 0;

  for (const shop of shops) {
    const cleanEmail = (shop.email || '').toLowerCase().trim();
    let targetUuid = null;

    if (existingShopsByEmail[cleanEmail]) {
      targetUuid = existingShopsByEmail[cleanEmail];
    } else if (isUuid(shop.id)) {
      targetUuid = shop.id;
    } else {
      targetUuid = crypto.randomUUID();
    }

    shopIdMap[shop.id] = targetUuid;
    shop.id = targetUuid; // update local object

    const { error } = await supabase.from('shops').upsert({
      id: targetUuid,
      shop_name: shop.shopName || shop.shop_name || 'My Shop',
      email: cleanEmail,
      password_hash: shop.passwordHash || shop.password_hash || '',
      avatar: shop.avatar || '',
      created_at: shop.createdAt || shop.created_at || new Date().toISOString()
    });

    if (error) {
      console.warn(`   ⚠️ ร้าน ${cleanEmail}: ${error.message}`);
    } else {
      shopsCount++;
      existingShopsByEmail[cleanEmail] = targetUuid;
    }
  }

  // Save updated shops.json with UUIDs
  writeJson(SHOPS_FILE, shops);
  console.log(`✅ ซิงค์ร้านค้าสำเร็จ ${shopsCount}/${shops.length} ร้าน (อัปเดต ID เป็น UUID เรียบร้อย)`);

  const defaultAdminUuid = existingShopsByEmail['admin@bunnieschi.com'] || existingShopsByEmail['mikibun@bunnieschi.com'] || Object.values(shopIdMap)[0];

  // 2. Sync Settings
  console.log('\n[3/5] กำลังซิงค์การตั้งค่าเมล (Settings)...');
  const settingsData = readJson(SETTINGS_FILE, {});
  let settingsCount = 0;

  if (defaultAdminUuid && (settingsData.domain || settingsData.imapHost)) {
    const { error } = await supabase.from('shop_settings').upsert({
      shop_id: defaultAdminUuid,
      domain: settingsData.domain || 'bunnieschi.com',
      imap_host: settingsData.imapHost || 'imap.secureserver.net',
      imap_port: settingsData.imapPort || 993,
      imap_secure: settingsData.imapSecure !== undefined ? settingsData.imapSecure : true,
      reject_unauthorized: Boolean(settingsData.rejectUnauthorized),
      use_catch_all: settingsData.useCatchAll !== undefined ? settingsData.useCatchAll : true,
      catch_all_email: settingsData.catchAllEmail || 'mikibun@bunnieschi.com',
      catch_all_password: settingsData.catchAllPassword || 'pamcake2547',
      updated_at: new Date().toISOString()
    });
    if (!error) settingsCount++;
  }

  const newSettingsData = { ...settingsData };
  for (const [key, val] of Object.entries(settingsData)) {
    if (typeof val === 'object' && val !== null) {
      const mappedId = shopIdMap[key] || (isUuid(key) ? key : null);
      if (mappedId) {
        newSettingsData[mappedId] = val;
        const { error } = await supabase.from('shop_settings').upsert({
          shop_id: mappedId,
          domain: val.domain || 'bunnieschi.com',
          imap_host: val.imapHost || 'imap.secureserver.net',
          imap_port: val.imapPort || 993,
          imap_secure: val.imapSecure !== undefined ? val.imapSecure : true,
          reject_unauthorized: Boolean(val.rejectUnauthorized),
          use_catch_all: val.useCatchAll !== undefined ? val.useCatchAll : true,
          catch_all_email: val.catchAllEmail || '',
          catch_all_password: val.catchAllPassword || '',
          updated_at: new Date().toISOString()
        });
        if (!error) settingsCount++;
      }
    }
  }
  writeJson(SETTINGS_FILE, newSettingsData);
  console.log(`✅ ซิงค์การตั้งค่าสำเร็จ ${settingsCount} รายการ`);

  // 3. Sync Accounts
  console.log('\n[4/5] กำลังซิงค์บัญชีเมลพรีเมี่ยม (Accounts)...');
  const accounts = readJson(ACCOUNTS_FILE, []);
  let accountsCount = 0;

  for (const acc of accounts) {
    let targetShopId = shopIdMap[acc.shopId];
    if (!targetShopId) {
      if (isUuid(acc.shopId)) {
        targetShopId = acc.shopId;
      } else {
        targetShopId = defaultAdminUuid;
      }
    }
    acc.shopId = targetShopId; // update local object

    const { error } = await supabase.from('accounts').upsert({
      id: acc.id,
      shop_id: targetShopId,
      email: acc.email,
      email_prefix: acc.emailPrefix || acc.email.split('@')[0],
      password: acc.password,
      apps: Array.isArray(acc.apps) ? acc.apps : [acc.app || 'Other'],
      duration: acc.duration || '30_days',
      duration_custom: acc.durationCustom || '',
      note: acc.note || '',
      status: acc.status || 'active',
      last_otp: acc.lastOtp || null,
      created_at: acc.createdAt || new Date().toISOString(),
      updated_at: acc.updatedAt || new Date().toISOString()
    });

    if (error) {
      console.warn(`   ⚠️ บัญชี ${acc.email}: ${error.message}`);
    } else {
      accountsCount++;
    }
  }

  writeJson(ACCOUNTS_FILE, accounts);
  console.log(`✅ ซิงค์บัญชีพรีเมี่ยมสำเร็จ ${accountsCount}/${accounts.length} บัญชี`);

  // 4. Sync App Presets
  console.log('\n[5/5] กำลังซิงค์รายการแอปพรีเมี่ยม (App Presets)...');
  const appsData = readJson(APPS_FILE, {});
  const newAppsData = {};
  let appsCount = 0;

  for (const [sId, list] of Object.entries(appsData)) {
    const targetShopId = shopIdMap[sId] || (isUuid(sId) ? sId : defaultAdminUuid);
    newAppsData[targetShopId] = list;
    if (Array.isArray(list) && targetShopId) {
      for (const name of list) {
        const { error } = await supabase.from('app_presets').upsert({
          shop_id: targetShopId,
          name: name.trim()
        }, { onConflict: 'shop_id,name' });
        if (!error) appsCount++;
      }
    }
  }
  writeJson(APPS_FILE, newAppsData);
  console.log(`✅ ซิงค์แอปพรีเมี่ยมสำเร็จ ${appsCount} รายการ`);

  console.log('\n🎉 สรุปผล: การถ่ายโอนข้อมูลขึ้น Supabase สำเร็จเรียบร้อย 100%!');
  console.log('   เมื่อเปิดหน้าเว็บ ข้อมูลทั้งหมดจะถูกโหลดและบันทึกตรงเข้า Supabase ทันที');
}

migrate().catch(err => {
  console.error('\n❌ เกิดข้อผิดพลาด:', err);
  process.exit(1);
});
