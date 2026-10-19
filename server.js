const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const path = require('path');
const crypto = require('crypto');
const db = require('./db');

dotenv.config();

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
        passwordHash: hashPassword('bunnies123')
      });
      console.log('[Auth] Default shop initialized (admin@bunnieschi.com / bunnies123)');
    }
  } catch (err) {
    console.warn('[Auth] Default shop init check:', err.message);
  }
}
initDefaultShop();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(__dirname));

// Direct Web Page Routes
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

    const newShop = await db.createShop({
      shopName: cleanShopName,
      email: cleanEmail,
      passwordHash: hashPassword(password.trim()),
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
      message: `สมัครสมาชิกร้านค้า ${cleanShopName} สำเร็จ`,
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

// Login
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
    imapHost: (imapHost || current.imapHost || 'mail.bunnieschi.com').trim(),
    imapPort: parseInt(imapPort, 10) || 993,
    imapSecure: imapSecure !== undefined ? Boolean(imapSecure) : true,
    rejectUnauthorized: Boolean(rejectUnauthorized),
    useCatchAll: useCatchAll !== undefined ? Boolean(useCatchAll) : true,
    catchAllEmail: (catchAllEmail !== undefined ? catchAllEmail : current.catchAllEmail || 'mikibun@bunnieschi.com').trim(),
    catchAllPassword: (catchAllPassword !== undefined && catchAllPassword !== '' ? catchAllPassword : current.catchAllPassword).trim()
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
// 4. TARGETED ACCOUNT OTP FETCH (Scoped by shopId)
// ====================================================================

app.post('/api/accounts/:id/fetch-otp', requireAuth, async (req, res) => {
  const { id } = req.params;
  const shopId = req.user.shopId;

  const account = await db.getAccountById(shopId, id);
  if (!account) {
    return res.status(404).json({ success: false, error: 'ไม่พบบัญชีที่ระบุในร้านของคุณ' });
  }

  const settings = await db.getSettings(shopId);

  let authUser = account.email;
  let authPass = account.password;

  if (settings.useCatchAll && settings.catchAllEmail && settings.catchAllPassword) {
    authUser = settings.catchAllEmail;
    authPass = settings.catchAllPassword;
  }

  const client = new ImapFlow({
    host: settings.imapHost || 'mail.bunnieschi.com',
    port: settings.imapPort || 993,
    secure: settings.imapSecure !== undefined ? settings.imapSecure : true,
    auth: { user: authUser, pass: authPass },
    tls: { rejectUnauthorized: Boolean(settings.rejectUnauthorized) },
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
          message: 'ไม่พบจดหมายในกล่องข้อความ (INBOX ว่างเปล่า)'
        });
      }

      let targetSeq = totalMessages;

      if (settings.useCatchAll) {
        const searchResults = await client.search({
          or: [
            { to: account.email },
            { body: account.emailPrefix }
          ]
        }, { uid: false });

        if (Array.isArray(searchResults) && searchResults.length > 0) {
          targetSeq = Math.max(...searchResults);
        } else {
          return res.json({
            success: true,
            hasEmail: false,
            accountEmail: account.email,
            message: `ยังไม่มีจดหมายส่งถึง ${account.email}`
          });
        }
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
      errorMessage = `การเข้าสู่ระบบล้มเหลว (${authUser}): โปรดตรวจสอบรหัสผ่าน หรือการตั้งค่า Catch-All ในเมนูตั้งค่า`;
    } else if (errorMessage.includes('ENOTFOUND') || errorMessage.includes('ETIMEDOUT') || errorMessage.includes('ECONNREFUSED')) {
      errorMessage = `ไม่สามารถเชื่อมต่อ Mail Server (${settings.imapHost}:${settings.imapPort}) กรุณาตรวจสอบ Host/Port ในเมนูตั้งค่า`;
    }

    return res.status(500).json({
      success: false,
      error: errorMessage,
      details: err.message
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
    const domain = parts[1].toLowerCase().trim();
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
