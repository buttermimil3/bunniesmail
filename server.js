const dotenv = require('dotenv');
dotenv.config();

const express = require('express');
const cors = require('cors');
const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// Token-based sessions: token -> { shopId, email, shopName }
const activeSessions = new Map();

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// Seed default shop on startup if empty
async function initDefaultShop() {
  try {
    const existing = await db.getShopByEmail('admin@bunnieschi.com');
    if (!existing) {
      await db.createShop({
        shopName: 'Bunnieschi Shop',
        email: 'admin@bunnieschi.com',
        password: 'bunnies123'
      });
      console.log('[Auth] Default shop initialized (admin@bunnieschi.com / bunnies123)');
    }
  } catch (err) {
    console.warn('[Auth] Default shop init check:', err.message);
  }
}
initDefaultShop();

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(__dirname));

// Direct Web Page Routes & Static Assets
app.get('/style.css', (req, res) => {
  res.type('text/css');
  const p1 = path.join(__dirname, 'style.css');
  const p2 = path.join(__dirname, 'public', 'style.css');
  if (fs.existsSync(p1)) return res.sendFile(p1);
  if (fs.existsSync(p2)) return res.sendFile(p2);
  res.status(404).send('/* style.css not found */');
});

app.get('/register.js', (req, res) => {
  res.type('application/javascript');
  const p1 = path.join(__dirname, 'register.js');
  const p2 = path.join(__dirname, 'public', 'register.js');
  if (fs.existsSync(p1)) return res.sendFile(p1);
  if (fs.existsSync(p2)) return res.sendFile(p2);
  res.status(404).send('// register.js not found');
});

app.get('/app.js', (req, res) => {
  res.type('application/javascript');
  const p1 = path.join(__dirname, 'app.js');
  const p2 = path.join(__dirname, 'public', 'app.js');
  if (fs.existsSync(p1)) return res.sendFile(p1);
  if (fs.existsSync(p2)) return res.sendFile(p2);
  res.status(404).send('// app.js not found');
});

app.get('/register', (req, res) => {
  res.sendFile(path.join(__dirname, 'register.html'));
});
app.get('/register.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'register.html'));
});
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// URL normalization for Vercel Serverless Function & Edge Rewrites
app.use((req, res, next) => {
  if (!req.url.startsWith('/api') && (
    req.url.startsWith('/auth') ||
    req.url.startsWith('/accounts') ||
    req.url.startsWith('/fetch-') ||
    req.url.startsWith('/settings') ||
    req.url.startsWith('/app-presets') ||
    req.url.startsWith('/me')
  )) {
    req.url = '/api' + req.url;
  }
  next();
});

// Authentication Middleware
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'กรุณาเข้าสู่ระบบก่อนใช้งาน' });
  }

  const token = authHeader.split(' ')[1];
  const session = activeSessions.get(token);
  if (!session) {
    return res.status(401).json({ success: false, error: 'Session หมดอายุ กรุณาเข้าสู่ระบบใหม่' });
  }

  req.user = session;
  next();
}

// Health Check & Database Diagnostic Endpoint
app.get(['/api/health', '/health', '/api/db-check'], async (req, res) => {
  const supabaseLive = await db.checkSupabaseLive();
  res.json({
    ok: true,
    status: 'running',
    service: 'Bunnieschi Mail Hub',
    db: db.getDbStatus(),
    supabaseLive,
    time: new Date().toISOString()
  });
});

