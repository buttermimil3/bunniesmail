const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

let rawSupabaseUrl = (process.env.SUPABASE_URL || '').trim().replace(/['"]+/g, '');
let rawSupabaseKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY || '').trim().replace(/['"]+/g, '').replace(/\s+/g, '');

// Auto-correct common user typos
rawSupabaseUrl = rawSupabaseUrl.replace(/\.supabase\.com/g, '.supabase.co');
rawSupabaseUrl = rawSupabaseUrl.replace(/jrpbayeumop/g, 'jrpbaueumop');
rawSupabaseUrl = rawSupabaseUrl.replace(/\/+$/, '');

function isValidSupabaseUrl(url) {
  if (!url) return false;
  if (url.includes('วางค่า') || url.includes('Project URL') || url.includes('(') || url.includes(')')) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch (e) {
    return false;
  }
}

function isValidSupabaseKey(key) {
  if (!key) return false;
  if (key.includes('วางค่า') || key.includes('service_role') || key.includes('(') || key.includes(')')) return false;
  return key.length >= 20;
}

const isSupabaseEnabled = isValidSupabaseUrl(rawSupabaseUrl) && isValidSupabaseKey(rawSupabaseKey);

let supabase = null;
if (isSupabaseEnabled) {
  try {
    supabase = createClient(rawSupabaseUrl, rawSupabaseKey, {
      auth: { persistSession: false }
    });
    console.log('[Database] Supabase client initialized with URL:', rawSupabaseUrl);
  } catch (err) {
    console.warn('[Database] Failed to initialize Supabase client:', err.message);
    supabase = null;
  }
} else {
  console.log('[Database] Using Local JSON Storage (Supabase not configured)');
}

// Local Storage Setup (Supports local filesystem and Vercel /tmp)
const DATA_DIR = (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME)
  ? path.join('/tmp', 'data')
  : path.join(__dirname, 'data');
const SHOPS_FILE = path.join(DATA_DIR, 'shops.json');
const ACCOUNTS_FILE = path.join(DATA_DIR, 'accounts.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const APPS_FILE = path.join(DATA_DIR, 'apps.json');

try {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(SHOPS_FILE)) fs.writeFileSync(SHOPS_FILE, JSON.stringify([], null, 2));
  if (!fs.existsSync(ACCOUNTS_FILE)) fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify([], null, 2));
  if (!fs.existsSync(SETTINGS_FILE)) fs.writeFileSync(SETTINGS_FILE, JSON.stringify({}, null, 2));
  if (!fs.existsSync(APPS_FILE)) fs.writeFileSync(APPS_FILE, JSON.stringify({}, null, 2));
} catch (e) {
  console.warn('[Database] Warning creating data files:', e.message);
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
    console.warn('[Database] Warning writing JSON file:', e.message);
  }
}

function hashPassword(str) {
  return crypto.createHash('sha256').update(str).digest('hex');
}

const DEFAULT_APPS = [
  'Netflix', 'Spotify', 'Canva Pro', 'YouTube Premium',
  'ChatGPT', 'Claude AI', 'Disney+', 'Viu', 'iQIYI', 'Prime Video'
];

function isSupabaseConfigured() {
  return Boolean(isSupabaseEnabled && supabase);
}

function getSupabaseClient() {
  return supabase;
}

// ====================================================================
// SHOPS & SUPABASE AUTHENTICATION
// ====================================================================

function getShopByEmailLocal(cleanEmail) {
  const shops = readJson(SHOPS_FILE, []);
  return shops.find(s => (s.email || '').toLowerCase() === cleanEmail) || null;
}

async function getShopByEmail(email) {
  const cleanEmail = (email || '').trim().toLowerCase();
  if (isSupabaseEnabled && supabase) {
    try {
      const { data, error } = await supabase
        .from('shops')
        .select('*')
        .ilike('email', cleanEmail)
        .maybeSingle();

      if (error) {
        console.warn('[Database] Supabase getShopByEmail error:', error.message);
        return getShopByEmailLocal(cleanEmail);
      }
      if (!data) return null;
      return {
        id: data.id,
        shopName: data.shop_name,
        email: data.email,
        passwordHash: data.password_hash,
        avatar: data.avatar || '',
        createdAt: data.created_at
      };
    } catch (err) {
      console.warn('[Database] Supabase getShopByEmail failed, using local:', err.message);
      return getShopByEmailLocal(cleanEmail);
    }
  }
  return getShopByEmailLocal(cleanEmail);
}

function getShopByIdLocal(shopId) {
  const shops = readJson(SHOPS_FILE, []);
  return shops.find(s => s.id === shopId) || null;
}

async function getShopById(shopId) {
  if (isSupabaseEnabled && supabase) {
    try {
      const { data, error } = await supabase
        .from('shops')
        .select('*')
        .eq('id', shopId)
        .maybeSingle();
      if (!error && data) {
        return {
          id: data.id,
          shopName: data.shop_name,
          email: data.email,
          avatar: data.avatar || '',
          createdAt: data.created_at
        };
      }
    } catch (err) {
      console.warn('[Database] Supabase getShopById error:', err.message);
    }
  }
  return getShopByIdLocal(shopId);
}

// Register Shop User in Supabase Authentication (auth.users) AND Table (public.shops)
async function registerShopUser({ shopName, email, password, passwordHash, avatar = '' }) {
  const cleanEmail = (email || '').trim().toLowerCase();
  const cleanName = (shopName || '').trim();
  const rawPass = password ? password.trim() : (passwordHash ? 'bunnies123' : 'bunnies123');
  const now = new Date().toISOString();

  let authUserId = null;

  // 1. Create in Supabase Authentication (auth.users)
  if (isSupabaseEnabled && supabase) {
    let authCreated = false;
    let authErrorMessage = '';

    // Method A: Admin API (Immediate confirmed user in Supabase Auth -> Users)
    try {
      const adminRes = await supabase.auth.admin.createUser({
        email: cleanEmail,
        password: rawPass,
        email_confirm: true,
        user_metadata: {
          shop_name: cleanName,
          avatar: avatar || ''
        }
      });

      if (adminRes.data && adminRes.data.user) {
        authUserId = adminRes.data.user.id;
        authCreated = true;
        console.log('[Supabase Auth] Successfully created user in auth.users:', authUserId);
      } else if (adminRes.error) {
        authErrorMessage = adminRes.error.message;
        console.warn('[Supabase Auth] admin.createUser returned:', adminRes.error.message);
      }
    } catch (e) {
      authErrorMessage = e.message;
      console.warn('[Supabase Auth] admin.createUser exception:', e.message);
    }

    // Method B: Client SignUp (if admin API is restricted)
    if (!authCreated) {
      try {
        const signUpRes = await supabase.auth.signUp({
          email: cleanEmail,
          password: rawPass,
          options: {
            data: {
              shop_name: cleanName,
              avatar: avatar || ''
            }
          }
        });

        if (signUpRes.data && signUpRes.data.user) {
          authUserId = signUpRes.data.user.id;
          authCreated = true;
          console.log('[Supabase Auth] Successfully registered user via signUp in auth.users:', authUserId);
        } else if (signUpRes.error) {
          authErrorMessage = signUpRes.error.message;
        }
      } catch (signUpErr) {
        authErrorMessage = signUpErr.message;
      }
    }

    // If Supabase was expected to work but failed with a real auth error (e.g. invalid key, duplicate email)
    if (!authCreated) {
      throw new Error(`Supabase Auth ไม่สามารถสร้างบัญชีได้: ${authErrorMessage || 'โปรดตรวจสอบการเชื่อมต่อ Supabase'}`);
    }
  }

  // Consistent ID: Use Supabase Auth UID if created, otherwise generate unique ID
  const shopId = authUserId || ('shop_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 5));

  // 2. Insert into public.shops table in Supabase
  if (isSupabaseEnabled && supabase) {
    try {
      const insertData = {
        id: shopId,
        shop_name: cleanName,
        email: cleanEmail,
        password_hash: hashPassword(rawPass),
        avatar: avatar || ''
      };
      const { error: shopErr } = await supabase.from('shops').upsert(insertData);
      if (shopErr) {
        console.warn('[Supabase DB] public.shops upsert notice:', shopErr.message);
      }
    } catch (err) {
      console.warn('[Supabase DB] public.shops upsert error:', err.message);
    }
  }

  const newShop = {
    id: shopId,
    shopName: cleanName,
    email: cleanEmail,
    passwordHash: hashPassword(rawPass),
    avatar: avatar || '',
    createdAt: now
  };

  // Always mirror to local file
  const shops = readJson(SHOPS_FILE, []);
  const existingIdx = shops.findIndex(s => (s.email || '').toLowerCase() === cleanEmail);
  if (existingIdx >= 0) {
    shops[existingIdx] = newShop;
  } else {
    shops.push(newShop);
  }
  writeJson(SHOPS_FILE, shops);

  return newShop;
}

async function updateShopProfile(shopId, { avatar, shopName }) {
  let updatedShop = null;

  if (isSupabaseEnabled && supabase) {
    try {
      const payload = {};
      if (avatar !== undefined) payload.avatar = avatar;
      if (shopName) payload.shop_name = shopName.trim();

      const { data, error } = await supabase
        .from('shops')
        .update(payload)
        .eq('id', shopId)
        .select()
        .maybeSingle();

      if (!error && data) {
        updatedShop = {
          id: data.id,
          shopName: data.shop_name,
          email: data.email,
          avatar: data.avatar || '',
          createdAt: data.created_at
        };
      }
    } catch (err) {
      console.warn('[Database] Supabase updateShopProfile error:', err.message);
    }
  }

  // Update local storage
  const shops = readJson(SHOPS_FILE, []);
  const shop = shops.find(s => s.id === shopId);
  if (shop) {
    if (avatar !== undefined) shop.avatar = avatar;
    if (shopName) shop.shopName = shopName.trim();
    writeJson(SHOPS_FILE, shops);
    if (!updatedShop) updatedShop = shop;
  }

  return updatedShop || { id: shopId, avatar, shopName };
}

// ====================================================================
// ACCOUNTS (Scoped by shopId)
// ====================================================================

function getAccountsLocal(shopId, { q, app, duration, status } = {}) {
  let accounts = readJson(ACCOUNTS_FILE, []);
  accounts = accounts.filter(a => a.shopId === shopId);

  if (q && q.trim()) {
    const term = q.trim().toLowerCase();
    accounts = accounts.filter(a =>
      (a.email || '').toLowerCase().includes(term) ||
      (a.note && a.note.toLowerCase().includes(term)) ||
      (Array.isArray(a.apps) && a.apps.some(x => (x || '').toLowerCase().includes(term)))
    );
  }

  if (app && app !== 'all') {
    const term = app.toLowerCase();
    accounts = accounts.filter(a => {
      const list = Array.isArray(a.apps) ? a.apps : [a.app || ''];
      return list.some(x => (x || '').toLowerCase() === term);
    });
  }

  if (duration && duration !== 'all') {
    accounts = accounts.filter(a => {
      if (duration === '30_days') return !a.duration || a.duration === '30_days';
      return a.duration === duration;
    });
  }

  if (status && status !== 'all') {
    accounts = accounts.filter(a => a.status === status);
  }

  return accounts;
}

async function getAccounts(shopId, { q, app, duration, status } = {}) {
  if (isSupabaseEnabled && supabase) {
    try {
      let query = supabase
        .from('accounts')
        .select('*')
        .eq('shop_id', shopId)
        .order('created_at', { ascending: false });

      if (duration && duration !== 'all') {
        query = query.eq('duration', duration);
      }
      if (status && status !== 'all') {
        query = query.eq('status', status);
      }

      const { data, error } = await query;
      if (error) {
        console.warn('[Database] Supabase getAccounts error, falling back:', error.message);
        return getAccountsLocal(shopId, { q, app, duration, status });
      }

      let results = (data || []).map(row => ({
        id: row.id,
        shopId: row.shop_id,
        email: row.email,
        emailPrefix: row.email_prefix,
        password: row.password,
        apps: Array.isArray(row.apps) ? row.apps : [row.apps || 'Other'],
        app: Array.isArray(row.apps) ? row.apps[0] || 'Other' : row.apps,
        duration: row.duration,
        durationCustom: row.duration_custom,
        note: row.note,
        status: row.status,
        lastOtp: row.last_otp,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }));

      if (app && app !== 'all') {
        const term = app.toLowerCase();
        results = results.filter(a => a.apps.some(x => x.toLowerCase() === term));
      }

      if (q && q.trim()) {
        const term = q.trim().toLowerCase();
        results = results.filter(a =>
          (a.email || '').toLowerCase().includes(term) ||
          (a.note && a.note.toLowerCase().includes(term)) ||
          a.apps.some(x => (x || '').toLowerCase() === term)
        );
      }

      return results;
    } catch (err) {
      console.warn('[Database] Supabase getAccounts failed, using local:', err.message);
      return getAccountsLocal(shopId, { q, app, duration, status });
    }
  }
  return getAccountsLocal(shopId, { q, app, duration, status });
}

async function getAccountById(shopId, accountId) {
  if (isSupabaseEnabled && supabase) {
    try {
      const { data, error } = await supabase
        .from('accounts')
        .select('*')
        .eq('shop_id', shopId)
        .eq('id', accountId)
        .maybeSingle();

      if (!error && data) {
        return {
          id: data.id,
          shopId: data.shop_id,
          email: data.email,
          emailPrefix: data.email_prefix,
          password: data.password,
          apps: Array.isArray(data.apps) ? data.apps : [data.apps || 'Other'],
          duration: data.duration,
          durationCustom: data.duration_custom,
          note: data.note,
          status: data.status,
          lastOtp: data.last_otp,
          createdAt: data.created_at
        };
      }
    } catch (err) {
      console.warn('[Database] Supabase getAccountById error:', err.message);
    }
  }
  const accounts = readJson(ACCOUNTS_FILE, []);
  return accounts.find(a => a.shopId === shopId && a.id === accountId) || null;
}

async function createAccount(shopId, accountData) {
  if (isSupabaseEnabled && supabase) {
    try {
      const { error } = await supabase
        .from('accounts')
        .insert({
          id: accountData.id,
          shop_id: shopId,
          email: accountData.email,
          email_prefix: accountData.emailPrefix,
          password: accountData.password,
          apps: accountData.apps,
          duration: accountData.duration,
          duration_custom: accountData.durationCustom,
          note: accountData.note,
          status: accountData.status
        });
      if (error) {
        console.warn('[Database] Supabase createAccount notice:', error.message);
      }
    } catch (err) {
      console.warn('[Database] Supabase createAccount error, continuing locally:', err.message);
    }
  }

  // Dual-write locally
  const accounts = readJson(ACCOUNTS_FILE, []);
  const newRecord = { ...accountData, shopId };
  accounts.unshift(newRecord);
  writeJson(ACCOUNTS_FILE, accounts);
  return newRecord;
}

async function updateAccount(shopId, accountId, updates) {
  if (isSupabaseEnabled && supabase) {
    try {
      const payload = {};
      if (updates.password !== undefined) payload.password = updates.password;
      if (updates.apps !== undefined) payload.apps = updates.apps;
      if (updates.duration !== undefined) payload.duration = updates.duration;
      if (updates.durationCustom !== undefined) payload.duration_custom = updates.durationCustom;
      if (updates.note !== undefined) payload.note = updates.note;
      if (updates.status !== undefined) payload.status = updates.status;
      if (updates.lastOtp !== undefined) payload.last_otp = updates.lastOtp;
      payload.updated_at = new Date().toISOString();

      await supabase
        .from('accounts')
        .update(payload)
        .eq('shop_id', shopId)
        .eq('id', accountId);
    } catch (err) {
      console.warn('[Database] Supabase updateAccount error:', err.message);
    }
  }

  // Update locally
  const accounts = readJson(ACCOUNTS_FILE, []);
  const idx = accounts.findIndex(a => a.shopId === shopId && a.id === accountId);
  if (idx === -1) return null;
  accounts[idx] = { ...accounts[idx], ...updates, updatedAt: new Date().toISOString() };
  writeJson(ACCOUNTS_FILE, accounts);
  return accounts[idx];
}

async function deleteAccount(shopId, accountId) {
  if (isSupabaseEnabled && supabase) {
    try {
      await supabase
        .from('accounts')
        .delete()
        .eq('shop_id', shopId)
        .eq('id', accountId);
    } catch (err) {
      console.warn('[Database] Supabase deleteAccount error:', err.message);
    }
  }

  let accounts = readJson(ACCOUNTS_FILE, []);
  const initialLen = accounts.length;
  accounts = accounts.filter(a => !(a.shopId === shopId && a.id === accountId));
  writeJson(ACCOUNTS_FILE, accounts);
  return accounts.length < initialLen;
}

// ====================================================================
// SETTINGS (Scoped by shopId)
// ====================================================================

const defaultSettings = {
  domain: 'bunnieschi.com',
  imapHost: 'imap.secureserver.net',
  imapPort: 993,
  imapSecure: true,
  rejectUnauthorized: false,
  useCatchAll: true,
  catchAllEmail: 'mikibun@bunnieschi.com',
  catchAllPassword: 'pamcake2547'
};

async function getSettings(shopId) {
  if (isSupabaseEnabled && supabase) {
    try {
      const { data, error } = await supabase
        .from('shop_settings')
        .select('*')
        .eq('shop_id', shopId)
        .maybeSingle();

      if (!error && data) {
        let host = data.imap_host;
        if (!host || host === 'mail.bunnieschi.com') host = defaultSettings.imapHost;

        let email = data.catch_all_email;
        if (!email || email.includes('@gmail.com')) email = defaultSettings.catchAllEmail;

        let pass = data.catch_all_password;
        if (!pass) pass = defaultSettings.catchAllPassword;

        return {
          domain: data.domain || defaultSettings.domain,
          imapHost: host,
          imapPort: data.imap_port || defaultSettings.imapPort,
          imapSecure: data.imap_secure !== undefined ? data.imap_secure : defaultSettings.imapSecure,
          rejectUnauthorized: Boolean(data.reject_unauthorized),
          useCatchAll: true,
          catchAllEmail: email,
          catchAllPassword: pass
        };
      }
    } catch (err) {
      console.warn('[Database] Supabase getSettings error:', err.message);
    }
  }

  const allSettings = readJson(SETTINGS_FILE, {});
  const saved = allSettings[shopId] || {};
  let host = saved.imapHost;
  if (!host || host === 'mail.bunnieschi.com') host = defaultSettings.imapHost;

  let email = saved.catchAllEmail;
  if (!email || email.includes('@gmail.com')) email = defaultSettings.catchAllEmail;

  let pass = saved.catchAllPassword;
  if (!pass) pass = defaultSettings.catchAllPassword;

  return {
    ...defaultSettings,
    ...saved,
    imapHost: host,
    catchAllEmail: email,
    catchAllPassword: pass,
    useCatchAll: true
  };
}

async function saveSettings(shopId, updatedSettings) {
  if (isSupabaseEnabled && supabase) {
    try {
      await supabase
        .from('shop_settings')
        .upsert({
          shop_id: shopId,
          domain: updatedSettings.domain,
          imap_host: updatedSettings.imapHost,
          imap_port: updatedSettings.imapPort,
          imap_secure: updatedSettings.imapSecure,
          reject_unauthorized: updatedSettings.rejectUnauthorized,
          use_catch_all: updatedSettings.useCatchAll,
          catch_all_email: updatedSettings.catchAllEmail,
          catch_all_password: updatedSettings.catchAllPassword,
          updated_at: new Date().toISOString()
        }, { onConflict: 'shop_id' });
    } catch (err) {
      console.warn('[Database] Supabase saveSettings error:', err.message);
    }
  }

  const allSettings = readJson(SETTINGS_FILE, {});
  allSettings[shopId] = updatedSettings;
  writeJson(SETTINGS_FILE, allSettings);
  return updatedSettings;
}

// ====================================================================
// APP PRESETS (Scoped by shopId)
// ====================================================================

async function getAppPresets(shopId) {
  if (isSupabaseEnabled && supabase) {
    try {
      const { data, error } = await supabase
        .from('app_presets')
        .select('name')
        .eq('shop_id', shopId)
        .order('created_at', { ascending: true });

      if (!error && data && data.length > 0) {
        return data.map(r => r.name);
      }
    } catch (err) {
      console.warn('[Database] Supabase getAppPresets error:', err.message);
    }
  }

  const allPresets = readJson(APPS_FILE, {});
  return allPresets[shopId] || DEFAULT_APPS;
}

async function addAppPreset(shopId, name) {
  const cleanName = name.trim();
  if (isSupabaseEnabled && supabase) {
    try {
      await supabase
        .from('app_presets')
        .upsert({ shop_id: shopId, name: cleanName }, { onConflict: 'shop_id,name' });
    } catch (err) {
      console.warn('[Database] Supabase addAppPreset error:', err.message);
    }
  }

  const allPresets = readJson(APPS_FILE, {});
  const presets = allPresets[shopId] || [...DEFAULT_APPS];
  if (!presets.some(p => p.toLowerCase() === cleanName.toLowerCase())) {
    presets.push(cleanName);
    allPresets[shopId] = presets;
    writeJson(APPS_FILE, allPresets);
  }
  return presets;
}

function getDbStatus() {
  return {
    isSupabaseEnabled,
    rawSupabaseUrl: rawSupabaseUrl || '(empty)',
    storageMode: isSupabaseEnabled ? 'supabase_auth_and_postgres' : 'local_json_mode'
  };
}

async function checkSupabaseLive() {
  if (!isSupabaseEnabled || !supabase) {
    return {
      connected: false,
      tablesReady: false,
      isConfigured: Boolean(rawSupabaseUrl && rawSupabaseKey),
      message: 'ยังไม่ได้ตั้งค่า SUPABASE_URL หรือ SUPABASE_SERVICE_ROLE_KEY ใน Environment Variables ของ Vercel'
    };
  }

  try {
    const { data, error } = await supabase.from('shops').select('count', { count: 'exact', head: true });
    if (error) {
      if (error.code === '42P01' || (error.message && error.message.includes('does not exist'))) {
        return {
          connected: true,
          tablesReady: false,
          message: 'เชื่อมต่อ Supabase ได้แล้ว แต่ยังไม่ได้รัน SQL สร้างตาราง (ไม่พบตาราง shops) กรุณานำโค้ด schema.sql ไปรันใน SQL Editor ของ Supabase'
        };
      }
      return {
        connected: false,
        tablesReady: false,
        message: `Supabase แจ้งเตือน: ${error.message}`
      };
    }
    return {
      connected: true,
      tablesReady: true,
      message: 'เชื่อมต่อ Supabase สำเร็จ 100%! ตารางพร้อมใช้งานและบันทึกข้อมูลลงฐานข้อมูล Supabase ได้ปกติ'
    };
  } catch (err) {
    return {
      connected: false,
      tablesReady: false,
      message: `ไม่สามารถเชื่อมต่อ Supabase ได้ (${err.message}) โปรดตรวจสอบ SUPABASE_URL ใน Vercel`
    };
  }
}

module.exports = {
  getShopByEmail,
  getShopById,
  registerShopUser,
  createShop: registerShopUser,
  updateShopProfile,
  getAccounts,
  getAccountById,
  createAccount,
  updateAccount,
  deleteAccount,
  getSettings,
  saveSettings,
  getAppPresets,
  addAppPreset,
  getDbStatus,
  checkSupabaseLive,
  isSupabaseConfigured,
  getSupabaseClient
};
