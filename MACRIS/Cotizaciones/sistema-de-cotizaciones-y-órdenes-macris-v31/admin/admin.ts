import { getSetting } from '../src/api';
import { ensureAdminUser, saveAppUsers } from '../src/user-data';
import { getItemsFromSupabase, getOrdersFromSupabase, getQuotesFromSupabase, getSetting, setSetting } from '../src/api';
import { formatCurrency, generateId } from '../src/utils';
import type { AppUser } from '../src/types';

const ADMIN_SESSION_KEY = 'macris_admin_session_active';

const loginView = document.getElementById('admin-login') as HTMLDivElement;
const appView = document.getElementById('admin-app') as HTMLDivElement;
const loginForm = document.getElementById('admin-login-form') as HTMLFormElement;
const loginError = document.getElementById('admin-login-error') as HTMLParagraphElement;
const loginUsername = document.getElementById('admin-username') as HTMLInputElement;
const loginPassword = document.getElementById('admin-password') as HTMLInputElement;
const logoutBtn = document.getElementById('admin-logout') as HTMLButtonElement;
const recoveryOpenBtn = document.getElementById('admin-recovery-open') as HTMLButtonElement;
const recoveryModal = document.getElementById('admin-recovery-modal') as HTMLDivElement;
const recoveryCloseBtn = document.getElementById('admin-recovery-close') as HTMLButtonElement;
const recoveryEmailSelect = document.getElementById('recovery-email-select') as HTMLSelectElement;
const recoveryEmailLabel = document.getElementById('recovery-email-label') as HTMLSpanElement;
const recoverySendBtn = document.getElementById('recovery-send') as HTMLButtonElement;
const recoveryStepSend = document.getElementById('recovery-step-send') as HTMLDivElement;
const recoveryStepVerify = document.getElementById('recovery-step-verify') as HTMLDivElement;
const recoveryCodeInput = document.getElementById('recovery-code') as HTMLInputElement;
const recoveryPasswordInput = document.getElementById('recovery-new-password') as HTMLInputElement;
const recoveryConfirmInput = document.getElementById('recovery-confirm-password') as HTMLInputElement;
const recoveryVerifyBtn = document.getElementById('recovery-verify') as HTMLButtonElement;
const recoveryError = document.getElementById('recovery-error') as HTMLParagraphElement;

const userForm = document.getElementById('user-form') as HTMLFormElement;
const userNameInput = document.getElementById('user-name') as HTMLInputElement;
const userUsernameInput = document.getElementById('user-username') as HTMLInputElement;
const userEmailInput = document.getElementById('user-email') as HTMLInputElement;
const userPasswordInput = document.getElementById('user-password') as HTMLInputElement;
const userFormError = document.getElementById('user-form-error') as HTMLParagraphElement;
const userSearchInput = document.getElementById('user-search') as HTMLInputElement;
const userEditModal = document.getElementById('user-edit-modal') as HTMLDivElement;
const userEditForm = document.getElementById('user-edit-form') as HTMLFormElement;
const userEditHint = document.getElementById('user-edit-hint') as HTMLParagraphElement;
const editNameInput = document.getElementById('edit-user-name') as HTMLInputElement;
const editUsernameInput = document.getElementById('edit-user-username') as HTMLInputElement;
const editEmailInput = document.getElementById('edit-user-email') as HTMLInputElement;
const editPasswordInput = document.getElementById('edit-user-password') as HTMLInputElement;
const editActiveInput = document.getElementById('edit-user-active') as HTMLInputElement;
const editUserError = document.getElementById('user-edit-error') as HTMLParagraphElement;
const editUserResetBtn = document.getElementById('edit-user-reset') as HTMLButtonElement;
const editUserCloseBtn = document.getElementById('user-edit-close') as HTMLButtonElement;
const editUserSaveBtn = document.querySelector('#user-edit-form button[type="submit"]') as HTMLButtonElement;
const userList = document.getElementById('user-list') as HTMLDivElement;
const refreshUsersBtn = document.getElementById('refresh-users') as HTMLButtonElement;
const recoveryEmailPrimary = document.getElementById('recovery-email-primary') as HTMLInputElement;
const recoveryEmailBackups = document.getElementById('recovery-email-backups') as HTMLInputElement;
const recoveryEmailError = document.getElementById('recovery-email-error') as HTMLParagraphElement;
const recoveryEmailSaveBtn = document.getElementById('recovery-email-save') as HTMLButtonElement;
const userDeleteModal = document.getElementById('user-delete-modal') as HTMLDivElement;
const userDeleteText = document.getElementById('user-delete-text') as HTMLParagraphElement;
const userDeleteConfirm = document.getElementById('user-delete-confirm') as HTMLButtonElement;
const userDeleteCancel = document.getElementById('user-delete-cancel') as HTMLButtonElement;
const userDeleteClose = document.getElementById('user-delete-close') as HTMLButtonElement;

