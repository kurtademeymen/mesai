// ------------ API AYARLARI ------------
const MESAI_API_URL = 'https://sheetdb.io/api/v1/y0qzyk3qvci2a'; 
const KULLANICI_API_URL = 'https://sheetdb.io/api/v1/c1usjmv4hlpvz'; 
// ----------------------------------------

// --- HTML Elementleri
const loginContainer = document.getElementById('login-container');
const dashboardContainer = document.getElementById('dashboard-container');
const loginFormContainer = document.getElementById('login-form-container');
const loginForm = document.getElementById('login-form');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const btnLSPD = document.getElementById('btnLSPD');
const btnLSMD = document.getElementById('btnLSMD');
const mesaiButton = document.getElementById('btnMesai');
const logoutButton = document.getElementById('btnLogout');
const durumMesaji = document.getElementById('durum');
const welcomeMessage = document.getElementById('welcome-message');
const totalMesaiDisplay = document.getElementById('total-mesai-display');
const adminControls = document.getElementById('admin-controls');
const btnToggleAdminPanel = document.getElementById('btnToggleAdminPanel');
const btnDeleteAllShifts = document.getElementById('btnDeleteAllShifts');
const adminPanelModal = document.getElementById('admin-panel-modal');
const closeAdminPanel = document.getElementById('close-admin-panel');
const activeShiftsList = document.getElementById('active-shifts-list');
const btnRefreshList = document.getElementById('btnRefreshList');
const btnToggleAddShiftPanel = document.getElementById('btnToggleAddShiftPanel');
const addShiftModal = document.getElementById('add-shift-modal');
const closeAddShiftPanel = document.getElementById('close-add-shift-panel');
const addShiftForm = document.getElementById('add-shift-form');

let selectedDepartment = null;
let shiftCheckInterval = null;

document.addEventListener('DOMContentLoaded', () => {
    const user = getLoggedInUser();
    if (user) { showDashboard(user); } 
    else { showLogin(); }
});

[btnLSPD, btnLSMD].forEach(button => {
    button.addEventListener('click', () => {
        selectedDepartment = button.dataset.department;
        btnLSPD.classList.remove('selected');
        btnLSMD.classList.remove('selected');
        button.classList.add('selected');
        loginFormContainer.style.display = 'block';
    });
});

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!selectedDepartment) { alert('Lütfen önce bir departman seçin!'); return; }
    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();
    if (!username || !password) return;
    try {
        const response = await fetch(`${KULLANICI_API_URL}/search?KullaniciAdi=${username}&Departman=${selectedDepartment}`);
        const userData = await response.json();
        if (userData.length > 0 && userData[0].Sifre === password) {
            const user = { username: userData[0].KullaniciAdi, role: userData[0].Rol, department: userData[0].Departman };
            saveUserToLocalStorage(user);
            showDashboard(user);
        } else { alert('Kullanıcı adı veya şifre hatalı ya da bu departmana ait değilsiniz!'); }
    } catch (error) { alert('Giriş yapılırken bir hata oluştu: ' + error.message); }
});

logoutButton.addEventListener('click', () => {
    localStorage.clear();
    showLogin();
});

function showLogin() {
    loginContainer.style.display = 'block';
    dashboardContainer.style.display = 'none';
    loginFormContainer.style.display = 'none';
    btnLSPD.classList.remove('selected');
    btnLSMD.classList.remove('selected');
    usernameInput.value = '';
    passwordInput.value = '';
    selectedDepartment = null;
    stopShiftStatusChecker();
}

async function showDashboard(user) {
    loginContainer.style.display = 'none';
    dashboardContainer.style.display = 'block';
    welcomeMessage.textContent = `Hoş geldin, ${user.username}! (${user.department})`;
    
    // DÜZELTME 3: Adminler için de çıkış butonu her zaman görünür olacak.
    if (user.role === 'admin') {
        adminControls.style.display = 'block';
    } else {
        adminControls.style.display = 'none';
    }
    logoutButton.style.display = 'block'; // Her durumda görünür yap

    await updateTotalMesaiDisplay(user.username);
    await checkActiveShift(user.username);
    startShiftStatusChecker(user.username);
}

mesaiButton.addEventListener('click', () => {
    const user = getLoggedInUser();
    if (!user) return;
    if (mesaiButton.classList.contains('bitir')) mesaiBitir(user.username);
    else mesaiBaslat(user.username);
});

