import fs from 'fs';

let code = fs.readFileSync('index.css', 'utf-8');

const target1 = `    transition: transform 0.2s ease, opacity 0.2s ease;\r
}\r
\r
    gap: 4px;\r
    margin-top: 4px;\r
    padding: 2px;`;

const target2 = `    transition: transform 0.2s ease, opacity 0.2s ease;\n}\n\n    gap: 4px;\n    margin-top: 4px;\n    padding: 2px;`;

const replace = `    transition: transform 0.2s ease, opacity 0.2s ease;
}

.admin-fab:hover {
    transform: translateY(-2px);
    opacity: 1;
}

.admin-fab-label {
    display: none;
    font-size: 0.85rem;
    font-weight: 600;
    letter-spacing: 0.02em;
}

@media (max-width: 768px) {
    .admin-fab {
        bottom: 150px;
        right: 20px;
        width: auto;
        height: 44px;
        padding: 0 14px;
        border-radius: 999px;
        gap: 8px;
    }

    .admin-fab-label {
        display: inline;
    }
}

.order-author {
    color: var(--color-text-secondary);
    font-size: 0.78rem;
}

/* Customizations for Saved Quotes table view */
@media (min-width: 769px) {
    .saved-quotes-table th:nth-child(2),
    .saved-quotes-table td:nth-child(2),
    .saved-quotes-table th:nth-child(3),
    .saved-quotes-table td:nth-child(3) {
        display: none;
    }
}

/* --- Sidebar Bottom User Info --- */
.sidebar-bottom {
    margin-top: auto;
    padding: 20px 24px;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.sidebar-user-info {
    display: flex;
    align-items: center;
    gap: 12px;
}

.user-avatar-icon {
    font-size: 2.2rem;
    color: var(--color-text-secondary);
}

.user-details {
    display: flex;
    flex-direction: column;
    justify-content: center;
}

#current-user-name {
    font-size: 0.95rem;
    font-weight: 500;
    color: var(--corporate-white);
    line-height: 1.2;
}

.user-role-id {
    font-size: 0.75rem;
    color: rgba(255, 255, 255, 0.5);
    margin-top: 2px;
}

.sidebar-connection {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.8rem;
    color: rgba(255, 255, 255, 0.7);
}

.sidebar-logout-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    background: transparent;
    border: none;
    color: rgba(255, 255, 255, 0.6);
    cursor: pointer;
    font-size: 0.85rem;
    padding: 0;
    margin-top: 4px;
    transition: color 0.2s ease;
}

.sidebar-logout-btn:hover {
    color: var(--color-danger);
}

/* --- Agenda Inline Tech Picker --- */
.agenda-tech-pills {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: 4px;
    padding: 2px;`;

if (code.includes(target1)) {
    code = code.replace(target1, replace);
} else if (code.includes(target2)) {
    code = code.replace(target2, replace);
} else {
    console.log("Could not find the target string :(");
}
fs.writeFileSync('index.css', code);
console.log('Done');
