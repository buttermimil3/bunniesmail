const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY || '';

const isSupabaseEnabled = Boolean(SUPABASE_URL && SUPABASE_KEY);

let supabase = null;
if (isSupabaseEnabled) {
  supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false }
  });
  console.log('[Database] Connected to Supabase Cloud PostgreSQL');
} else {
  console.log('[Database] Using Local JSON Storage (Fallback Mode)');
}

// Local Storage Setup (Supports local filesystem and Vercel /tmp)
const DATA_DIR = (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME)
  ? path.join('/tmp', 'data')
  : path.join(__dirname, 'data');
const SHOPS_FILE = path.join(DATA_DIR, 'shops.json');
const ACCOUNTS_FILE = path.join(DATA_DIR, 'accounts.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const APPS_FILE = path.join(DATA_DIR, 'apps.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(SHOPS_FILE)) fs.writeFileSync(SHOPS_FILE, JSON.stringify([], null, 2));
if (!fs.existsSync(ACCOUNTS_FILE)) fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify([], null, 2));
if (!fs.existsSync(SETTINGS_FILE)) fs.writeFileSync(SETTINGS_FILE, JSON.stringify({}, null, 2));
if (!fs.existsSync(APPS_FILE)) fs.writeFileSync(APPS_FILE, JSON.stringify({}, null, 2));

function readJson(file, fallback = []) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    return fallback;
  }
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

const DEFAULT_APPS = [
  'Netflix', 'Spotify', 'Canva Pro', 'YouTube Premium',
  'ChatGPT', 'Claude AI', 'Disney+', 'Viu', 'iQIYI', 'Prime Video'
];

// ====================================================================
// SHOPS
// ====================================================================

async function getShopByEmail(email) {
  const cleanEmail = (email || '').trim().toLowerCase();
  if (isSupabaseEnabled) {
    const { data, error } = await supabase
      .from('shops')
      .select('*')
      .ilike('email', cleanEmail)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return {
      id: data.id,
      shopName: data.shop_name,
      email: data.email,
      passwordHash: data.password_hash,
      createdAt: data.created_at
    };
  } else {
    const shops = readJson(SHOPS_FILE, []);
    return shops.find(s => s.email.toLowerCase() === cleanEmail) || null;
  }
}