async function mesaiBaslat(kullanici) {
    durumMesaji.textContent = 'Mesai başlatılıyor...';
    mesaiButton.disabled = true;
    const baslangicZamani = new Date().toISOString();
    const user = getLoggedInUser();
    try {
        await fetch(MESAI_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: [{ 'Kullanıcı': kullanici, 'Departman': user.department, 'Mesai Giriş': baslangicZamani, 'Mesai Çıkış': '', 'Toplam Süre': '' }] })
        });
        setMesaiButtonState('bitir');
        durumMesaji.textContent = `${kullanici} mesaiye başladı!`;
    } catch (error) {
        durumMesaji.textContent = 'Hata: ' + error.message;
    } finally {
        mesaiButton.disabled = false;
    }
}

async function mesaiBitir(kullanici) {
    durumMesaji.textContent = 'Mesai bitiriliyor...';
    mesaiButton.disabled = true;
    try {
        const searchResponse = await fetch(`${MESAI_API_URL}/search?Kullanıcı=${kullanici}&Mesai Çıkış=`);
        if (!searchResponse.ok) throw new Error('Aktif mesai aranırken API hatası.');
        const activeShifts = await searchResponse.json();
        if (activeShifts.length === 0) {
            durumMesaji.textContent = 'Aktif mesainiz bulunmuyor. Muhtemelen bir yönetici tarafından sonlandırıldı.';
            setMesaiButtonState('baslat');
            return;
        }
        const shiftToUpdate = activeShifts[0];
        const baslangicZamaniStr = shiftToUpdate['Mesai Giriş'];
        const baslangicTimestamp = new Date(baslangicZamaniStr).getTime();
        const toplamSn = Math.round((Date.now() - baslangicTimestamp) / 1000);
        const bitisZamani = new Date().toISOString();
        const response = await fetch(`${MESAI_API_URL}/Mesai Giriş/${encodeURIComponent(baslangicZamaniStr)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: { 'Mesai Çıkış': bitisZamani, 'Toplam Süre': toplamSn } })
        });
        if (!response.ok) throw new Error('API güncellenemedi.');
        setMesaiButtonState('baslat');
        durumMesaji.textContent = `Mesai bitti.`;
        await updateTotalMesaiDisplay(kullanici);
    } catch (error) {
        durumMesaji.textContent = 'Hata: ' + error.message;
    } finally {
        mesaiButton.disabled = false;
    }
}

function startShiftStatusChecker(username) {
    stopShiftStatusChecker();
    shiftCheckInterval = setInterval(async () => {
        if (getLoggedInUser() && dashboardContainer.style.display === 'block') {
            try {
                const response = await fetch(`${MESAI_API_URL}/search?Kullanıcı=${username}&Mesai Çıkış=`);
                if (!response.ok) return; // Hata varsa sessizce geç
                const activeShifts = await response.json();
                if (activeShifts.length === 0 && mesaiButton.classList.contains('bitir')) {
                    setMesaiButtonState('baslat');
                    durumMesaji.textContent = 'Mesainiz bir yönetici tarafından sonlandırıldı.';
                }
            } catch (error) { /* Sessiz kal, konsola loglama */ }
        }
    }, 15000); // Kontrol aralığı 15 saniyeye düşürüldü
}

function stopShiftStatusChecker() {
    if (shiftCheckInterval) {
        clearInterval(shiftCheckInterval);
        shiftCheckInterval = null;
    }
}

btnToggleAdminPanel.addEventListener('click', () => {
    adminPanelModal.style.display = 'block';
    fetchAndDisplayActiveShifts();
});
closeAdminPanel.addEventListener('click', () => { adminPanelModal.style.display = 'none'; });
btnToggleAddShiftPanel.addEventListener('click', () => { addShiftModal.style.display = 'block'; });
closeAddShiftPanel.addEventListener('click', () => { addShiftModal.style.display = 'none'; });
window.addEventListener('click', (event) => { 
    if (event.target == adminPanelModal) adminPanelModal.style.display = 'none';
    if (event.target == addShiftModal) addShiftModal.style.display = 'none';
});
btnRefreshList.addEventListener('click', fetchAndDisplayActiveShifts);

async function fetchAndDisplayActiveShifts() { /* Öncekiyle aynı */ }
async function adminCloseShift(shiftStartTime) { /* Öncekiyle aynı */ }
async function adminDeleteShift(shiftStartTime) { /* Öncekiyle aynı */ }

// DEĞİŞİKLİK 2: "Mesai Ekle" fonksiyonuna hata ayıklama kodları eklendi.
addShiftForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    console.log("--- 'Mesai Ekle' Butonuna Tıklandı ---");

    const username = document.getElementById('add-shift-username').value;
    const department = document.getElementById('add-shift-department').value;
    const start = document.getElementById('add-shift-start').value;
    const end = document.getElementById('add-shift-end').value;

    console.log("Toplanan Form Verileri:", { username, department, start, end });

    if (!username || !department || !start || !end) {
        alert('Tüm alanlar doldurulmalıdır.');
        console.error("Hata: Formda eksik alan var.");
        return;
    }
    
    const startTime = new Date(start);
    const endTime = new Date(end);

    if (startTime >= endTime) {
        alert('Bitiş zamanı, başlangıç zamanından sonra olmalıdır.');
        console.error("Hata: Bitiş zamanı başlangıçtan önce veya aynı.");
        return;
    }

    const durationInSeconds = Math.round((endTime.getTime() - startTime.getTime()) / 1000);
    console.log("Hesaplanan Toplam Süre (saniye):", durationInSeconds);

    const shiftData = {
        'Kullanıcı': username,
        'Departman': department,
        'Mesai Giriş': startTime.toISOString(),
        'Mesai Çıkış': endTime.toISOString(),
        'Toplam Süre': durationInSeconds
    };

    console.log("API'ye Gönderilecek Son Veri (JSON):", JSON.stringify({ data: [shiftData] }));

    try {
        const response = await fetch(MESAI_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: [shiftData] })
        });

        console.log("API'den Gelen Yanıt (Response):", response);

        if (!response.ok) {
            const errorText = await response.text();
            console.error("API Hata Detayı:", errorText);
            throw new Error(`API'ye veri gönderilemedi. Statü: ${response.status}`);
        }
        
        console.log("Başarılı: Mesai eklendi!");
        alert(`${username} için mesai başarıyla eklendi.`);
        addShiftForm.reset();
        addShiftModal.style.display = 'none';
    } catch (error) {
        console.error("Catch Bloğuna Düşen Hata:", error);
        alert('Mesai eklenirken bir hata oluştu: ' + error.message + ' (Detaylar için F12 > Konsol\'a bakın)');
    }
});

