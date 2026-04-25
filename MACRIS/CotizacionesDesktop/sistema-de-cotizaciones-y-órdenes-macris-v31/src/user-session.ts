export type SessionUser = {
    name: string;
    username: string;
    role: 'admin' | 'user';
};

const USER_SESSION_KEY = 'macris_app_session_user';
const LAST_USER_KEY = 'macris_app_last_user';
const DEFAULT_USER: SessionUser = { name: 'Admin', username: 'admin', role: 'admin' };

function parseSessionUser(raw: string | null): SessionUser | null {
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw) as Partial<SessionUser>;
        if (!parsed || typeof parsed.name !== 'string' || typeof parsed.username !== 'string') {
            return null;
        }
        const role = parsed.role === 'user' ? 'user' : 'admin';
        return { name: parsed.name, username: parsed.username, role };
    } catch (error) {
        console.warn('Failed to parse session user.', error);
        return null;
    }
}

export function getSessionUser(): SessionUser {
    const sessionUser = parseSessionUser(localStorage.getItem(USER_SESSION_KEY));
    if (sessionUser) {
        return sessionUser;
    }
    const lastUser = parseSessionUser(localStorage.getItem(LAST_USER_KEY));
    if (lastUser) {
        localStorage.setItem(USER_SESSION_KEY, JSON.stringify(lastUser));
        return lastUser;
    }
    return { ...DEFAULT_USER };
}

export function setSessionUser(user: SessionUser) {
    const payload = JSON.stringify(user);
    localStorage.setItem(USER_SESSION_KEY, payload);
    localStorage.setItem(LAST_USER_KEY, payload);
}

export function clearSessionUser() {
    localStorage.removeItem(USER_SESSION_KEY);
}