async function getShopById(shopId) {
  if (isSupabaseEnabled) {
    const { data, error } = await supabase
      .from('shops')
      .select('*')
      .eq('id', shopId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return {
      id: data.id,
      shopName: data.shop_name,
      email: data.email,
      createdAt: data.created_at
    };
  } else {
    const shops = readJson(SHOPS_FILE, []);
    return shops.find(s => s.id === shopId) || null;
  }
}

async function createShop({ shopName, email, passwordHash }) {
  const cleanEmail = email.trim().toLowerCase();
  const cleanName = shopName.trim();

  if (isSupabaseEnabled) {
    const { data, error } = await supabase
      .from('shops')
      .insert({
        shop_name: cleanName,
        email: cleanEmail,
        password_hash: passwordHash
      })
      .select()
      .single();
    if (error) throw error;
    return {
      id: data.id,
      shopName: data.shop_name,
      email: data.email,
      createdAt: data.created_at
    };
  } else {
    const shops = readJson(SHOPS_FILE, []);
    const id = 'shop_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 5);
    const newShop = {
      id,
      shopName: cleanName,
      email: cleanEmail,
      passwordHash,
      createdAt: new Date().toISOString()
    };
    shops.push(newShop);
    writeJson(SHOPS_FILE, shops);
    return newShop;
  }
}

// ====================================================================
// ACCOUNTS (Scoped by shopId)
// ====================================================================

async function getAccounts(shopId, { q, app, duration, status } = {}) {
  if (isSupabaseEnabled) {
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
    if (error) throw error;

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
        a.email.toLowerCase().includes(term) ||
        (a.note && a.note.toLowerCase().includes(term)) ||
        a.apps.some(x => x.toLowerCase().includes(term))
      );
    }

    return results;
  } else {
    let accounts = readJson(ACCOUNTS_FILE, []);
    accounts = accounts.filter(a => a.shopId === shopId);

    if (q && q.trim()) {
      const term = q.trim().toLowerCase();
      accounts = accounts.filter(a =>
        a.email.toLowerCase().includes(term) ||
        (a.note && a.note.toLowerCase().includes(term)) ||
        (Array.isArray(a.apps) && a.apps.some(x => x.toLowerCase().includes(term)))
      );
    }

    if (app && app !== 'all') {
      const term = app.toLowerCase();
      accounts = accounts.filter(a => {
        const list = Array.isArray(a.apps) ? a.apps : [a.app || ''];
        return list.some(x => x.toLowerCase() === term);
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
}

async function getAccountById(shopId, accountId) {
  if (isSupabaseEnabled) {
    const { data, error } = await supabase
      .from('accounts')
      .select('*')
      .eq('shop_id', shopId)
      .eq('id', accountId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
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
  } else {
    const accounts = readJson(ACCOUNTS_FILE, []);
    return accounts.find(a => a.shopId === shopId && a.id === accountId) || null;
  }
}

async function createAccount(shopId, accountData) {
  if (isSupabaseEnabled) {
    const { data, error } = await supabase
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
      })
      .select()
      .single();
    if (error) throw error;
    return accountData;
  } else {
    const accounts = readJson(ACCOUNTS_FILE, []);
    const newRecord = { ...accountData, shopId };
    accounts.unshift(newRecord);
    writeJson(ACCOUNTS_FILE, accounts);
    return newRecord;
  }
}

async function updateAccount(shopId, accountId, updates) {
  if (isSupabaseEnabled) {
    const payload = {};
    if (updates.password !== undefined) payload.password = updates.password;
    if (updates.apps !== undefined) payload.apps = updates.apps;
    if (updates.duration !== undefined) payload.duration = updates.duration;
    if (updates.durationCustom !== undefined) payload.duration_custom = updates.durationCustom;
    if (updates.note !== undefined) payload.note = updates.note;
    if (updates.status !== undefined) payload.status = updates.status;
    if (updates.lastOtp !== undefined) payload.last_otp = updates.lastOtp;
    payload.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('accounts')
      .update(payload)
      .eq('shop_id', shopId)
      .eq('id', accountId)
      .select()
      .maybeSingle();
    if (error) throw error;
    return data;
  } else {
    const accounts = readJson(ACCOUNTS_FILE, []);
    const idx = accounts.findIndex(a => a.shopId === shopId && a.id === accountId);
    if (idx === -1) return null;
    accounts[idx] = { ...accounts[idx], ...updates, updatedAt: new Date().toISOString() };
    writeJson(ACCOUNTS_FILE, accounts);
    return accounts[idx];
  }
}

async function deleteAccount(shopId, accountId) {
  if (isSupabaseEnabled) {
    const { error } = await supabase
      .from('accounts')
      .delete()
      .eq('shop_id', shopId)
      .eq('id', accountId);
    if (error) throw error;
    return true;
  } else {
    let accounts = readJson(ACCOUNTS_FILE, []);
    const initialLen = accounts.length;
    accounts = accounts.filter(a => !(a.shopId === shopId && a.id === accountId));
    writeJson(ACCOUNTS_FILE, accounts);
    return accounts.length < initialLen;
  }
}

// ====================================================================
// SETTINGS (Scoped by shopId)
// ====================================================================

async function getSettings(shopId) {
  const defaultSettings = {
    domain: 'bunnieschi.com',
    imapHost: 'mail.bunnieschi.com',
    imapPort: 993,
    imapSecure: true,
    rejectUnauthorized: false,
    useCatchAll: true,
    catchAllEmail: 'mikibun@bunnieschi.com',
    catchAllPassword: ''
  };

  if (isSupabaseEnabled) {
    const { data, error } = await supabase
      .from('shop_settings')
      .select('*')
      .eq('shop_id', shopId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return defaultSettings;
    return {
      domain: data.domain || defaultSettings.domain,
      imapHost: data.imap_host || defaultSettings.imapHost,
      imapPort: data.imap_port || defaultSettings.imapPort,
      imapSecure: data.imap_secure !== undefined ? data.imap_secure : defaultSettings.imapSecure,
      rejectUnauthorized: Boolean(data.reject_unauthorized),
      useCatchAll: data.use_catch_all !== undefined ? data.use_catch_all : true,
      catchAllEmail: data.catch_all_email || defaultSettings.catchAllEmail,
      catchAllPassword: data.catch_all_password || ''
    };
  } else {
    const allSettings = readJson(SETTINGS_FILE, {});
    return allSettings[shopId] || defaultSettings;
  }
}

async function saveSettings(shopId, updatedSettings) {
  if (isSupabaseEnabled) {
    const { error } = await supabase
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
    if (error) throw error;
    return updatedSettings;
  } else {
    const allSettings = readJson(SETTINGS_FILE, {});
    allSettings[shopId] = updatedSettings;
    writeJson(SETTINGS_FILE, allSettings);
    return updatedSettings;
  }
}

// ====================================================================
// APP PRESETS (Scoped by shopId)
// ====================================================================

async function getAppPresets(shopId) {
  if (isSupabaseEnabled) {
    const { data, error } = await supabase
      .from('app_presets')
      .select('name')
      .eq('shop_id', shopId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    if (!data || data.length === 0) return DEFAULT_APPS;
    return data.map(r => r.name);
  } else {
    const allPresets = readJson(APPS_FILE, {});
    return allPresets[shopId] || DEFAULT_APPS;
  }
}

async function addAppPreset(shopId, name) {
  const cleanName = name.trim();
  if (isSupabaseEnabled) {
    const { error } = await supabase
      .from('app_presets')
      .upsert({ shop_id: shopId, name: cleanName }, { onConflict: 'shop_id,name' });
    if (error) throw error;
    return getAppPresets(shopId);
  } else {
    const allPresets = readJson(APPS_FILE, {});
    const presets = allPresets[shopId] || [...DEFAULT_APPS];
    if (!presets.some(p => p.toLowerCase() === cleanName.toLowerCase())) {
      presets.push(cleanName);
      allPresets[shopId] = presets;
      writeJson(APPS_FILE, allPresets);
    }
    return presets;
  }
}

module.exports = {
  isSupabaseEnabled,
  getShopByEmail,
  getShopById,
  createShop,
  getAccounts,
  getAccountById,
  createAccount,
  updateAccount,
  deleteAccount,
  getSettings,
  saveSettings,
  getAppPresets,
  addAppPreset
};
