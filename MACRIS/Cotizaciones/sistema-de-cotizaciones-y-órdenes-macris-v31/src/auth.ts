import * as D from './dom';
import { main as initializeApp } from './main';
import { getSetting, setSetting } from './api';
import { ensureAdminUser, getAppUsers, saveAppUsers } from './user-data';
import { clearSessionUser, setSessionUser } from './user-session';

const LOGIN_KEY = 'macris_app_session_active';
const RECOVERY_CODE_TTL_MS = 10 * 60 * 1000;
const RECOVERY_CODE_KEY_PREFIX = 'macris_user_recovery_';

function handleLoginSuccess() {
    // 1. Persist session
    localStorage.setItem(LOGIN_KEY, 'true');

    // 2. Hide login UI, show app UI
    D.loginOverlay.classList.add('hidden');
    D.appContainer.hidden = false;
    D.mobileNavBar.hidden = false;

    // 3. Initialize the main application
    initializeApp().catch(console.error);
}

function handleLoginFailure(message = 'Usuario o clave incorrecta.') {
    D.loginErrorMsg.textContent = message;
    D.loginErrorMsg.classList.add('visible');
    const container = D.loginOverlay.querySelector('.login-container');
    container?.classList.add('shake');
    D.passwordInput.focus();
    D.passwordInput.select();

    setTimeout(() => {
        container?.classList.remove('shake');
    }, 500);
}

async function handleLoginAttempt(event: Event) {
    event.preventDefault();
    D.loginErrorMsg.classList.remove('visible');
    const username = D.usernameInput?.value.trim().toLowerCase() || '';
    const password = D.passwordInput.value;

    const loginBtn = D.loginForm.querySelector('.login-btn') as HTMLButtonElement;
    if (loginBtn) {
        loginBtn.disabled = true;
        loginBtn.innerHTML = '<div class="spinner" style="width: 20px; height: 20px; border-width: 2px; margin: auto;"></div>';
    }

    try {
        const correctPassword = await getSetting('app_password') || 'wilson1423';
        let sessionUser: { name: string; username: string; role: 'admin' | 'user' } | null = null;

        if (username === '' || username === 'admin') {
            if (password === correctPassword) {
                sessionUser = { name: 'Admin', username: 'admin', role: 'admin' };
            }
        } else {
            const users = await getAppUsers();
            const match = users.find(user => user.username.toLowerCase() === username && user.password === password && user.active);
            if (match) {
                sessionUser = { name: match.name || match.username, username: match.username, role: match.role === 'admin' ? 'admin' : 'user' };
            }
        }

        if (sessionUser) {
            setSessionUser(sessionUser);
            handleLoginSuccess();
        } else {
            handleLoginFailure();
        }
    } catch (error) {
        console.error("Failed to fetch password for login", error);
        handleLoginFailure();
        D.loginErrorMsg.textContent = 'Error de conexión. Intente de nuevo.';
    } finally {
        if (loginBtn) {
            loginBtn.disabled = false;
            loginBtn.innerHTML = 'Ingresar';
        }
    }
}

function setRecoveryStep(step: 'send' | 'verify') {
    const isSend = step === 'send';
    D.recoveryUserStepSend.style.display = isSend ? 'block' : 'none';
    D.recoveryUserStepVerify.style.display = isSend ? 'none' : 'block';
}

function openRecoveryModal() {
    D.recoveryUserError.textContent = '';
    D.recoveryUsernameInput.value = D.usernameInput?.value.trim() || '';
    D.recoveryUserCodeInput.value = '';
    D.recoveryUserPasswordInput.value = '';
    D.recoveryUserConfirmInput.value = '';
    D.recoveryUserEmail.textContent = '-';
    setRecoveryStep('send');
    D.userRecoveryModal.classList.add('active');
    updateRecoveryEmailPreview().catch(console.error);
}

function closeRecoveryModal() {
    D.userRecoveryModal.classList.remove('active');
}