const refreshAnalyticsBtn = document.getElementById('refresh-analytics') as HTMLButtonElement;
const analyticsUpdated = document.getElementById('analytics-updated') as HTMLSpanElement;
const metricQuotes = document.getElementById('metric-quotes') as HTMLSpanElement;
const metricOrders = document.getElementById('metric-orders') as HTMLSpanElement;
const metricQuotesRevenue = document.getElementById('metric-quotes-revenue') as HTMLSpanElement;
const metricOrdersRevenue = document.getElementById('metric-orders-revenue') as HTMLSpanElement;
const metricItemsSold = document.getElementById('metric-items-sold') as HTMLSpanElement;
const ordersLineChart = document.getElementById('orders-line-chart') as HTMLDivElement;
const topItemsBarChart = document.getElementById('top-items-bar-chart') as HTMLDivElement;
const topOrderItems = document.getElementById('top-order-items') as HTMLOListElement;
const topQuoteItems = document.getElementById('top-quote-items') as HTMLOListElement;
const ordersByStatus = document.getElementById('orders-by-status') as HTMLUListElement;
const topServiceTypes = document.getElementById('top-service-types') as HTMLOListElement;
const toMainLink = document.getElementById('admin-to-main') as HTMLAnchorElement;
const toMainLinkHeader = document.getElementById('admin-to-main-header') as HTMLAnchorElement;

let adminPassword = 'wilson1423';
let cachedUsers: AppUser[] = [];
let selectedUserId: string | null = null;
const RECOVERY_STORAGE_KEY = 'macris_admin_recovery';
const RECOVERY_EMAILS_KEY = 'admin_recovery_emails';
let recoveryEmails: string[] = [];
let pendingDeleteUserId: string | null = null;

function setMainAppLinks() {
    const base = import.meta.env.BASE_URL || '/';
    const normalizedBase = base.endsWith('/') ? base : `${base}/`;
    if (toMainLink) {
        toMainLink.href = normalizedBase;
    }
    if (toMainLinkHeader) {
        toMainLinkHeader.href = normalizedBase;
    }
}