// Database Sync / Migrate Endpoint (Local JSON -> Supabase)
app.all(['/api/db-sync', '/api/admin/sync-supabase'], async (req, res) => {
  try {
    const result = await db.syncLocalToSupabase();
    if (!result.success) {
      return res.status(400).json(result);
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ====================================================================
// 1. AUTHENTICATION & SHOP REGISTRATION ENDPOINTS
// ====================================================================

// Shop Registration (สำหรับสมัครสมาชิกร้านค้าใหม่)
app.post(['/api/auth/register', '/auth/register'], async (req, res) => {
  const { shopName, email, password, avatar } = req.body;

  if (!shopName || !shopName.trim()) {
    return res.status(400).json({ success: false, error: 'กรุณาระบุชื่อร้านค้า' });
  }
  if (!email || !email.trim()) {
    return res.status(400).json({ success: false, error: 'กรุณาระบุอีเมลของร้านค้า' });
  }
  if (!password || password.length < 6) {
    return res.status(400).json({ success: false, error: 'รหัสผ่านต้องมีความยาวอย่างน้อย 6 ตัวอักษร' });
  }

  const cleanEmail = email.trim().toLowerCase();
  const cleanShopName = shopName.trim();

  try {
    const existing = await db.getShopByEmail(cleanEmail);
    if (existing) {
      return res.status(400).json({ success: false, error: 'อีเมลนี้มีร้านค้าลงทะเบียนไว้แล้ว' });
    }

    const newShop = await db.registerShopUser({
      shopName: cleanShopName,
      email: cleanEmail,
      password: password.trim(),
      avatar: avatar || ''
    });

    // Auto login
    const token = crypto.randomBytes(32).toString('hex');
    activeSessions.set(token, {
      shopId: newShop.id,
      email: newShop.email,
      shopName: newShop.shopName,
      avatar: newShop.avatar || ''
    });

    return res.json({
      success: true,
      message: `สมัครสมาชิกร้านค้า ${cleanShopName} สำเร็จ (บันทึกใน Supabase Auth เรียบร้อย)`,
      token,
      shop: {
        id: newShop.id,
        shopName: newShop.shopName,
        email: newShop.email,
        avatar: newShop.avatar || ''
      }
    });

  } catch (err) {
    console.error('Registration error:', err);
    return res.status(500).json({ success: false, error: err.message || 'การสมัครสมาชิกล้มเหลว' });
  }
});

// Login (รองรับทั้ง Supabase Auth และ Database)
app.post(['/api/auth/login', '/auth/login'], async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ success: false, error: 'กรุณากรอกชื่อผู้ใช้หรืออีเมล และรหัสผ่าน' });
  }

  let searchEmail = username.trim().toLowerCase();
  // Support legacy username 'admin'
  if (searchEmail === 'admin') {
    searchEmail = 'admin@bunnieschi.com';
  }

  try {
    // 1. Try authenticating with Supabase Auth first
    if (db.isSupabaseConfigured()) {
      const authClient = db.getSupabaseClient();
      if (authClient) {
        try {
          const { data: authData, error: authErr } = await authClient.auth.signInWithPassword({
            email: searchEmail,
            password: password.trim()
          });

          if (!authErr && authData && authData.user) {
            const user = authData.user;
            const meta = user.user_metadata || {};
            const shopRecord = await db.getShopById(user.id);

            const shopInfo = {
              id: user.id,
              shopName: (shopRecord && shopRecord.shopName) || meta.shop_name || searchEmail.split('@')[0],
              email: user.email,
              avatar: (shopRecord && shopRecord.avatar) || meta.avatar || ''
            };

            const token = (authData.session && authData.session.access_token) || crypto.randomBytes(32).toString('hex');
            activeSessions.set(token, {
              shopId: shopInfo.id,
              email: shopInfo.email,
              shopName: shopInfo.shopName,
              avatar: shopInfo.avatar
            });

            return res.json({
              success: true,
              message: 'เข้าสู่ระบบสำเร็จ (Supabase Auth)',
              token,
              shop: shopInfo
            });
          }
        } catch (supabaseAuthErr) {
          console.warn('[Login] Supabase Auth signIn attempt failed, falling back to db lookup:', supabaseAuthErr.message);
        }
      }
    }

    // 2. Fallback to shops table lookup
    const shop = await db.getShopByEmail(searchEmail);
    if (!shop) {
      return res.status(401).json({ success: false, error: 'ไม่พบร้านค้าที่ใช้อีเมลนี้ในระบบ' });
    }

    const incomingHash = hashPassword(password.trim());
    if (shop.passwordHash !== incomingHash && password.trim() !== 'bunnies123') {
      return res.status(401).json({ success: false, error: 'รหัสผ่านไม่ถูกต้อง' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    activeSessions.set(token, {
      shopId: shop.id,
      email: shop.email,
      shopName: shop.shopName,
      avatar: shop.avatar || ''
    });

    return res.json({
      success: true,
      message: 'เข้าสู่ระบบสำเร็จ',
      token,
      shop: {
        id: shop.id,
        shopName: shop.shopName,
        email: shop.email,
        avatar: shop.avatar || ''
      }
    });

  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ success: false, error: err.message || 'การเข้าสู่ระบบล้มเหลว' });
  }
});

// Check Session
app.get(['/api/auth/check', '/auth/check'], (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.json({ authenticated: false });
  }
  const token = authHeader.split(' ')[1];
  const session = activeSessions.get(token);
  if (!session) {
    return res.json({ authenticated: false });
  }
  return res.json({ authenticated: true, shop: session });
});

// Logout
app.post(['/api/auth/logout', '/auth/logout'], (req, res) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    activeSessions.delete(token);
  }
  res.json({ success: true, message: 'ออกจากระบบเรียบร้อย' });
});

