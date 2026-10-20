/**
 * ====================================================================
 * 🐰 Bunnieschi Mail Hub - Cloudflare Email Routing Worker (Dual Delivery)
 * ====================================================================
 * สคริปต์นี้ทำหน้าที่ 2 อย่างพร้อมกันแบบ Real-time (0.5 วินาที):
 * 1. ส่งสำเนาอีเมลฉบับเต็มตรงเข้ากล่องข้อความใน iPad ของคุณ (เปิดอ่านและกดลิงก์ Netflix ได้ทันที)
 * 2. ส่งข้อมูลอีเมลเข้า Webhook ของเว็บเรา (ดึงเลข OTP และสกัดลิงก์ยืนยันเข้า Dashboard อัตโนมัติ)
 * 
 * --------------------------------------------------------------------
 * 📋 วิธีการติดตั้งใน Cloudflare (ทำตาม 5 ขั้นตอนนี้):
 * --------------------------------------------------------------------
 * 1. เพิ่มและยืนยันอีเมล iPad ของคุณใน Cloudflare:
 *    - เข้า Cloudflare Dashboard -> โดเมนของคุณ (เช่น bunnieschi.com)
 *    - เมนูซ้ายเลือก "Email Routing" -> ไปที่แท็บ "Destination addresses"
 *    - กด "Add destination address" -> ใส่อีเมลของคุณที่ใช้อยู่ใน iPad (เช่น yourname@gmail.com หรือ yourname@icloud.com)
 *    - เปิดแอป Mail ใน iPad เพื่อกดลิงก์ยืนยัน (Verify) ที่ Cloudflare ส่งไปให้
 * 
 * 2. สร้าง Worker:
 *    - ไปที่แท็บ "Email Workers" -> กด "Create worker"
 *    - คัดลอกโค้ดทั้งหมดในไฟล์นี้ไปวางแทนที่โค้ดเดิม
 *    - แก้ไข 2 บรรทัดด้านล่าง:
 *      * WEBHOOK_URL: ใส่ URL เว็บไซต์ของคุณที่ Vercel (เช่น https://miki-mail.vercel.app/api/webhook/email)
 *      * IPAD_EMAIL: ใส่อีเมลของคุณใน iPad ที่ยืนยันไว้ในข้อ 1
 *    - กดปุ่ม "Save and Deploy"
 * 
 * 3. ผูก Worker เข้ากับ Catch-all:
 *    - ไปที่แท็บ "Routing Rules"
 *    - หัวข้อ "Catch-all address" กด Edit
 *    - Action: เลือก "Send to a Worker"
 *    - Destination: เลือกชื่อ Worker ที่เพิ่งสร้างขึ้นมานี้
 *    - กด Save
 * 
 * เพียงเท่านี้ เมลทุกฉบับจะเด้งเข้าทั้งใน iPad ของคุณ และเด้งเข้าหน้าเว็บพร้อมกันทันที!
 */

export default {
  async email(message, env, ctx) {
    // 🔴 1. แก้ไข URL เว็บไซต์ของคุณบน Vercel (ต้องลงท้ายด้วย /api/webhook/email)
    const WEBHOOK_URL = env.WEBHOOK_URL || "https://your-site.vercel.app/api/webhook/email";

    // 🔴 2. ใส่อีเมลของคุณที่ใช้อยู่ใน iPad (ที่กดยืนยันใน Destination addresses แล้ว)
    const IPAD_EMAIL = env.IPAD_EMAIL || "ใส่เมลในไอแพดของคุณ@gmail.com";

    try {
      const to = message.to;
      const from = message.from;
      const subject = message.headers.get("subject") || "(ไม่มีหัวข้อ)";

      console.log(`[Email Received] To: ${to} | From: ${from} | Subject: ${subject}`);

      // --------------------------------------------------------------
      // [1/2] ส่งสำเนาเมลฉบับเต็มเข้ากล่องข้อความ iPad (เปิดอ่าน & กดลิงก์ได้)
      // --------------------------------------------------------------
      if (IPAD_EMAIL && !IPAD_EMAIL.includes("ใส่เมลในไอแพด")) {
        try {
          await message.forward(IPAD_EMAIL);
          console.log(`✅ สำเนาเมลถูกส่งเข้า iPad เรียบร้อย: ${IPAD_EMAIL}`);
        } catch (fErr) {
          console.warn("⚠️ ไม่สามารถ Forward ไปยัง iPad ได้ (โปรดตรวจดูว่ากดยืนยันอีเมลใน Destination addresses หรือยัง):", fErr.message);
        }
      }

      // --------------------------------------------------------------
      // [2/2] อ่านเนื้อหาและส่งเข้า Webhook ของระบบ Bunnieschi บน Vercel
      // --------------------------------------------------------------
      const rawStream = message.raw;
      const rawBuffer = await new Response(rawStream).arrayBuffer();
      const rawText = new TextDecoder("utf-8").decode(rawBuffer);

      const res = await fetch(WEBHOOK_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          to: to,
          from: from,
          subject: subject,
          raw: rawText
        })
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error(`❌ Webhook error HTTP ${res.status}: ${errText}`);
      } else {
        const result = await res.json();
        console.log("✅ Webhook processed successfully:", result);
      }

    } catch (err) {
      console.error("Worker processing failed:", err.message);
    }
  }
};
