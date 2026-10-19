// Bunnieschi Shop - Shop Registration Client Logic

document.addEventListener('DOMContentLoaded', () => {
  if (window.lucide) lucide.createIcons();

  const registerForm = document.getElementById('registerForm');
  const shopNameInput = document.getElementById('shopNameInput');
  const shopEmailInput = document.getElementById('shopEmailInput');
  const shopPassInput = document.getElementById('shopPassInput');
  const shopConfirmPassInput = document.getElementById('shopConfirmPassInput');
  const registerError = document.getElementById('registerError');
  const registerErrorText = document.getElementById('registerErrorText');
  const btnRegisterSubmit = document.getElementById('btnRegisterSubmit');
  const toastContainer = document.getElementById('toastContainer');

  // Avatar state and elements
  let currentAvatarBase64 = '';
  const shopAvatarInput = document.getElementById('shopAvatarInput');
  const shopAvatarPreview = document.getElementById('shopAvatarPreview');
  const shopAvatarDefault = document.getElementById('shopAvatarDefault');
  const btnTriggerAvatarUpload = document.getElementById('btnTriggerAvatarUpload');
  const btnUploadAvatarText = document.getElementById('btnUploadAvatarText');
  const btnRemoveAvatar = document.getElementById('btnRemoveAvatar');

  if (btnRemoveAvatar) {
    btnRemoveAvatar.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      currentAvatarBase64 = '';
      if (shopAvatarInput) shopAvatarInput.value = '';
      if (shopAvatarPreview) {
        shopAvatarPreview.src = '';
        shopAvatarPreview.classList.add('hidden');
      }
      if (shopAvatarDefault) shopAvatarDefault.classList.remove('hidden');
      btnRemoveAvatar.classList.add('hidden');
    });
  }

  if (shopAvatarInput) {
    shopAvatarInput.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;

      if (!file.type.startsWith('image/')) {
        showError('กรุณาเลือกไฟล์รูปภาพเท่านั้น (เช่น JPG, PNG, WebP)');
        return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          // Resize via canvas to max 256x256 to keep payload small and fast
          const canvas = document.createElement('canvas');
          const maxDim = 256;
          let width = img.width;
          let height = img.height;
          if (width > height) {
            if (width > maxDim) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            }
          } else {
            if (height > maxDim) {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          currentAvatarBase64 = canvas.toDataURL('image/jpeg', 0.85);

          if (shopAvatarPreview) {
            shopAvatarPreview.src = currentAvatarBase64;
            shopAvatarPreview.classList.remove('hidden');
          }
          if (shopAvatarDefault) shopAvatarDefault.classList.add('hidden');
          if (btnRemoveAvatar) btnRemoveAvatar.classList.remove('hidden');
        };
        img.src = event.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    registerError.classList.add('hidden');

    const shopName = shopNameInput.value.trim();
    const email = shopEmailInput.value.trim();
    const password = shopPassInput.value.trim();
    const confirmPass = shopConfirmPassInput.value.trim();

    if (!shopName || !email || !password) {
      showError('กรุณากรอกข้อมูลให้ครบถ้วน');
      return;
    }

    if (password.length < 6) {
      showError('รหัสผ่านต้องมีความยาวอย่างน้อย 6 ตัวอักษร');
      return;
    }

    if (password !== confirmPass) {
      showError('รหัสผ่านและการยืนยันรหัสผ่านไม่ตรงกัน');
      return;
    }

    btnRegisterSubmit.disabled = true;
    btnRegisterSubmit.innerHTML = `
      <i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i>
      <span>กำลังสร้างบัญชีร้านค้า...</span>
    `;
    if (window.lucide) lucide.createIcons();

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shopName, email, password, avatar: currentAvatarBase64 })
      });

      const contentType = res.headers.get('content-type') || '';
      let data;
      if (contentType.includes('application/json')) {
        data = await res.json();
      } else {
        const rawText = await res.text();
        if (res.status === 404) {
          throw new Error('ไม่พบปลายทาง API บน Server (404 Not Found) - กรุณาตรวจสอบว่าได้อัปเดตไฟล์ vercel.json และโฟลเดอร์ api ขึ้น GitHub แล้ว');
        }
        throw new Error(`เซิร์ฟเวอร์ส่งการตอบกลับที่ไม่ถูกต้อง (HTTP ${res.status}): ${rawText.slice(0, 100)}`);
      }

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'การสมัครสมาชิกล้มเหลว');
      }

      // Save token and auto-login
      localStorage.setItem('bunnieschi_token', data.token);
      showToast(`สมัครร้านค้า "${data.shop.shopName}" สำเร็จ! กำลังพาท่านเข้าสู่ระบบ...`, 'success');

      setTimeout(() => {
        window.location.href = 'index.html';
      }, 1200);

    } catch (err) {
      showError(err.message);
    } finally {
      btnRegisterSubmit.disabled = false;
      btnRegisterSubmit.innerHTML = `
        <i data-lucide="user-plus" class="w-4 h-4"></i>
        <span>ยืนยันการสมัครสมาชิกร้านค้า</span>
      `;
      if (window.lucide) lucide.createIcons();
    }
  });

  function showError(msg) {
    registerErrorText.textContent = msg;
    registerError.classList.remove('hidden');
  }

  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast px-4 py-2.5 rounded-2xl shadow-md text-xs font-bold flex items-center gap-2 border-2 pointer-events-auto ${
      type === 'success'
        ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
        : 'bg-rose-50 text-rose-800 border-rose-300'
    }`;
    toast.textContent = message;
    toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.2s ease-out';
      setTimeout(() => toast.remove(), 200);
    }, 2500);
  }
});