btnDeleteAllShifts.addEventListener('click', async () => { /* Öncekiyle aynı */ });
function saveUserToLocalStorage(user) { /* Öncekiyle aynı */ }
function getLoggedInUser() { /* Öncekiyle aynı */ }
async function updateTotalMesaiDisplay(kullanici) { /* Öncekiyle aynı */ }
async function checkActiveShift(kullanici) { /* Öncekiyle aynı */ }
function setMesaiButtonState(state) { /* Öncekiyle aynı */ }

// --- Tekrar eden fonksiyonların tam halleri ---
async function fetchAndDisplayActiveShifts() {
    activeShiftsList.innerHTML = '<p>Aktif mesailer yükleniyor...</p>';
    const admin = getLoggedInUser();
    try {
        const response = await fetch(`${MESAI_API_URL}/search?Mesai Çıkış=&Departman=${admin.department}`);
        const shifts = await response.json();
        activeShiftsList.innerHTML = '';
        if (shifts.length === 0) {
            activeShiftsList.innerHTML = `<p>Şu anda ${admin.department} departmanında aktif mesaisi olan kimse yok.</p>`;
            return;
        }
        shifts.forEach(shift => {
            const shiftItem = document.createElement('div');
            shiftItem.className = 'shift-item';
            const startTime = new Date(shift['Mesai Giriş']);
            const formattedTime = startTime.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
            shiftItem.innerHTML = `<div class="shift-info"><strong>${shift['Kullanıcı']}</strong> - Başlangıç: ${formattedTime}</div><div class="shift-actions"><button class="btn-close-shift">Mesaiyi Kapat</button><button class="btn-delete-shift">Mesaiyi Sil</button></div>`;
            shiftItem.querySelector('.btn-close-shift').addEventListener('click', () => adminCloseShift(shift['Mesai Giriş']));
            shiftItem.querySelector('.btn-delete-shift').addEventListener('click', () => adminDeleteShift(shift['Mesai Giriş']));
            activeShiftsList.appendChild(shiftItem);
        });
    } catch (error) { activeShiftsList.innerHTML = `<p style="color: var(--danger-red);">Mesailer yüklenirken hata oluştu: ${error.message}</p>`; }
}
async function adminCloseShift(shiftStartTime) {
    if (!confirm("Bu kullanıcının mesaisi normal şekilde sonlandırılacak. Onaylıyor musunuz?")) return;
    try {
        const baslangicTimestamp = new Date(shiftStartTime).getTime();
        const toplamSn = Math.round((Date.now() - baslangicTimestamp) / 1000);
        const bitisZamani = new Date().toISOString();
        await fetch(`${MESAI_API_URL}/Mesai Giriş/${encodeURIComponent(shiftStartTime)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: { 'Mesai Çıkış': bitisZamani, 'Toplam Süre': toplamSn } }) });
        alert("Mesai başarıyla kapatıldı.");
        fetchAndDisplayActiveShifts();
    } catch (error) { alert("Mesai kapatılırken bir hata oluştu: " + error.message); }
}
async function adminDeleteShift(shiftStartTime) {
    if (!confirm("DİKKAT! Bu mesai kaydı kalıcı olarak silinecek ve hiç yapılmamış gibi olacak. Emin misiniz?")) return;
    try {
        await fetch(`${MESAI_API_URL}/Mesai Giriş/${encodeURIComponent(shiftStartTime)}`, { method: 'DELETE' });
        alert("Mesai kaydı başarıyla silindi.");
        fetchAndDisplayActiveShifts();
    } catch (error) { alert("Mesai silinirken bir hata oluştu: " + error.message); }
}
btnDeleteAllShifts.addEventListener('click', async () => {
    if (confirm("EMİN MİSİNİZ? TÜM MESAİ KAYITLARI SİLİNECEK! Bu işlem geri alınamaz.")) {
        try {
            await fetch(`${MESAI_API_URL}/all`, { method: 'DELETE' });
            alert('Tüm mesai kayıtları başarıyla silindi!');
            const user = getLoggedInUser();
            if (user) await updateTotalMesaiDisplay(user.username);
        } catch (error) { alert('Hata: ' + error.message); }
    }
});
function saveUserToLocalStorage(user) { localStorage.setItem('loggedInUser', JSON.stringify(user)); }
function getLoggedInUser() { return JSON.parse(localStorage.getItem('loggedInUser')); }
async function updateTotalMesaiDisplay(kullanici) {
    totalMesaiDisplay.textContent = 'Hesaplanıyor...';
    try {
        const response = await fetch(`${MESAI_API_URL}/search?Kullanıcı=${kullanici}`);
        const shifts = await response.json();
        let totalSeconds = 0;
        for (const shift of shifts) {
            const sure = parseInt(shift['Toplam Süre'], 10);
            if (!isNaN(sure)) { totalSeconds += sure; }
        }
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        const pad = (num) => num.toString().padStart(2, '0');
        totalMesaiDisplay.textContent = `${pad(hours)} saat ${pad(minutes)} dakika ${pad(seconds)} saniye`;
    } catch (error) { totalMesaiDisplay.textContent = 'Hesaplanamadı!'; }
}
async function checkActiveShift(kullanici) {
    try {
        const response = await fetch(`${MESAI_API_URL}/search?Kullanıcı=${kullanici}&Mesai Çıkış=`);
        const activeShifts = await response.json();
        if (activeShifts.length > 0) { setMesaiButtonState('bitir'); } 
        else { setMesaiButtonState('baslat'); }
    } catch (error) { console.error("Aktif mesai kontrol edilemedi:", error); }
}
function setMesaiButtonState(state) {
    if (state === 'bitir') {
        mesaiButton.textContent = 'Mesai Bitir';
        mesaiButton.classList.add('bitir');
        durumMesaji.textContent = `Şu anda mesaide.`;
    } else {
        mesaiButton.textContent = 'Mesai Başlat';
        mesaiButton.classList.remove('bitir');
        durumMesaji.textContent = ``;
    }
}