function getRecoveryStorageKey(username: string) {
    return `${RECOVERY_CODE_KEY_PREFIX}${username.toLowerCase()}`;
}

function storeRecoveryCode(username: string, code: string) {
    const payload = { code, createdAt: Date.now() };
    localStorage.setItem(getRecoveryStorageKey(username), JSON.stringify(payload));
}

function getStoredRecoveryCode(username: string) {
    const raw = localStorage.getItem(getRecoveryStorageKey(username));
    if (!raw) return null;
    try {
        return JSON.parse(raw) as { code: string; createdAt: number };
    } catch (error) {
        return null;
    }
}

function clearRecoveryCode(username: string) {
    localStorage.removeItem(getRecoveryStorageKey(username));
}

async function getAdminRecoveryEmail(): Promise<string> {
    const stored = await getSetting('admin_recovery_emails');
    if (stored) {
        try {
            const parsed = JSON.parse(stored);
            if (Array.isArray(parsed) && parsed.length > 0) {
                return String(parsed[0]);
            }
        } catch (error) {
            console.warn('Failed to parse admin recovery emails', error);
        }
    }
    return (await getSetting('company_email')) || '';
}

async function handleSendRecoveryCode() {
    D.recoveryUserError.textContent = '';
    const username = D.recoveryUsernameInput.value.trim().toLowerCase();
    if (!username) {
        D.recoveryUserError.textContent = 'Ingresa tu usuario.';
        return;
    }
    const adminPassword = await getSetting('app_password') || 'wilson1423';
    const users = await ensureAdminUser(adminPassword);
    let email = '';
    if (username === 'admin') {
        email = await getAdminRecoveryEmail();
        if (!email) {
            D.recoveryUserError.textContent = 'No hay correo configurado para el admin.';
            return;
        }
    } else {
        const user = users.find(u => u.username.toLowerCase() === username);
        if (!user) {
            D.recoveryUserError.textContent = 'Usuario no encontrado.';
            return;
        }
        email = user.email || '';
        if (!email) {
            D.recoveryUserError.textContent = 'No hay correo configurado para este usuario.';
            return;
        }
    }
    D.recoveryUserEmail.textContent = email;
    const code = String(Math.floor(100000 + Math.random() * 900000));
    D.recoveryUserSendBtn.disabled = true;
    D.recoveryUserSendBtn.textContent = 'Enviando...';
    try {
        const response = await fetch(`https://formsubmit.co/ajax/${encodeURIComponent(email)}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            body: JSON.stringify({
                name: 'Macris App',
                message: `Codigo de recuperacion: ${code}`,
                _subject: 'Codigo de recuperacion - Macris',
            }),
        });
        if (!response.ok) {
            throw new Error('No se pudo enviar el correo.');
        }
        storeRecoveryCode(username, code);
        setRecoveryStep('verify');
        D.recoveryUserError.textContent = 'Codigo enviado. Revisa el correo.';
    } catch (error) {
        console.error('Recovery email failed', error);
        D.recoveryUserError.textContent = 'Error al enviar el codigo. Intenta de nuevo.';
    } finally {
        D.recoveryUserSendBtn.disabled = false;
        D.recoveryUserSendBtn.textContent = 'Enviar codigo';
    }
}

async function updateRecoveryEmailPreview() {
    D.recoveryUserError.textContent = '';
    const username = D.recoveryUsernameInput.value.trim().toLowerCase();
    if (!username) {
        D.recoveryUserEmail.textContent = '-';
        return;
    }
    const adminPassword = await getSetting('app_password') || 'wilson1423';
    const users = await ensureAdminUser(adminPassword);
    if (username === 'admin') {
        const email = await getAdminRecoveryEmail();
        D.recoveryUserEmail.textContent = email || 'No configurado';
        return;
    }
    const user = users.find(u => u.username.toLowerCase() === username);
    if (!user) {
        D.recoveryUserEmail.textContent = '-';
        return;
    }
    const email = user.email || '';
    D.recoveryUserEmail.textContent = email || 'No configurado';
}

async function handleVerifyRecoveryCode() {
    D.recoveryUserError.textContent = '';
    const username = D.recoveryUsernameInput.value.trim().toLowerCase();
    if (!username) {
        D.recoveryUserError.textContent = 'Ingresa tu usuario.';
        return;
    }
    const payload = getStoredRecoveryCode(username);
    if (!payload) {
        D.recoveryUserError.textContent = 'No hay un codigo activo. Solicita uno nuevo.';
        setRecoveryStep('send');
        return;
    }
    if (Date.now() - payload.createdAt > RECOVERY_CODE_TTL_MS) {
        clearRecoveryCode(username);
        D.recoveryUserError.textContent = 'El codigo expiro. Solicita uno nuevo.';
        setRecoveryStep('send');
        return;
    }
    const code = D.recoveryUserCodeInput.value.trim();
    const newPassword = D.recoveryUserPasswordInput.value.trim();
    const confirm = D.recoveryUserConfirmInput.value.trim();
    if (code !== payload.code) {
        D.recoveryUserError.textContent = 'Codigo incorrecto.';
        return;
    }
    if (!newPassword) {
        D.recoveryUserError.textContent = 'Ingresa la nueva clave.';
        return;
    }
    if (newPassword !== confirm) {
        D.recoveryUserError.textContent = 'Las claves no coinciden.';
        return;
    }

    try {
        const adminPassword = await getSetting('app_password') || 'wilson1423';
        const users = await ensureAdminUser(adminPassword);
        if (username === 'admin') {
            await setSetting('app_password', newPassword);
            const updated = users.map(u => u.username.toLowerCase() === 'admin' ? { ...u, password: newPassword } : u);
            await saveAppUsers(updated);
        } else {
            const updated = users.map(u => u.username.toLowerCase() === username ? { ...u, password: newPassword } : u);
            await saveAppUsers(updated);
        }
        clearRecoveryCode(username);
        D.recoveryUserError.textContent = 'Clave actualizada. Ya puedes ingresar.';
        setTimeout(closeRecoveryModal, 1000);
    } catch (error) {
        console.error('Failed to reset password', error);
        D.recoveryUserError.textContent = 'No se pudo actualizar la clave.';
    }
}

export function handleLogout() {
    localStorage.removeItem(LOGIN_KEY);
    clearSessionUser();
    window.location.reload();
}

export function checkAuth() {
    const isLoggedIn = localStorage.getItem(LOGIN_KEY) === 'true';

    if (isLoggedIn) {
        // Already logged in, start the app immediately
        handleLoginSuccess();
    } else {
        // Not logged in, show login screen and attach listener
        D.loginOverlay.classList.remove('hidden'); 
        D.appContainer.hidden = true;
        D.mobileNavBar.hidden = true;
        if (D.adminPortalLink) {
            const base = import.meta.env.BASE_URL || '/';
            const normalizedBase = base.endsWith('/') ? base : `${base}/`;
            D.adminPortalLink.href = `${normalizedBase}admin/`;
        }
        D.userRecoveryOpen?.addEventListener('click', openRecoveryModal);
        D.userRecoveryClose?.addEventListener('click', closeRecoveryModal);
        D.userRecoveryModal?.addEventListener('click', (event) => {
            if (event.target === D.userRecoveryModal) {
                closeRecoveryModal();
            }
        });
        D.recoveryUserSendBtn?.addEventListener('click', handleSendRecoveryCode);
        D.recoveryUserVerifyBtn?.addEventListener('click', handleVerifyRecoveryCode);
        D.recoveryUsernameInput?.addEventListener('input', () => {
            updateRecoveryEmailPreview().catch(console.error);
        });
        D.loginForm.addEventListener('submit', handleLoginAttempt);
        // Hide the main page loader since the login screen is showing
        const loader = document.getElementById('loader-overlay');
        if (loader) {
            loader.classList.add('fade-out');
            setTimeout(() => {
                if (loader) loader.style.display = 'none';
            }, 500);
        }
    }
}