function escapeHtml(value: string) {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function normalizeEmailList(values: string[]) {
    const seen = new Set<string>();
    const normalized: string[] = [];
    values.forEach(value => {
        const trimmed = value.trim();
        if (!trimmed) return;
        const lower = trimmed.toLowerCase();
        if (seen.has(lower)) return;
        seen.add(lower);
        normalized.push(trimmed);
    });
    return normalized;
}

function parseEmailInput(value: string) {
    return value
        .split(/[,\n;]/)
        .map(entry => entry.trim())
        .filter(Boolean);
}

function isValidEmail(value: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function loadRecoveryEmails() {
    recoveryEmailError.textContent = '';
    try {
        const stored = await getSetting(RECOVERY_EMAILS_KEY);
        if (stored) {
            const parsed = JSON.parse(stored);
            if (Array.isArray(parsed)) {
                recoveryEmails = normalizeEmailList(parsed.filter(item => typeof item === 'string'));
            }
        }
    } catch (error) {
        console.error('Failed to load recovery emails', error);
        recoveryEmails = [];
    }

    if (recoveryEmails.length === 0) {
        const fallback = (await getSetting('company_email')) || '';
        recoveryEmails = fallback ? [fallback] : [];
    }

    recoveryEmailPrimary.value = recoveryEmails[0] || '';
    recoveryEmailBackups.value = recoveryEmails.slice(1).join(', ');
    updateRecoveryEmailSelect();
}

function updateRecoveryEmailSelect() {
    recoveryEmailSelect.innerHTML = '';
    if (recoveryEmails.length === 0) {
        recoveryEmailSelect.innerHTML = '<option value="">No hay correo configurado</option>';
        recoveryEmailLabel.textContent = 'No configurado';
        return;
    }
    recoveryEmails.forEach(email => {
        const option = document.createElement('option');
        option.value = email;
        option.textContent = email;
        recoveryEmailSelect.appendChild(option);
    });
    recoveryEmailLabel.textContent = recoveryEmails[0] || '-';
    recoveryEmailSelect.value = recoveryEmails[0] || '';
}

async function handleSaveRecoveryEmails() {
    recoveryEmailError.textContent = '';
    const primary = recoveryEmailPrimary.value.trim();
    const backups = parseEmailInput(recoveryEmailBackups.value);
    const allEmails = normalizeEmailList([primary, ...backups]);
    if (!primary) {
        recoveryEmailError.textContent = 'El correo principal es obligatorio.';
        return;
    }
    const invalidEmail = allEmails.find(email => !isValidEmail(email));
    if (invalidEmail) {
        recoveryEmailError.textContent = `Correo invalido: ${invalidEmail}`;
        return;
    }
    try {
        await setSetting(RECOVERY_EMAILS_KEY, JSON.stringify(allEmails));
        recoveryEmails = allEmails;
        updateRecoveryEmailSelect();
        recoveryEmailError.textContent = 'Correos guardados.';
        let changed = false;
        cachedUsers = cachedUsers.map(user => {
            if (!user.email) {
                changed = true;
                return { ...user, email: allEmails[0] };
            }
            return user;
        });
        if (changed) {
            await saveAppUsers(cachedUsers);
            renderUsers();
        }
    } catch (error) {
        console.error('Failed to save recovery emails', error);
        recoveryEmailError.textContent = 'No se pudo guardar el correo.';
    }
}

function setRecoveryModalVisible(isVisible: boolean) {
    recoveryModal.classList.toggle('hidden', !isVisible);
    recoveryModal.hidden = !isVisible;
}

function setRecoveryStep(step: 'send' | 'verify') {
    const isSend = step === 'send';
    recoveryStepSend.classList.toggle('hidden', !isSend);
    recoveryStepSend.hidden = !isSend;
    recoveryStepVerify.classList.toggle('hidden', isSend);
    recoveryStepVerify.hidden = isSend;
}

function storeRecoveryCode(code: string) {
    const payload = { code, createdAt: Date.now() };
    localStorage.setItem(RECOVERY_STORAGE_KEY, JSON.stringify(payload));
}

function getStoredRecoveryCode() {
    const raw = localStorage.getItem(RECOVERY_STORAGE_KEY);
    if (!raw) return null;
    try {
        return JSON.parse(raw) as { code: string; createdAt: number };
    } catch (error) {
        return null;
    }
}

function clearRecoveryCode() {
    localStorage.removeItem(RECOVERY_STORAGE_KEY);
}

function setView(isLoggedIn: boolean) {
    loginView.classList.toggle('hidden', isLoggedIn);
    appView.classList.toggle('hidden', !isLoggedIn);
    loginView.hidden = isLoggedIn;
    appView.hidden = !isLoggedIn;
    loginView.style.display = isLoggedIn ? 'none' : 'grid';
    appView.style.display = isLoggedIn ? 'block' : 'none';
}

async function openRecoveryModal() {
    recoveryError.textContent = '';
    recoveryCodeInput.value = '';
    recoveryPasswordInput.value = '';
    recoveryConfirmInput.value = '';
    setRecoveryStep('send');
    setRecoveryModalVisible(true);
    try {
        await loadRecoveryEmails();
        const selected = recoveryEmails[0] || '';
        recoveryEmailLabel.textContent = selected || 'No configurado';
    } catch (error) {
        recoveryEmailLabel.textContent = 'No disponible';
    }
}

function closeRecoveryModal() {
    setRecoveryModalVisible(false);
}

async function handleSendRecoveryCode() {
    recoveryError.textContent = '';
    const email = recoveryEmailSelect.value.trim();
    if (!email) {
        recoveryError.textContent = 'No hay correo configurado.';
        return;
    }
    recoveryEmailLabel.textContent = email;
    const code = String(Math.floor(100000 + Math.random() * 900000));
    recoverySendBtn.disabled = true;
    recoverySendBtn.textContent = 'Enviando...';
    try {
        const response = await fetch(`https://formsubmit.co/ajax/${encodeURIComponent(email)}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            body: JSON.stringify({
                name: 'Macris Admin',
                message: `Codigo de recuperacion: ${code}`,
                _subject: 'Codigo de recuperacion - Macris',
            }),
        });
        if (!response.ok) {
            throw new Error('No se pudo enviar el correo.');
        }
        storeRecoveryCode(code);
        setRecoveryStep('verify');
        recoveryError.textContent = 'Codigo enviado. Revisa el correo.';
    } catch (error) {
        console.error('Recovery email failed', error);
        recoveryError.textContent = 'Error al enviar el codigo. Verifica el correo.';
    } finally {
        recoverySendBtn.disabled = false;
        recoverySendBtn.textContent = 'Enviar codigo';
    }
}

async function handleVerifyRecoveryCode() {
    recoveryError.textContent = '';
    const payload = getStoredRecoveryCode();
    if (!payload) {
        recoveryError.textContent = 'No hay un codigo activo. Solicita uno nuevo.';
        setRecoveryStep('send');
        return;
    }
    const isExpired = Date.now() - payload.createdAt > 10 * 60 * 1000;
    if (isExpired) {
        clearRecoveryCode();
        recoveryError.textContent = 'El codigo expiro. Solicita uno nuevo.';
        setRecoveryStep('send');
        return;
    }
    const code = recoveryCodeInput.value.trim();
    const newPassword = recoveryPasswordInput.value.trim();
    const confirmPassword = recoveryConfirmInput.value.trim();
    if (!code || code !== payload.code) {
        recoveryError.textContent = 'Codigo incorrecto.';
        return;
    }
    if (!newPassword) {
        recoveryError.textContent = 'Ingresa la nueva clave.';
        return;
    }
    if (newPassword !== confirmPassword) {
        recoveryError.textContent = 'Las claves no coinciden.';
        return;
    }
    try {
        await setSetting('app_password', newPassword);
        adminPassword = newPassword;
        clearRecoveryCode();
        recoveryError.textContent = 'Clave actualizada. Ya puedes iniciar sesion.';
        setTimeout(closeRecoveryModal, 1000);
    } catch (error) {
        console.error('Failed to update password', error);
        recoveryError.textContent = 'No se pudo actualizar la clave.';
    }
}

async function loadAdminPassword() {
    adminPassword = (await getSetting('app_password')) || 'wilson1423';
}

async function loadUsers() {
    try {
        await loadAdminPassword();
        cachedUsers = await ensureAdminUser(adminPassword);
        const defaultEmail = recoveryEmails[0] || '';
        if (defaultEmail) {
            let changed = false;
            cachedUsers = cachedUsers.map(user => {
                if (!user.email) {
                    changed = true;
                    return { ...user, email: defaultEmail };
                }
                return user;
            });
            if (changed) {
                await saveAppUsers(cachedUsers);
            }
        }
        renderUsers();
        closeEditModal();
    } catch (error) {
        console.error('Failed to load users', error);
        userList.innerHTML = '<div class="user-row"><div class="user-meta"><strong>Error al cargar usuarios</strong><span>Intenta de nuevo.</span></div></div>';
    }
}

function renderUsers() {
    const term = userSearchInput ? userSearchInput.value.trim().toLowerCase() : '';
    const filteredUsers = cachedUsers.filter(user => {
        const email = user.email ? user.email.toLowerCase() : '';
        return user.name.toLowerCase().includes(term) || user.username.toLowerCase().includes(term) || email.includes(term);
    });

    if (filteredUsers.length === 0) {
        userList.innerHTML = '<div class="user-row"><div class="user-meta"><strong>No se encontraron usuarios</strong><span>Prueba con otro nombre o usuario.</span></div></div>';
        return;
    }

    userList.innerHTML = filteredUsers.map(user => {
        const isAdmin = user.role === 'admin';
        const statusClass = user.active ? 'active' : 'inactive';
        const statusLabel = user.active ? 'Activo' : 'Inactivo';
        const badge = isAdmin ? '<span class="tag">Admin</span>' : '';
        const deleteBtn = isAdmin ? '' : `<button class="btn danger" data-action="delete" data-id="${user.id}">Eliminar</button>`;
        const actions = `<div class="row-actions">${badge}<button class="btn ghost" data-action="edit" data-id="${user.id}">Editar</button>${deleteBtn}</div>`;
        const emailInfo = user.email ? ` · ${escapeHtml(user.email)}` : '';
        return `<div class="user-row">
                    <div class="user-meta">
                        <strong>${escapeHtml(user.name)}</strong>
                        <span>@${escapeHtml(user.username)} · <span class="status-dot ${statusClass}"></span>${statusLabel}${emailInfo}</span>
                    </div>
                    ${actions}
                </div>`;
    }).join('');
}

function setEditFormEnabled(enabled: boolean) {
    editNameInput.disabled = !enabled;
    editUsernameInput.disabled = !enabled;
    editEmailInput.disabled = !enabled;
    editPasswordInput.disabled = !enabled;
    editActiveInput.disabled = !enabled;
    editUserResetBtn.disabled = !enabled;
    editUserSaveBtn.disabled = !enabled;
}

function setEditModalVisible(isVisible: boolean) {
    userEditModal.classList.toggle('hidden', !isVisible);
    userEditModal.hidden = !isVisible;
}

function setDeleteModalVisible(isVisible: boolean) {
    userDeleteModal.classList.toggle('hidden', !isVisible);
    userDeleteModal.hidden = !isVisible;
}

function openDeleteModal(user: AppUser) {
    pendingDeleteUserId = user.id;
    userDeleteText.textContent = `¿Desea eliminar al usuario ${user.name}?`;
    setDeleteModalVisible(true);
}

function closeDeleteModal() {
    pendingDeleteUserId = null;
    setDeleteModalVisible(false);
}

function openEditModal(user: AppUser) {
    selectedUserId = user.id;
    editUserError.textContent = '';
    editPasswordInput.value = '';
    editNameInput.value = user.name;
    editUsernameInput.value = user.username;
    editEmailInput.value = user.email || '';
    editActiveInput.checked = user.active;

    if (user.role === 'admin') {
        userEditHint.textContent = 'Puedes actualizar el nombre o la clave del admin.';
        editNameInput.disabled = false;
        editPasswordInput.disabled = false;
        editUsernameInput.disabled = true;
        editEmailInput.disabled = false;
        editActiveInput.disabled = true;
        editActiveInput.checked = true;
        editUserSaveBtn.disabled = false;
        editUserResetBtn.style.display = 'none';
    } else {
        userEditHint.textContent = 'Actualiza los datos y guarda cambios.';
        setEditFormEnabled(true);
        editUserResetBtn.style.display = 'inline-flex';
    }

    setEditModalVisible(true);
}

function closeEditModal() {
    selectedUserId = null;
    userEditForm.reset();
    editUserError.textContent = '';
    userEditHint.textContent = '';
    editUserResetBtn.style.display = 'inline-flex';
    setEditModalVisible(false);
}

async function handleUserSubmit(event: Event) {
    event.preventDefault();
    userFormError.textContent = '';

    const name = userNameInput.value.trim();
    const username = userUsernameInput.value.trim();
    const email = userEmailInput.value.trim();
    const passwordInput = userPasswordInput.value.trim();

    if (!name || !username || !email) {
        userFormError.textContent = 'Nombre, usuario y correo son obligatorios.';
        return;
    }
    if (!isValidEmail(email)) {
        userFormError.textContent = 'Correo invalido.';
        return;
    }

    const normalizedUsername = username.toLowerCase();
    if (cachedUsers.some(user => user.username.toLowerCase() === normalizedUsername)) {
        userFormError.textContent = 'Ese usuario ya existe.';
        return;
    }

    const finalPassword = passwordInput || adminPassword;
    const newUser: AppUser = {
        id: generateId(),
        name,
        username,
        email,
        password: finalPassword,
        role: 'user',
        active: true,
    };

    cachedUsers = [...cachedUsers, newUser];
    await saveAppUsers(cachedUsers);
    userForm.reset();
    renderUsers();
}

async function handleUserListClick(event: Event) {
    const target = event.target as HTMLElement;
    const actionEl = target.closest('[data-action]') as HTMLElement | null;
    const action = actionEl?.getAttribute('data-action');
    const userId = actionEl?.getAttribute('data-id');
    if (!action || !userId) return;

    const userIndex = cachedUsers.findIndex(user => user.id === userId);
    if (userIndex === -1) return;

    if (action === 'edit') {
        openEditModal(cachedUsers[userIndex]);
    }

    if (action === 'delete') {
        const user = cachedUsers[userIndex];
        if (user.role === 'admin') {
            return;
        }
        openDeleteModal(user);
    }
}

async function handleEditSubmit(event: Event) {
    event.preventDefault();
    if (!selectedUserId) return;
    editUserError.textContent = '';

    const userIndex = cachedUsers.findIndex(user => user.id === selectedUserId);
    if (userIndex === -1) return;
    const user = cachedUsers[userIndex];
    const isAdmin = user.role === 'admin';

    const name = editNameInput.value.trim();
    const username = editUsernameInput.value.trim();
    const email = editEmailInput.value.trim();
    if (!name || (!isAdmin && !username) || !email) {
        editUserError.textContent = 'Nombre, usuario y correo son obligatorios.';
        return;
    }
    if (!isValidEmail(email)) {
        editUserError.textContent = 'Correo invalido.';
        return;
    }
    const normalizedUsername = isAdmin ? user.username : username.toLowerCase();
    if (!isAdmin) {
        const hasDuplicate = cachedUsers.some(existing => existing.id !== user.id && existing.username.toLowerCase() === normalizedUsername);
        if (hasDuplicate) {
            editUserError.textContent = 'Ese usuario ya existe.';
            return;
        }
    }

    const password = editPasswordInput.value.trim();
    const updatedUser: AppUser = {
        ...user,
        name,
        username: isAdmin ? user.username : username,
        email,
        active: isAdmin ? true : editActiveInput.checked,
        password: password ? password : user.password,
    };

    cachedUsers = cachedUsers.map(existing => existing.id === user.id ? updatedUser : existing);
    await saveAppUsers(cachedUsers);
    editPasswordInput.value = '';
    renderUsers();
    closeEditModal();
}

async function handleResetPassword() {
    if (!selectedUserId) return;
    const userIndex = cachedUsers.findIndex(user => user.id === selectedUserId);
    if (userIndex === -1) return;
    const user = cachedUsers[userIndex];
    if (user.role === 'admin') {
        editUserError.textContent = 'El usuario admin no se edita aqui.';
        return;
    }
    cachedUsers = cachedUsers.map(existing => existing.id === user.id ? { ...existing, password: adminPassword } : existing);
    await saveAppUsers(cachedUsers);
    editUserError.textContent = 'Clave restablecida a la clave admin.';
    renderUsers();
}

async function confirmDeleteUser() {
    if (!pendingDeleteUserId) return;
    const userIndex = cachedUsers.findIndex(user => user.id === pendingDeleteUserId);
    if (userIndex === -1) {
        closeDeleteModal();
        return;
    }
    const user = cachedUsers[userIndex];
    if (user.role === 'admin') {
        closeDeleteModal();
        return;
    }
    cachedUsers = cachedUsers.filter(existing => existing.id !== user.id);
    await saveAppUsers(cachedUsers);
    if (selectedUserId === user.id) {
        closeEditModal();
    }
    renderUsers();
    closeDeleteModal();
}


function sumItems(items: { quantity: number; price: number }[]) {
    return items.reduce((sum, item) => sum + item.quantity * item.price, 0);
}

function buildItemStats(items: { itemId?: string | null; description: string; quantity: number; price: number }[], itemLookup: Map<string, string>) {
    const stats = new Map<string, { name: string; quantity: number; revenue: number }>();
    items.forEach(item => {
        const name = item.itemId && itemLookup.get(item.itemId) ? itemLookup.get(item.itemId)! : item.description;
        const key = item.itemId || name;
        const existing = stats.get(key) || { name, quantity: 0, revenue: 0 };
        existing.quantity += item.quantity;
        existing.revenue += item.quantity * item.price;
        stats.set(key, existing);
    });
    return Array.from(stats.values()).sort((a, b) => b.quantity - a.quantity);
}

function renderList(container: HTMLElement, rows: string[]) {
    if (rows.length === 0) {
        container.innerHTML = '<li>No hay datos disponibles.</li>';
        return;
    }
    container.innerHTML = rows.join('');
}

function renderBarChart(container: HTMLElement, items: { name: string; quantity: number }[]) {
    if (!items.length) {
        container.innerHTML = '<p class="chart-empty">Sin datos disponibles.</p>';
        return;
    }
    const max = Math.max(...items.map(item => item.quantity), 1);
    container.innerHTML = items.map(item => {
        const width = Math.round((item.quantity / max) * 100);
        return `<div class="bar-row">
                    <span class="bar-label">${escapeHtml(item.name)}</span>
                    <div class="bar-track"><div class="bar-fill" style="width:${width}%"></div></div>
                    <span class="bar-value">${item.quantity}</span>
                </div>`;
    }).join('');
}

function renderLineChart(container: HTMLElement, labels: string[], values: number[]) {
    if (labels.length === 0) {
        container.innerHTML = '<p class="chart-empty">Sin datos disponibles.</p>';
        return;
    }
    const width = 300;
    const height = 120;
    const padding = 16;
    const maxValue = Math.max(...values, 1);
    const stepX = labels.length > 1 ? (width - padding * 2) / (labels.length - 1) : 0;
    const points = values.map((value, index) => {
        const x = padding + stepX * index;
        const y = height - padding - (value / maxValue) * (height - padding * 2);
        return `${x},${y}`;
    }).join(' ');
    const circles = values.map((value, index) => {
        const x = padding + stepX * index;
        const y = height - padding - (value / maxValue) * (height - padding * 2);
        return `<circle cx="${x}" cy="${y}" r="3" fill="#ff7a3d"></circle>`;
    }).join('');
    const labelStep = labels.length > 6 ? 2 : 1;
    const labelNodes = labels.map((label, index) => {
        if (index % labelStep !== 0) return '';
        const x = padding + stepX * index;
        return `<text x="${x}" y="${height - 4}" text-anchor="middle">${escapeHtml(label)}</text>`;
    }).join('');
    container.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Grafica de ordenes">
            <defs>
                <linearGradient id="lineGradient" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stop-color="#ff935f" />
                    <stop offset="100%" stop-color="#ff7a3d" />
                </linearGradient>
            </defs>
            <polyline fill="none" stroke="url(#lineGradient)" stroke-width="3" points="${points}" />
            ${circles}
            ${labelNodes}
        </svg>`;
}

function getMonthKey(date: Date) {
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${date.getFullYear()}-${month}`;
}

function getLastMonths(count: number) {
    const now = new Date();
    const months: { key: string; label: string }[] = [];
    for (let i = count - 1; i >= 0; i -= 1) {
        const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
        months.push({
            key: getMonthKey(date),
            label: date.toLocaleString('es-CO', { month: 'short' }).replace('.', ''),
        });
    }
    return months;
}

async function loadAnalytics() {
    try {
        const [quotes, orders, items] = await Promise.all([
            getQuotesFromSupabase(),
            getOrdersFromSupabase(),
            getItemsFromSupabase(),
        ]);

        const itemLookup = new Map<string, string>(items.map(item => [item.id, item.name]));
        const quoteTotalValue = quotes.reduce((sum, quote) => {
            const subtotal = sumItems(quote.items);
            return sum + subtotal * (1 + quote.taxRate / 100);
        }, 0);
        const ordersTotalValue = orders.reduce((sum, order) => sum + sumItems(order.items), 0);
        const itemsSold = orders.reduce((sum, order) => sum + order.items.reduce((sub, item) => sub + item.quantity, 0), 0);

        metricQuotes.textContent = String(quotes.length);
        metricOrders.textContent = String(orders.length);
        metricQuotesRevenue.textContent = formatCurrency(quoteTotalValue);
        metricOrdersRevenue.textContent = formatCurrency(ordersTotalValue);
        metricItemsSold.textContent = String(itemsSold);

        const topOrders = buildItemStats(orders.flatMap(order => order.items), itemLookup).slice(0, 5);
        const topQuotes = buildItemStats(quotes.flatMap(quote => quote.items), itemLookup).slice(0, 5);

        renderList(topOrderItems, topOrders.map(item => `<li>${escapeHtml(item.name)} · ${item.quantity} uds · ${formatCurrency(item.revenue)}</li>`));
        renderList(topQuoteItems, topQuotes.map(item => `<li>${escapeHtml(item.name)} · ${item.quantity} uds · ${formatCurrency(item.revenue)}</li>`));

        renderBarChart(topItemsBarChart, topOrders.map(item => ({ name: item.name, quantity: item.quantity })));

        const months = getLastMonths(6);
        const monthlyCounts = months.map(() => 0);
        orders.forEach(order => {
            const date = order.created_at ? new Date(order.created_at) : new Date(order.service_date);
            if (Number.isNaN(date.getTime())) return;
            const key = getMonthKey(date);
            const index = months.findIndex(month => month.key === key);
            if (index >= 0) {
                monthlyCounts[index] += 1;
            }
        });
        renderLineChart(ordersLineChart, months.map(month => month.label), monthlyCounts);

        const statusCounts = orders.reduce<Record<string, number>>((acc, order) => {
            acc[order.status] = (acc[order.status] || 0) + 1;
            return acc;
        }, {});

        renderList(ordersByStatus, Object.entries(statusCounts).map(([status, count]) => `<li>${escapeHtml(status)}: ${count}</li>`));

        const serviceCounts = orders.reduce<Record<string, number>>((acc, order) => {
            const type = order.order_type || 'Sin tipo';
            acc[type] = (acc[type] || 0) + 1;
            return acc;
        }, {});

        const sortedServices = Object.entries(serviceCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
        renderList(topServiceTypes, sortedServices.map(([service, count]) => `<li>${escapeHtml(service)} · ${count}</li>`));

        analyticsUpdated.textContent = `Actualizado ${new Date().toLocaleString('es-CO')}`;
    } catch (error) {
        console.error('Failed to load analytics', error);
        metricQuotes.textContent = '-';
        metricOrders.textContent = '-';
        metricQuotesRevenue.textContent = '-';
        metricOrdersRevenue.textContent = '-';
        metricItemsSold.textContent = '-';
        renderList(topOrderItems, ['<li>Error al cargar datos.</li>']);
        renderList(topQuoteItems, ['<li>Error al cargar datos.</li>']);
        renderList(ordersByStatus, ['<li>Error al cargar datos.</li>']);
        renderList(topServiceTypes, ['<li>Error al cargar datos.</li>']);
        ordersLineChart.innerHTML = '<p class="chart-empty">Error al cargar datos.</p>';
        topItemsBarChart.innerHTML = '<p class="chart-empty">Error al cargar datos.</p>';
        analyticsUpdated.textContent = 'Error al actualizar';
    }
}

async function bootstrap() {
    setMainAppLinks();
    await loadAdminPassword();
    closeEditModal();
    closeDeleteModal();
    await loadRecoveryEmails();
    if (localStorage.getItem(ADMIN_SESSION_KEY) === 'true') {
        setView(true);
        await loadUsers();
        await loadAnalytics();
    } else {
        setView(false);
    }
}

loginForm.addEventListener('submit', async event => {
    event.preventDefault();
    loginError.textContent = 'Verificando...';
    try {
        await loadAdminPassword();
        const username = loginUsername.value.trim().toLowerCase();
        const password = loginPassword.value;

        if (username === 'admin' && password === adminPassword) {
            localStorage.setItem(ADMIN_SESSION_KEY, 'true');
            setView(true);
            await loadUsers();
            await loadAnalytics();
            loginError.textContent = '';
        } else {
            loginError.textContent = 'Usuario o clave incorrecta.';
        }
    } catch (error) {
        console.error('Admin login failed', error);
        loginError.textContent = 'Error al validar credenciales.';
    }
});

logoutBtn.addEventListener('click', () => {
    localStorage.removeItem(ADMIN_SESSION_KEY);
    setView(false);
});

userForm.addEventListener('submit', handleUserSubmit);
userList.addEventListener('click', handleUserListClick);
userEditForm.addEventListener('submit', handleEditSubmit);
editUserResetBtn.addEventListener('click', handleResetPassword);
if (userSearchInput) {
    userSearchInput.addEventListener('input', renderUsers);
}
editUserCloseBtn.addEventListener('click', closeEditModal);
userEditModal.addEventListener('click', event => {
    if (event.target === userEditModal) {
        closeEditModal();
    }
});
document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
        if (!userEditModal.hidden) {
            closeEditModal();
        }
        if (!recoveryModal.hidden) {
            closeRecoveryModal();
        }
        if (!userDeleteModal.hidden) {
            closeDeleteModal();
        }
    }
});
recoveryOpenBtn.addEventListener('click', openRecoveryModal);
recoveryCloseBtn.addEventListener('click', closeRecoveryModal);
recoveryModal.addEventListener('click', event => {
    if (event.target === recoveryModal) {
        closeRecoveryModal();
    }
});
recoverySendBtn.addEventListener('click', handleSendRecoveryCode);
recoveryVerifyBtn.addEventListener('click', handleVerifyRecoveryCode);
recoveryEmailSaveBtn.addEventListener('click', handleSaveRecoveryEmails);
recoveryEmailSelect.addEventListener('change', () => {
    recoveryEmailLabel.textContent = recoveryEmailSelect.value || '-';
});
userDeleteConfirm.addEventListener('click', confirmDeleteUser);
userDeleteCancel.addEventListener('click', closeDeleteModal);
userDeleteClose.addEventListener('click', closeDeleteModal);
userDeleteModal.addEventListener('click', event => {
    if (event.target === userDeleteModal) {
        closeDeleteModal();
    }
});
refreshUsersBtn.addEventListener('click', loadUsers);
refreshAnalyticsBtn.addEventListener('click', loadAnalytics);

bootstrap().catch(console.error);
