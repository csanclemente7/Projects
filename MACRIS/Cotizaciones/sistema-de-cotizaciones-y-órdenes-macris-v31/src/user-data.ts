import { getSetting, setSetting } from './api';
import { generateId } from './utils';
import type { AppUser } from './types';

const USERS_SETTING_KEY = 'app_users';
const QUOTE_AUTHORS_KEY = 'quote_authors';
const ORDER_AUTHORS_KEY = 'order_authors';
const ADMIN_USERNAME = 'admin';
const ADMIN_NAME = 'Admin';

function normalizeString(value: unknown, fallback = ''): string {
    if (typeof value !== 'string') return fallback;
    const trimmed = value.trim();
    return trimmed || fallback;
}

function normalizeUser(input: unknown): AppUser | null {
    if (!input || typeof input !== 'object') return null;
    const data = input as Record<string, unknown>;
    const username = normalizeString(data.username);
    const password = normalizeString(data.password);
    if (!username || !password) return null;
    const name = normalizeString(data.name, username);
    const email = normalizeString(data.email || '');
    const role = data.role === 'admin' ? 'admin' : 'user';
    const active = typeof data.active === 'boolean' ? data.active : true;
    const id = normalizeString(data.id, generateId());
    return { id, name, username, email: email || undefined, password, role, active };
}

function normalizeUsers(raw: unknown): AppUser[] {
    if (!Array.isArray(raw)) return [];
    const normalized = raw.map(normalizeUser).filter((user): user is AppUser => Boolean(user));
    const seen = new Set<string>();
    return normalized.filter(user => {
        const key = user.username.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

export async function getAppUsers(): Promise<AppUser[]> {
    const raw = await getSetting(USERS_SETTING_KEY);
    if (!raw) return [];
    try {
        return normalizeUsers(JSON.parse(raw));
    } catch (error) {
        console.warn('Failed to parse app users from settings.', error);
        return [];
    }
}

export async function saveAppUsers(users: AppUser[]): Promise<void> {
    await setSetting(USERS_SETTING_KEY, JSON.stringify(users));
}

export async function ensureAdminUser(adminPassword: string): Promise<AppUser[]> {
    const users = await getAppUsers();
    const adminIndex = users.findIndex(user => user.username.toLowerCase() === ADMIN_USERNAME);
    const adminUser: AppUser = {
        id: adminIndex >= 0 ? users[adminIndex].id : generateId(),
        name: adminIndex >= 0 ? users[adminIndex].name || ADMIN_NAME : ADMIN_NAME,
        username: ADMIN_USERNAME,
        email: adminIndex >= 0 ? users[adminIndex].email : undefined,
        password: adminPassword,
        role: 'admin',
        active: true,
    };
    const filtered = users.filter(user => user.username.toLowerCase() !== ADMIN_USERNAME);
    const updated = [adminUser, ...filtered];
    const needsSave = adminIndex === -1 || users[adminIndex].password !== adminPassword || users[adminIndex].name !== adminUser.name || !users[adminIndex].active;
    if (needsSave) {
        await saveAppUsers(updated);
    }
    return updated;
}

export async function getQuoteAuthors(): Promise<Record<string, string>> {
    const raw = await getSetting(QUOTE_AUTHORS_KEY);
    if (!raw) return {};
    try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            return {};
        }
        const normalized: Record<string, string> = {};
        for (const [key, value] of Object.entries(parsed)) {
            if (typeof value === 'string' && value.trim()) {
                normalized[key] = value.trim();
            }
        }
        return normalized;
    } catch (error) {
        console.warn('Failed to parse quote authors from settings.', error);
        return {};
    }
}

export async function saveQuoteAuthors(authors: Record<string, string>): Promise<void> {
    await setSetting(QUOTE_AUTHORS_KEY, JSON.stringify(authors));
}

export async function getOrderAuthors(): Promise<Record<string, string>> {
    const raw = await getSetting(ORDER_AUTHORS_KEY);
    if (!raw) return {};
    try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            return {};
        }
        const normalized: Record<string, string> = {};
        for (const [key, value] of Object.entries(parsed)) {
            if (typeof value === 'string' && value.trim()) {
                normalized[key] = value.trim();
            }
        }
        return normalized;
    } catch (error) {
        console.warn('Failed to parse order authors from settings.', error);
        return {};
    }
}

export async function saveOrderAuthors(authors: Record<string, string>): Promise<void> {
    await setSetting(ORDER_AUTHORS_KEY, JSON.stringify(authors));
}
