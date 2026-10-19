-- ====================================================================
-- Bunnieschi Shop - Supabase Database Schema (Multi-Tenant System)
-- คัดลอกโค้ดทั้งหมดนี้ไปวางใน Supabase -> SQL Editor แล้วกด Run
-- ====================================================================

-- 1. Enable UUID Extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Shops Table (ตารางร้านค้า)
CREATE TABLE IF NOT EXISTS public.shops (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    shop_name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    avatar TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- เพิ่มคอลัมน์ avatar หากมีตารางเดิมอยู่แล้ว
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='shops' AND column_name='avatar') THEN
        ALTER TABLE public.shops ADD COLUMN avatar TEXT DEFAULT '';
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_shops_email ON public.shops(email);

-- 3. Shop Settings Table (การตั้งค่า IMAP แยกรายร้าน)
CREATE TABLE IF NOT EXISTS public.shop_settings (
    shop_id TEXT PRIMARY KEY REFERENCES public.shops(id) ON DELETE CASCADE,
    domain TEXT DEFAULT 'bunnieschi.com',
    imap_host TEXT DEFAULT 'imap.secureserver.net',
    imap_port INTEGER DEFAULT 993,
    imap_secure BOOLEAN DEFAULT true,
    reject_unauthorized BOOLEAN DEFAULT false,
    use_catch_all BOOLEAN DEFAULT true,
    catch_all_email TEXT DEFAULT 'mikibun@bunnieschi.com',
    catch_all_password TEXT DEFAULT 'pamcake2547',
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Accounts Table (คลังบัญชีเมลพรีเมี่ยมแยกรายร้าน)
CREATE TABLE IF NOT EXISTS public.accounts (
    id TEXT PRIMARY KEY,
    shop_id TEXT REFERENCES public.shops(id) ON DELETE CASCADE NOT NULL,
    email TEXT NOT NULL,
    email_prefix TEXT NOT NULL,
    password TEXT NOT NULL,
    apps JSONB DEFAULT '["Other"]'::jsonb NOT NULL,
    duration TEXT DEFAULT '30_days' NOT NULL,
    duration_custom TEXT DEFAULT '',
    note TEXT DEFAULT '',
    status TEXT DEFAULT 'active' NOT NULL,
    last_otp JSONB DEFAULT NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_accounts_shop_id ON public.accounts(shop_id);
CREATE INDEX IF NOT EXISTS idx_accounts_email ON public.accounts(email);
CREATE INDEX IF NOT EXISTS idx_accounts_duration ON public.accounts(duration);

-- 5. App Presets Table (รายชื่อแอปพรีเมี่ยมของแต่ละร้าน)
CREATE TABLE IF NOT EXISTS public.app_presets (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    shop_id TEXT REFERENCES public.shops(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT uq_shop_app_name UNIQUE (shop_id, name)
);

CREATE INDEX IF NOT EXISTS idx_app_presets_shop_id ON public.app_presets(shop_id);

-- 6. Trigger Function เมื่อมีร้านค้าสมัครใหม่ ให้ใส่ค่าเริ่มต้นทันที
CREATE OR REPLACE FUNCTION public.handle_new_shop()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.shop_settings (shop_id, domain, imap_host, imap_port, imap_secure, use_catch_all, catch_all_email, catch_all_password)
    VALUES (NEW.id, 'bunnieschi.com', 'imap.secureserver.net', 993, true, true, 'mikibun@bunnieschi.com', 'pamcake2547')
    ON CONFLICT (shop_id) DO NOTHING;

    INSERT INTO public.app_presets (shop_id, name) VALUES
        (NEW.id, 'Netflix'),
        (NEW.id, 'Spotify'),
        (NEW.id, 'Canva Pro'),
        (NEW.id, 'YouTube Premium'),
        (NEW.id, 'ChatGPT'),
        (NEW.id, 'Claude AI'),
        (NEW.id, 'Disney+'),
        (NEW.id, 'Viu'),
        (NEW.id, 'iQIYI'),
        (NEW.id, 'Prime Video')
    ON CONFLICT (shop_id, name) DO NOTHING;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_shop_created ON public.shops;
CREATE TRIGGER on_shop_created
    AFTER INSERT ON public.shops
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_shop();

-- 7. ปิด Row Level Security (RLS) เพื่อให้ Backend บันทึกและดึงข้อมูลได้ราบรื่น 100%
ALTER TABLE public.shops DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.shop_settings DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounts DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_presets DISABLE ROW LEVEL SECURITY;