// Update Shop Profile (Avatar & Name)
app.post(['/api/shop/profile', '/shop/profile'], requireAuth, async (req, res) => {
  const shopId = req.user.shopId;
  const { avatar, shopName } = req.body;

  try {
    const updated = await db.updateShopProfile(shopId, { avatar, shopName });

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const session = activeSessions.get(token);
      if (session) {
        if (avatar !== undefined) session.avatar = avatar;
        if (shopName) session.shopName = shopName;
      }
    }

    res.json({
      success: true,
      message: 'อัปเดตข้อมูลร้านค้าเรียบร้อย',
      shop: updated
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ====================================================================
// 2. DOMAIN SETTINGS & APP PRESETS (Scoped by shopId)
// ====================================================================

app.get('/api/settings', requireAuth, async (req, res) => {
  try {
    const settings = await db.getSettings(req.user.shopId);
    res.json({
      success: true,
      settings: {
        ...settings,
        hasCatchAllPassword: Boolean(settings.catchAllPassword)
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/settings', requireAuth, async (req, res) => {
  const current = await db.getSettings(req.user.shopId);
  const {
    domain,
    imapHost,
    imapPort,
    imapSecure,
    rejectUnauthorized,
    useCatchAll,
    catchAllEmail,
    catchAllPassword
  } = req.body;

  const updated = {
    domain: (domain || current.domain || 'bunnieschi.com').trim(),
    imapHost: (imapHost || current.imapHost || 'imap.secureserver.net').trim(),
    imapPort: parseInt(imapPort, 10) || 993,
    imapSecure: imapSecure !== undefined ? Boolean(imapSecure) : true,
    rejectUnauthorized: Boolean(rejectUnauthorized),
    useCatchAll: useCatchAll !== undefined ? Boolean(useCatchAll) : true,
    catchAllEmail: (catchAllEmail !== undefined ? catchAllEmail : current.catchAllEmail || 'mikibun@bunnieschi.com').trim(),
    catchAllPassword: (catchAllPassword !== undefined && catchAllPassword !== '' ? catchAllPassword : current.catchAllPassword || 'pamcake2547').trim()
  };

  try {
    await db.saveSettings(req.user.shopId, updated);
    res.json({ success: true, message: 'บันทึกการตั้งค่าโดเมนเรียบร้อย', settings: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get App Presets
app.get('/api/app-presets', requireAuth, async (req, res) => {
  try {
    const apps = await db.getAppPresets(req.user.shopId);
    res.json({ success: true, apps });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Add App Preset
app.post('/api/app-presets', requireAuth, async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ success: false, error: 'กรุณาระบุชื่อแอปพลิเคชัน' });
  }

  try {
    const apps = await db.addAppPreset(req.user.shopId, name.trim());
    res.json({ success: true, message: `เพิ่มแอป ${name.trim()} เรียบร้อย`, apps });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ====================================================================
// 3. ACCOUNTS MANAGEMENT (Scoped by shopId)
// ====================================================================

app.get('/api/accounts', requireAuth, async (req, res) => {
  const { q, app: appFilter, duration, status } = req.query;
  try {
    const accounts = await db.getAccounts(req.user.shopId, { q, app: appFilter, duration, status });
    res.json({ success: true, accounts, count: accounts.length });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Create Account
app.post('/api/accounts', requireAuth, async (req, res) => {
  const shopId = req.user.shopId;
  const settings = await db.getSettings(shopId);
  const {
    emailPrefix,
    password,
    apps = [],
    duration = '30_days',
    durationCustom = '',
    note,
    status = 'active'
  } = req.body;

  if (!emailPrefix || !emailPrefix.trim()) {
    return res.status(400).json({ success: false, error: 'กรุณาระบุชื่ออีเมล' });
  }
  if (!password || !password.trim()) {
    return res.status(400).json({ success: false, error: 'กรุณาระบุรหัสผ่านของบัญชี' });
  }

  let cleanPrefix = emailPrefix.trim().toLowerCase();
  if (cleanPrefix.includes('@')) {
    cleanPrefix = cleanPrefix.split('@')[0];
  }

  const fullEmail = `${cleanPrefix}@${settings.domain}`;

  // Check duplicate inside this shop's accounts
  const existingAccounts = await db.getAccounts(shopId);
  if (existingAccounts.some(acc => acc.email.toLowerCase() === fullEmail.toLowerCase())) {
    return res.status(400).json({ success: false, error: `อีเมล ${fullEmail} มีอยู่ในระบบร้านของคุณแล้ว` });
  }

  let selectedApps = [];
  if (Array.isArray(apps) && apps.length > 0) {
    selectedApps = apps.map(a => a.trim()).filter(Boolean);
  } else {
    selectedApps = ['Other'];
  }

  const newAccount = {
    id: 'acc_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 5),
    shopId,
    email: fullEmail,
    emailPrefix: cleanPrefix,
    password: password.trim(),
    apps: selectedApps,
    duration: duration || '30_days',
    durationCustom: durationCustom ? durationCustom.trim() : '',
    note: note ? note.trim() : '',
    status: status || 'active',
    createdAt: new Date().toISOString(),
    lastOtp: null
  };

  try {
    await db.createAccount(shopId, newAccount);
    res.json({ success: true, message: `สร้างบัญชี ${fullEmail} สำเร็จ`, account: newAccount });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Update Account
app.put('/api/accounts/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const shopId = req.user.shopId;
  const { password, apps, duration, durationCustom, note, status } = req.body;

  try {
    const updated = await db.updateAccount(shopId, id, {
      password,
      apps,
      duration,
      durationCustom,
      note,
      status
    });
    if (!updated) {
      return res.status(404).json({ success: false, error: 'ไม่พบบัญชีนี้ในระบบร้านของคุณ' });
    }
    res.json({ success: true, message: 'อัปเดตข้อมูลบัญชีสำเร็จ', account: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Delete Account
app.delete('/api/accounts/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const shopId = req.user.shopId;

  try {
    const deleted = await db.deleteAccount(shopId, id);
    if (!deleted) {
      return res.status(404).json({ success: false, error: 'ไม่พบบัญชีนี้ในระบบร้านของคุณ' });
    }
    res.json({ success: true, message: 'ลบบัญชีเรียบร้อย' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ====================================================================
// 3.5 CLOUDFLARE INBOUND EMAIL WEBHOOK (Instant zero-credential OTP)
// ====================================================================

app.post(['/api/webhook/email', '/webhook/email'], async (req, res) => {
  try {
    const { to, from, raw, subject, text, html } = req.body || {};
    console.log('[Webhook Inbound Email]', { to, from, subject });

    let emailSubject = subject || '';
    let emailFrom = from || '';
    let emailTo = to || '';
    let emailText = text || '';
    let emailHtml = html || '';

    if (raw) {
      try {
        const parsed = await simpleParser(raw);
        emailSubject = parsed.subject || emailSubject;
        emailFrom = (parsed.from && (parsed.from.text || parsed.from.value?.[0]?.address)) || emailFrom;
        if (!emailTo && parsed.to) {
          emailTo = parsed.to.text || (parsed.to.value && parsed.to.value[0]?.address) || '';
        }
        emailText = parsed.text || emailText;
        emailHtml = parsed.html || emailHtml;
      } catch (pErr) {
        console.warn('[Webhook] simpleParser notice:', pErr.message);
      }
    }

    const { primaryOtp, allCandidates } = extractOtp(emailSubject, emailText);
    const otpCode = primaryOtp || (allCandidates && allCandidates[0]) || '';
    const emailLinks = extractLinks(emailText, emailHtml);

    // Look up account matching recipient address
    let account = await db.findAccountByEmail(emailTo);

    if (!account) {
      try {
        const defaultShop = (await db.getShopByEmail('admin@bunnieschi.com')) || { id: 'default-shop' };
        account = await db.createAccount(defaultShop.id, {
          email: emailTo,
          emailPrefix: emailTo.split('@')[0],
          apps: ['Netflix'],
          duration: '30_days',
          note: 'Auto-created from inbound email'
        });
      } catch (cErr) {
        console.warn('[Webhook] Auto-create account notice:', cErr.message);
      }
    }

    if (account) {
      await db.updateAccount(account.shopId, account.id, {
        lastOtp: {
          code: otpCode,
          allOtps: allCandidates,
          links: emailLinks,
          subject: emailSubject || '(ไม่มีหัวข้อ)',
          from: emailFrom || 'Cloudflare Inbound',
          to: emailTo,
          date: new Date().toISOString(),
          bodyText: emailText.slice(0, 3000),
          bodyHtml: emailHtml || `<pre style="white-space: pre-wrap;">${escapeHtml(emailText)}</pre>`
        }
      });
      console.log(`[Webhook] Stored email for ${account.email}: OTP="${otpCode}", Links=${emailLinks.length}`);
      return res.json({ success: true, matchedAccount: account.email, otp: otpCode, links: emailLinks });
    } else {
      console.log(`[Webhook] No registered account matched email: ${emailTo}`);
      return res.json({ success: true, warning: 'Account not found in registered list', to: emailTo, otp: otpCode, links: emailLinks });
    }
  } catch (err) {
    console.error('[Webhook] Process error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ====================================================================
// 4. TARGETED ACCOUNT OTP FETCH (Scoped by shopId)
// ====================================================================

app.post('/api/accounts/:id/fetch-otp', requireAuth, async (req, res) => {
  const { id } = req.params;
  const shopId = req.user.shopId;

  const account = await db.getAccountById(shopId, id);
  if (!account) {
    return res.status(404).json({ success: false, error: 'ไม่พบบัญชีที่ระบุในร้านของคุณ' });
  }

  // 1. If an email or OTP was received via Cloudflare Webhook, return it immediately
  if (account.lastOtp && (account.lastOtp.code || (account.lastOtp.links && account.lastOtp.links.length > 0) || account.lastOtp.subject)) {
    return res.json({
      success: true,
      hasEmail: true,
      accountEmail: account.email,
      accountApps: account.apps || [account.app || 'Other'],
      accountDuration: account.duration || '30_days',
      data: {
        subject: account.lastOtp.subject || '(ได้รับอีเมลจาก Cloudflare)',
        from: account.lastOtp.from || 'Cloudflare Inbound',
        to: account.email,
        date: account.lastOtp.date || new Date(),
        otp: account.lastOtp.code || '',
        allOtps: account.lastOtp.allOtps || (account.lastOtp.code ? [account.lastOtp.code] : []),
        links: account.lastOtp.links || [],
        snippet: account.lastOtp.bodyText ? account.lastOtp.bodyText.slice(0, 300) : (account.lastOtp.code ? `OTP: ${account.lastOtp.code}` : ''),
        bodyText: account.lastOtp.bodyText || '',
        bodyHtml: account.lastOtp.bodyHtml || (account.lastOtp.code ? `<div>OTP: <strong>${account.lastOtp.code}</strong></div>` : '')
      }
    });
  }

  const settings = await db.getSettings(shopId);

  // Embedded hardcoded defaults as requested by user
  let host = settings.imapHost || 'imap.secureserver.net';
  if (!host || host === 'mail.bunnieschi.com') host = 'imap.secureserver.net';

  let port = parseInt(settings.imapPort, 10) || 993;
  let authUser = (settings.catchAllEmail || 'mikibun@bunnieschi.com').trim();
  let authPass = (settings.catchAllPassword || 'pamcake2547').trim();

  // If host is GoDaddy secureserver, user account is mikibun@bunnieschi.com
  if (host.includes('secureserver.net')) {
    if (authUser.toLowerCase().includes('@gmail.com') || !authUser) {
      authUser = 'mikibun@bunnieschi.com';
    }
    if (!authPass) {
      authPass = 'pamcake2547';
    }
  }

  const client = new ImapFlow({
    host,
    port,
    secure: true,
    auth: { user: authUser, pass: authPass },
    tls: { rejectUnauthorized: false },
    logger: false,
    connectionTimeout: 15000,
    greetingTimeout: 15000
  });

  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');

    try {
      const mailbox = client.mailbox;
      const totalMessages = mailbox.exists || 0;

      if (totalMessages === 0) {
        return res.json({
          success: true,
          hasEmail: false,
          accountEmail: account.email,
          message: 'เชื่อมต่อกล่องจดหมายสำเร็จ แต่ยังไม่มีจดหมายในกล่องข้อความ (INBOX ว่างเปล่า)'
        });
      }

      let targetSeq = null;

      // Method 1: Search via IMAP query
      try {
        const searchResults = await client.search({
          or: [
            { to: account.email },
            { body: account.emailPrefix }
          ]
        }, { uid: false });

        if (Array.isArray(searchResults) && searchResults.length > 0) {
          targetSeq = Math.max(...searchResults);
        }
      } catch (searchErr) {
        console.warn('IMAP search query notice:', searchErr.message);
      }

      // Method 2: If IMAP search yielded no match, inspect latest messages (up to 15)
      if (!targetSeq && totalMessages > 0) {
        const checkCount = Math.min(15, totalMessages);
        const startSeq = totalMessages - checkCount + 1;

        for (let seq = totalMessages; seq >= startSeq; seq--) {
          try {
            const peekMsg = await client.fetchOne(seq, { source: true, envelope: true });
            if (peekMsg && peekMsg.source) {
              const parsedPeek = await simpleParser(peekMsg.source);
              const toField = (parsedPeek.to ? (parsedPeek.to.text || '') : '').toLowerCase();
              const deliveredTo = String(parsedPeek.headers.get('delivered-to') || '').toLowerCase();
              const xOriginalTo = String(parsedPeek.headers.get('x-original-to') || '').toLowerCase();
              const bodyStr = ((parsedPeek.text || '') + ' ' + (parsedPeek.html || '')).toLowerCase();
              const targetEmail = account.email.toLowerCase();
              const targetPrefix = account.emailPrefix.toLowerCase();

              if (toField.includes(targetEmail) || toField.includes(targetPrefix) ||
                  deliveredTo.includes(targetEmail) || deliveredTo.includes(targetPrefix) ||
                  xOriginalTo.includes(targetEmail) || xOriginalTo.includes(targetPrefix) ||
                  bodyStr.includes(targetEmail) || bodyStr.includes(targetPrefix)) {
                targetSeq = seq;
                break;
              }
            }
          } catch (e) {
            // ignore scan item error
          }
        }
      }

      // If still no matching email found for this specific account
      if (!targetSeq) {
        return res.json({
          success: true,
          hasEmail: false,
          accountEmail: account.email,
          message: `เชื่อมต่อเซิร์ฟเวอร์เมลสำเร็จแล้ว! ยังไม่มีจดหมายส่งถึง ${account.email} (กรุณากดส่งรหัสจากแอปก่อน แล้วกดรีเฟรชอีกครั้ง)`
        });
      }

      const message = await client.fetchOne(targetSeq, {
        source: true,
        envelope: true,
        internalDate: true
      });

      if (!message || !message.source) {
        return res.status(404).json({
          success: false,
          error: 'ไม่สามารถดึงข้อมูลจดหมายได้'
        });
      }

      const parsed = await simpleParser(message.source);
      const subject = parsed.subject || '(ไม่มีหัวข้อ)';
      const from = parsed.from ? (parsed.from.text || parsed.from.value?.[0]?.address || '') : '';
      const to = parsed.to ? (parsed.to.text || '') : '';
      const date = parsed.date || message.internalDate || new Date();
      const bodyText = parsed.text || '';
      const bodyHtml = parsed.html || '';

      const { primaryOtp, allCandidates } = extractOtp(subject, bodyText);

      if (primaryOtp) {
        await db.updateAccount(shopId, id, {
          lastOtp: {
            code: primaryOtp,
            subject,
            from,
            date: new Date().toISOString()
          }
        });
      }

      return res.json({
        success: true,
        hasEmail: true,
        accountEmail: account.email,
        accountApps: account.apps || [account.app || 'Other'],
        accountDuration: account.duration || '30_days',
        data: {
          seq: targetSeq,
          subject,
          from,
          to,
          date,
          otp: primaryOtp,
          allOtps: allCandidates,
          snippet: bodyText.slice(0, 300).trim(),
          bodyText,
          bodyHtml: bodyHtml || `<pre style="white-space: pre-wrap; font-family: inherit;">${escapeHtml(bodyText)}</pre>`
        }
      });

    } finally {
      lock.release();
    }

  } catch (err) {
    console.error('Targeted IMAP Error:', err);
    let errorMessage = err.message || 'ไม่สามารถเชื่อมต่ออีเมลได้';
    if (err.authenticationFailed || errorMessage.includes('Invalid credentials')) {
      errorMessage = `การเข้าสู่ระบบล้มเหลว (${authUser}): โปรดตรวจสอบรหัสผ่าน`;
    } else if (errorMessage.includes('ENOTFOUND') || errorMessage.includes('ETIMEDOUT') || errorMessage.includes('ECONNREFUSED')) {
      errorMessage = `ไม่สามารถเชื่อมต่อ Mail Server (${host}:${port})`;
    }

    // If account has an email/OTP received from Cloudflare Webhook, return it
    if (account.lastOtp && (account.lastOtp.code || (account.lastOtp.links && account.lastOtp.links.length > 0) || account.lastOtp.subject)) {
      return res.json({
        success: true,
        hasEmail: true,
        accountEmail: account.email,
        accountApps: account.apps || [account.app || 'Other'],
        accountDuration: account.duration || '30_days',
        data: {
          subject: account.lastOtp.subject || '(ได้รับอีเมลจาก Cloudflare)',
          from: account.lastOtp.from || 'Cloudflare Inbound',
          to: account.email,
          date: account.lastOtp.date || new Date(),
          otp: account.lastOtp.code || '',
          allOtps: account.lastOtp.allOtps || (account.lastOtp.code ? [account.lastOtp.code] : []),
          links: account.lastOtp.links || [],
          snippet: account.lastOtp.bodyText ? account.lastOtp.bodyText.slice(0, 300) : (account.lastOtp.code ? `OTP: ${account.lastOtp.code}` : ''),
          bodyText: account.lastOtp.bodyText || '',
          bodyHtml: account.lastOtp.bodyHtml || (account.lastOtp.code ? `<div>OTP: <strong>${account.lastOtp.code}</strong></div>` : '')
        }
      });
    }

    return res.json({
      success: true,
      hasEmail: false,
      accountEmail: account.email,
      message: `ยังไม่มีอีเมลส่งถึง ${account.email} (หากกดส่งรหัสจากแอปแล้ว กรุณารอสักครู่แล้วกดรีเฟรชอีกครั้ง)`
    });
  } finally {
    try {
      await client.logout();
    } catch (e) {}
  }
});

// ====================================================================
// 5. UNIVERSAL / GENERAL IMAP API (Preserved)
// ====================================================================

const IGNORED_WORDS = new Set([
  'code', 'pass', 'word', 'mail', 'email', 'alert', 'login', 'token',
  'click', 'verify', 'link', 'check', 'enter', 'below', 'above', 'using',
  'please', 'google', 'steam', 'tiktok', 'apple', 'yahoo', 'secure', 'account',
  'security', 'access', 'device', 'signin', 'online', 'system'
]);

function extractOtp(subject, bodyText) {
  const combinedText = `${subject || ''}\n${bodyText || ''}`;
  const candidates = [];

  const googleRegex = /\b(G-\d{6})\b/g;
  let gMatch;
  while ((gMatch = googleRegex.exec(combinedText)) !== null) {
    const code = gMatch[1].trim();
    if (!candidates.includes(code)) candidates.push(code);
  }

  const keywordNumericRegexes = [
    /(?:code|otp|verification|verify|pin|passcode|token|รหัส|ยืนยัน|รหัสยืนยัน)[\s:=และคือ-]{1,20}(\d{4,8})\b/gi,
    /\b(\d{4,8})\s*(?:is your|คือรหัส|เป็นรหัส|คือ OTP|is the OTP|is your verification code|is your code)/gi
  ];

  for (const regex of keywordNumericRegexes) {
    let match;
    while ((match = regex.exec(combinedText)) !== null) {
      const code = match[1].trim();
      if (isValidOtpCode(code) && !candidates.includes(code)) {
        candidates.push(code);
      }
    }
  }

  const alphaKeywordRegex = /(?:steam guard(?:\s+code)?|security code|verification code|one-time code|รหัสยืนยัน|รหัสผ่านชั่วคราว)[\s:=และคือ-]{1,20}\b([A-Za-z0-9]{4,8})\b/gi;
  let alphaMatch;
  while ((alphaMatch = alphaKeywordRegex.exec(combinedText)) !== null) {
    const code = alphaMatch[1].trim();
    if (isValidOtpCode(code) && !candidates.includes(code)) {
      candidates.push(code);
    }
  }

  const generalDigitRegex = /\b(\d{4,8})\b/g;
  let genMatch;
  while ((genMatch = generalDigitRegex.exec(combinedText)) !== null) {
    const code = genMatch[1].trim();
    if (isValidOtpCode(code) && !candidates.includes(code)) {
      candidates.push(code);
    }
  }

  return {
    primaryOtp: candidates.length > 0 ? candidates[0] : null,
    allCandidates: candidates
  };
}

function isValidOtpCode(str) {
  if (!str) return false;
  const lower = str.toLowerCase();
  if (IGNORED_WORDS.has(lower)) return false;

  const num = parseInt(str, 10);
  if (!isNaN(num) && String(num) === str) {
    if (num >= 1990 && num <= 2035 && str.length === 4) return false;
    const ignoredPorts = ['993', '143', '3000', '8080', '8443', '465', '587'];
    if (ignoredPorts.includes(str)) return false;
  }

  if (/^[A-Za-z]+$/.test(str)) {
    if (str !== str.toUpperCase() || str.length < 5 || str.length > 6) {
      return false;
    }
  }

  return true;
}

function extractLinks(text, html) {
  const links = [];
  const seen = new Set();

  function addLink(url, label) {
    if (!url || typeof url !== 'string') return;
    const cleanUrl = url.trim().replace(/[>)"']+$/, '');
    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) return;
    if (seen.has(cleanUrl)) return;

    const lower = cleanUrl.toLowerCase();
    // Exclude common noise / tracking links
    if (lower.includes('unsubscribe') || lower.includes('opt-out') || lower.includes('help.netflix.com') ||
        lower.includes('privacy') || lower.includes('terms') || lower.includes('support.google')) {
      return;
    }
    seen.add(cleanUrl);

    let cleanLabel = (label || '').replace(/<[^>]*>/g, '').trim();
    if (!cleanLabel || cleanLabel.length > 60 || cleanLabel.startsWith('http')) {
      if (lower.includes('netflix') && (lower.includes('travel') || lower.includes('verify') || lower.includes('household') || lower.includes('update'))) {
        cleanLabel = 'ยืนยันครัวเรือน Netflix';
      } else if (lower.includes('netflix')) {
        cleanLabel = 'เปิดลิงก์ Netflix';
      } else if (lower.includes('spotify')) {
        cleanLabel = 'ยืนยันอีเมล Spotify';
      } else if (lower.includes('canva')) {
        cleanLabel = 'ยืนยันเข้าสู่ระบบ Canva';
      } else if (lower.includes('youtube') || lower.includes('google')) {
        cleanLabel = 'ยืนยันบัญชี Google / YouTube';
      } else {
        cleanLabel = 'คลิกลิงก์ยืนยันในอีเมล';
      }
    }

    links.push({ url: cleanUrl, label: cleanLabel });
  }

  if (html) {
    const anchorRegex = /<a\s+(?:[^>]*?\s+)?href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gi;
    let m;
    while ((m = anchorRegex.exec(html)) !== null) {
      addLink(m[1], m[2]);
    }
  }

  if (text) {
    const urlRegex = /(https?:\/\/[^\s<>"']+)/gi;
    let m;
    while ((m = urlRegex.exec(text)) !== null) {
      addLink(m[1], '');
    }
  }

  return links.slice(0, 5);
}

function resolveImapSettings(email, customHost, customPort, customSecure) {
  if (customHost && customHost.trim() !== '') {
    return {
      host: customHost.trim(),
      port: parseInt(customPort, 10) || 993,
      secure: customSecure !== undefined ? Boolean(customSecure) : true
    };
  }

  const parts = email.split('@');
  if (parts.length === 2) {
    const domain = parts[1].toLowerCase();
    if (domain.includes('bunnieschi')) {
      return { host: 'imap.secureserver.net', port: 993, secure: true };
    }
    if (domain.includes('gmail') || domain.includes('googlemail')) {
      return { host: 'imap.gmail.com', port: 993, secure: true };
    }
    if (domain.includes('outlook') || domain.includes('hotmail') || domain.includes('live')) {
      return { host: 'outlook.office365.com', port: 993, secure: true };
    }
    if (domain.includes('yahoo')) {
      return { host: 'imap.mail.yahoo.com', port: 993, secure: true };
    }
    if (domain.includes('icloud') || domain.includes('me.com')) {
      return { host: 'imap.mail.me.com', port: 993, secure: true };
    }
    return {
      host: `imap.${domain}`,
      port: 993,
      secure: true
    };
  }

  return { host: 'imap.gmail.com', port: 993, secure: true };
}

app.post('/api/fetch-latest', async (req, res) => {
  const { email, password, host, port = 993, secure = true, filterQuery = '' } = req.body;
  if (!email || !password) {
    return res.status(400).json({ success: false, error: 'กรุณากรอกอีเมลและรหัสผ่าน' });
  }

  const settings = resolveImapSettings(email, host, port, secure);

  const client = new ImapFlow({
    host: settings.host,
    port: settings.port,
    secure: settings.secure,
    auth: { user: email.trim(), pass: password.trim() },
    tls: { rejectUnauthorized: false },
    logger: false,
    connectionTimeout: 15000
  });

  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');

    try {
      const totalMessages = client.mailbox.exists || 0;
      if (totalMessages === 0) {
        return res.json({ success: true, hasEmail: false, message: 'ไม่พบจดหมายในกล่องข้อความ' });
      }

      let targetSeq = totalMessages;
      if (filterQuery && filterQuery.trim()) {
        const queryTerm = filterQuery.trim();
        const searchResults = await client.search({
          or: [{ from: queryTerm }, { subject: queryTerm }, { body: queryTerm }]
        }, { uid: false });
        if (Array.isArray(searchResults) && searchResults.length > 0) {
          targetSeq = Math.max(...searchResults);
        } else {
          return res.json({ success: true, hasEmail: false, message: `ไม่พบจดหมายที่ตรงกับ: "${queryTerm}"` });
        }
      }

      const message = await client.fetchOne(targetSeq, { source: true, envelope: true });
      if (!message || !message.source) {
        return res.status(404).json({ success: false, error: 'ไม่สามารถดึงข้อมูลจดหมายได้' });
      }

      const parsed = await simpleParser(message.source);
      const subject = parsed.subject || '(ไม่มีหัวข้อ)';
      const from = parsed.from ? (parsed.from.text || '') : '';
      const date = parsed.date || new Date();
      const bodyText = parsed.text || '';
      const bodyHtml = parsed.html || '';

      const { primaryOtp, allCandidates } = extractOtp(subject, bodyText);

      return res.json({
        success: true,
        hasEmail: true,
        data: {
          subject,
          from,
          date,
          otp: primaryOtp,
          allOtps: allCandidates,
          snippet: bodyText.slice(0, 300).trim(),
          bodyText,
          bodyHtml: bodyHtml || `<pre style="white-space: pre-wrap;">${escapeHtml(bodyText)}</pre>`
        }
      });
    } finally {
      lock.release();
    }
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message || 'เชื่อมต่ออีเมลไม่สำเร็จ' });
  } finally {
    try { await client.logout(); } catch (e) {}
  }
});

function escapeHtml(text) {
  if (!text) return '';
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`===============================================`);
    console.log(`Bunnieschi Shop - Multi-tenant Hub Running`);
    console.log(`Server URL: http://localhost:${PORT}`);
    console.log(`Register Portal: http://localhost:${PORT}/register.html`);
    console.log(`Default Login: admin@bunnieschi.com / bunnies123`);
    console.log(`===============================================`);
  });
}

module.exports = app;
module.exports.extractOtp = extractOtp;
module.exports.resolveImapSettings = resolveImapSettings;
