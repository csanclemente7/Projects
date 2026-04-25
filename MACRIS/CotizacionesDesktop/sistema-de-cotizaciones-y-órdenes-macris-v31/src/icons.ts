const ICON_CLASS_PREFIX = 'fa-';
const ICON_MODIFIERS = new Set(['fa-spin', 'fa-lg', 'fa-2x']);

let iconsObserved = false;

function strokeSvg(children: string, extraAttributes = ''): string {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" ${extraAttributes}>${children}</svg>`;
}

function fillSvg(children: string, extraAttributes = ''): string {
    return `<svg viewBox="0 0 24 24" fill="currentColor" ${extraAttributes}>${children}</svg>`;
}

function documentIcon(label: string): string {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
        <path d="M8 3h6l5 5v13H8z"/>
        <path d="M14 3v5h5"/>
        <text x="13.5" y="17" text-anchor="middle" font-size="5.4" font-weight="700" font-family="Segoe UI, Arial, sans-serif" fill="currentColor" stroke="none">${label}</text>
    </svg>`;
}

function brandLetterIcon(letter: string): string {
    return `<svg viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8"/>
        <text x="12" y="15" text-anchor="middle" font-size="9" font-weight="700" font-family="Segoe UI, Arial, sans-serif" fill="currentColor">${letter}</text>
    </svg>`;
}

function renderIconMarkup(iconName: string): string {
    switch (iconName) {
        case 'plus':
            return strokeSvg('<path d="M12 5v14"/><path d="M5 12h14"/>');
        case 'times':
            return strokeSvg('<path d="M6 6l12 12"/><path d="M18 6L6 18"/>');
        case 'check':
            return strokeSvg('<path d="M5 12.5l4.2 4.2L19 7.5"/>');
        case 'edit':
        case 'pencil-alt':
            return strokeSvg('<path d="M4 20l4.2-1 9.6-9.6-3.2-3.2L5 15.8z"/><path d="M13.8 5.8l3.2 3.2"/><path d="M4 20h5"/>');
        case 'trash':
        case 'trash-alt':
            return strokeSvg('<path d="M5 7h14"/><path d="M9 7V4h6v3"/><path d="M7 7l1 13h8l1-13"/><path d="M10 11v5"/><path d="M14 11v5"/>');
        case 'save':
            return strokeSvg('<path d="M5 4h11l3 3v13H5z"/><path d="M8 4v6h8V4"/><path d="M9 17h6"/>');
        case 'download':
            return strokeSvg('<path d="M12 4v10"/><path d="M8 10l4 4 4-4"/><path d="M5 19h14"/>');
        case 'upload':
            return strokeSvg('<path d="M12 20V10"/><path d="M8 14l4-4 4 4"/><path d="M5 5h14"/>');
        case 'copy':
            return strokeSvg('<rect x="9" y="9" width="10" height="11" rx="2"/><path d="M7 15H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v1"/>');
        case 'archive':
        case 'file-archive':
            return strokeSvg('<rect x="4" y="5" width="16" height="5" rx="1"/><path d="M6 10v8a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-8"/><path d="M10 13h4"/>');
        case 'box-open':
            return strokeSvg('<path d="M4 10l8-5 8 5"/><path d="M4 10v8l8 4 8-4v-8"/><path d="M12 5v17"/>');
        case 'boxes-stacked':
            return strokeSvg('<rect x="5" y="4" width="14" height="5" rx="1"/><rect x="5" y="10" width="14" height="5" rx="1"/><rect x="5" y="16" width="14" height="4" rx="1"/>');
        case 'building':
        case 'city':
            return strokeSvg('<path d="M4 20h16"/><rect x="6" y="9" width="5" height="11"/><rect x="13" y="4" width="5" height="16"/><path d="M8 12h1"/><path d="M8 15h1"/><path d="M15 8h1"/><path d="M15 11h1"/><path d="M15 14h1"/>');
        case 'home':
            return strokeSvg('<path d="M4 11l8-6 8 6"/><path d="M6 10v10h12V10"/><path d="M10 20v-5h4v5"/>');
        case 'calendar-alt':
        case 'calendar-day':
            return strokeSvg('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4"/><path d="M16 3v4"/><path d="M3 10h18"/><path d="M8 14h8"/>');
        case 'clock':
        case 'hourglass-half':
            return strokeSvg('<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>');
        case 'camera':
            return strokeSvg('<path d="M5 8h3l2-2h4l2 2h3v10H5z"/><circle cx="12" cy="13" r="3.5"/>');
        case 'image':
        case 'images':
            return strokeSvg('<rect x="4" y="5" width="16" height="14" rx="2"/><circle cx="9" cy="10" r="1.5"/><path d="M6 17l4-4 3 3 3-4 2 5"/>');
        case 'chart-bar':
            return strokeSvg('<path d="M4 20h16"/><path d="M7 20v-7"/><path d="M12 20V8"/><path d="M17 20v-11"/>');
        case 'clipboard-check':
            return strokeSvg('<rect x="6" y="5" width="12" height="15" rx="2"/><path d="M9 5.5h6v-2H9z"/><path d="M9 13l2 2 4-4"/>');
        case 'clipboard-list':
            return strokeSvg('<rect x="6" y="5" width="12" height="15" rx="2"/><path d="M9 5.5h6v-2H9z"/><path d="M9 11h6"/><path d="M9 15h6"/>');
        case 'cog':
            return strokeSvg('<circle cx="12" cy="12" r="3"/><path d="M12 4v2"/><path d="M12 18v2"/><path d="M4 12h2"/><path d="M18 12h2"/><path d="M6.3 6.3l1.4 1.4"/><path d="M16.3 16.3l1.4 1.4"/><path d="M17.7 6.3l-1.4 1.4"/><path d="M7.7 16.3l-1.4 1.4"/>');
        case 'tools':
            return strokeSvg('<path d="M14 4l6 6"/><path d="M12 6l6 6"/><path d="M3 21l7-7"/><path d="M8 16l-3-3 2-2 3 3"/>');
        case 'hard-hat':
            return strokeSvg('<path d="M5 13a7 7 0 0 1 14 0"/><path d="M4 13h16v4H4z"/><path d="M12 8v5"/>');
        case 'microchip':
            return strokeSvg('<rect x="7" y="7" width="10" height="10" rx="1.5"/><path d="M9 1v4"/><path d="M15 1v4"/><path d="M9 19v4"/><path d="M15 19v4"/><path d="M1 9h4"/><path d="M1 15h4"/><path d="M19 9h4"/><path d="M19 15h4"/>');
        case 'users':
            return strokeSvg('<circle cx="9" cy="9" r="3"/><circle cx="16" cy="10" r="2.5"/><path d="M4 19c1.5-3 8.5-3 10 0"/><path d="M13 19c.7-2 5.3-2 6 0"/>');
        case 'user':
        case 'user-tie':
            return strokeSvg('<circle cx="12" cy="8" r="3.2"/><path d="M5 19c1.5-4 12.5-4 14 0"/>');
        case 'user-slash':
            return strokeSvg('<circle cx="10.5" cy="8.5" r="3"/><path d="M4.5 19c1.4-3.8 11.6-3.8 13 0"/><path d="M5 5l14 14"/>');
        case 'sign-out-alt':
        case 'external-link-alt':
            return strokeSvg('<path d="M10 6H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4"/><path d="M14 4h6v6"/><path d="M10 14L20 4"/>');
        case 'user-circle':
            return strokeSvg('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="9" r="3"/><path d="M7 18c1.5-3 8.5-3 10 0"/>');
        case 'phone':
            return strokeSvg('<path d="M7 5h3l1 4-2 2c1.5 2.7 3.8 5 6.5 6.5l2-2 4 1v3c0 1-1 2-2 2-8.3 0-15-6.7-15-15 0-1 1-2 2-2z"/>');
        case 'envelope':
            return strokeSvg('<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M4 8l8 6 8-6"/>');
        case 'map-marker-alt':
            return strokeSvg('<path d="M12 21s6-5.3 6-11a6 6 0 1 0-12 0c0 5.7 6 11 6 11z"/><circle cx="12" cy="10" r="2.2"/>');
        case 'lock':
            return strokeSvg('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>');
        case 'key':
            return strokeSvg('<circle cx="8" cy="12" r="3"/><path d="M11 12h9"/><path d="M16 12v3"/><path d="M19 12v2"/>');
        case 'share-alt':
            return strokeSvg('<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="M8.4 11l7-4.2"/><path d="M8.4 13l7 4.2"/>');
        case 'tag':
            return strokeSvg('<path d="M4 12l8-8h7v7l-8 8-7-7z"/><circle cx="16" cy="8" r="1"/>');
        case 'list-ol':
            return strokeSvg('<path d="M10 7h10"/><path d="M10 12h10"/><path d="M10 17h10"/><path d="M4 7h2"/><path d="M4 12h2"/><path d="M4 17h2"/>');
        case 'sticky-note':
        case 'file-alt':
            return strokeSvg('<path d="M6 4h12v11l-5 5H6z"/><path d="M13 20v-5h5"/>');
        case 'file-pdf':
            return documentIcon('PDF');
        case 'file-excel':
            return documentIcon('XLS');
        case 'file-invoice-dollar':
            return documentIcon('$');
        case 'file-import':
            return documentIcon('IN');
        case 'dollar-sign':
            return strokeSvg('<path d="M12 3v18"/><path d="M16 7.5c0-1.7-1.8-3-4-3s-4 1.3-4 3 1.8 3 4 3 4 1.3 4 3-1.8 3-4 3-4-1.3-4-3"/>');
        case 'window-maximize':
            return strokeSvg('<rect x="4" y="5" width="16" height="14" rx="1.5"/><path d="M4 9h16"/>');
        case 'moon':
            return strokeSvg('<path d="M15 4a7.5 7.5 0 1 0 5 13.2A8.5 8.5 0 0 1 15 4z"/>');
        case 'sun':
            return strokeSvg('<circle cx="12" cy="12" r="3.5"/><path d="M12 2v3"/><path d="M12 19v3"/><path d="M2 12h3"/><path d="M19 12h3"/><path d="M5 5l2 2"/><path d="M17 17l2 2"/><path d="M19 5l-2 2"/><path d="M7 17l-2 2"/>');
        case 'spinner':
        case 'sync-alt':
            return strokeSvg('<path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 5v5h-5"/>');
        case 'eraser':
            return strokeSvg('<path d="M7 17l7-10 5 5-5 5H7z"/><path d="M4 20h16"/>');
        case 'eye':
            return strokeSvg('<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z"/><circle cx="12" cy="12" r="2.5"/>');
        case 'info-circle':
            return strokeSvg('<circle cx="12" cy="12" r="9"/><path d="M12 10v6"/><circle cx="12" cy="7" r="1"/>');
        case 'check-circle':
            return strokeSvg('<circle cx="12" cy="12" r="9"/><path d="M8 12.3l2.5 2.5L16.5 9"/>');
        case 'times-circle':
            return strokeSvg('<circle cx="12" cy="12" r="9"/><path d="M9 9l6 6"/><path d="M15 9l-6 6"/>');
        case 'exclamation-circle':
        case 'exclamation-triangle':
            return strokeSvg('<path d="M12 4l8 15H4z"/><path d="M12 9v5"/><circle cx="12" cy="17" r="1"/>');
        case 'power-off':
            return strokeSvg('<path d="M12 3v8"/><path d="M7.5 5.5a7 7 0 1 0 9 0"/>');
        case 'bars':
            return strokeSvg('<path d="M5 7h14"/><path d="M5 12h14"/><path d="M5 17h14"/>');
        case 'chevron-left':
        case 'angle-left':
            return strokeSvg('<path d="M15 5l-7 7 7 7"/>');
        case 'chevron-right':
        case 'angle-right':
            return strokeSvg('<path d="M9 5l7 7-7 7"/>');
        case 'chevron-up':
            return strokeSvg('<path d="M5 15l7-7 7 7"/>');
        case 'chevron-down':
            return strokeSvg('<path d="M5 9l7 7 7-7"/>');
        case 'angle-double-left':
            return strokeSvg('<path d="M11 5l-6 7 6 7"/><path d="M19 5l-6 7 6 7"/>');
        case 'angle-double-right':
            return strokeSvg('<path d="M5 5l6 7-6 7"/><path d="M13 5l6 7-6 7"/>');
        case 'arrow-left':
            return strokeSvg('<path d="M19 12H5"/><path d="M11 6l-6 6 6 6"/>');
        case 'arrow-right':
            return strokeSvg('<path d="M5 12h14"/><path d="M13 6l6 6-6 6"/>');
        case 'sitemap':
            return strokeSvg('<rect x="10" y="3" width="4" height="4" rx="1"/><rect x="3" y="17" width="4" height="4" rx="1"/><rect x="10" y="17" width="4" height="4" rx="1"/><rect x="17" y="17" width="4" height="4" rx="1"/><path d="M12 7v4"/><path d="M5 17v-2h14v2"/><path d="M12 11v4"/>');
        case 'google':
            return brandLetterIcon('G');
        case 'microsoft':
            return brandLetterIcon('M');
        case 'whatsapp':
            return brandLetterIcon('W');
        default:
            return fillSvg('<circle cx="12" cy="12" r="3"/>');
    }
}

function findIconClass(el: Element): string | null {
    for (const className of Array.from(el.classList)) {
        if (!className.startsWith(ICON_CLASS_PREFIX)) continue;
        if (ICON_MODIFIERS.has(className)) continue;
        return className;
    }
    return null;
}

function hydrateIconElement(el: Element) {
    if (!(el instanceof HTMLElement)) return;
    const iconClass = findIconClass(el);
    if (!iconClass) return;

    const iconName = iconClass.slice(ICON_CLASS_PREFIX.length);
    if (el.dataset.localIconName === iconName) return;

    el.classList.add('local-fa-icon');
    el.dataset.localIconName = iconName;
    if (!el.hasAttribute('aria-hidden')) {
        el.setAttribute('aria-hidden', 'true');
    }
    el.innerHTML = renderIconMarkup(iconName);
}

export function hydrateLocalIcons(root: ParentNode = document) {
    if (root instanceof Element && root.matches('i[class*="fa-"]')) {
        hydrateIconElement(root);
    }

    root.querySelectorAll?.('i[class*="fa-"]').forEach(icon => {
        hydrateIconElement(icon);
    });
}

export function observeLocalIcons() {
    if (iconsObserved || typeof document === 'undefined') return;

    hydrateLocalIcons(document);

    const observer = new MutationObserver(mutations => {
        for (const mutation of mutations) {
            if (mutation.type === 'attributes' && mutation.target instanceof Element) {
                hydrateIconElement(mutation.target);
                continue;
            }

            mutation.addedNodes.forEach(node => {
                if (!(node instanceof Element)) return;
                hydrateLocalIcons(node);
            });
        }
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class'],
    });

    iconsObserved = true;
}
