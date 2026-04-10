

import flatpickr from 'flatpickr';
import { Spanish } from 'flatpickr/dist/l10n/es.js';
import * as D from './dom';
import * as State from './state';
import * as UI from './ui';
import type { PdfTemplate } from './types';
import { handleLogout } from './auth';
import { onSwitchToReportsPage } from './ui-reports';

function setupNavigationEventListeners() {
    D.mainNavLinks.forEach(link => {
        link.addEventListener('click', async (e) => {
            e.preventDefault();
            const pageName = (link as HTMLElement).dataset.page;
            if (pageName) {
                if (pageName === 'page-settings') {
                    const currentTheme = await UI.getCurrentThemeFromDB();
                    const radio = document.querySelector(`input[name="theme"][value="${currentTheme}"]`) as HTMLInputElement;
                     if (radio) radio.checked = true;
                }
                
                UI.navigateTo(pageName);
                
                if (pageName === 'page-reports') {
                    onSwitchToReportsPage(); // Ejecuta de forma asíncrona pero sin bloquear la UI
                }
            }
        });
    });
}

function setupQuoteEventListeners() {
    UI.setupQuoteAnnexUpload();

    D.quoteItemsTableBody.addEventListener('input', (e) => {
        const target = e.target as HTMLInputElement | HTMLTextAreaElement;
        const row = target.closest('tr');
        if (!row || !row.dataset.itemId) return;

        const quoteItemId = row.dataset.itemId;
        const quote = State.getActiveQuote();
        if (!quote) return;
        const quoteItem = quote.items.find(i => i.id === quoteItemId);
        if (!quoteItem) return;
        
        if (target.matches('.item-qty')) {
            quoteItem.quantity = parseFloat(target.value) || 0;
        } else if (target.matches('.item-price')) {
            quoteItem.price = parseFloat(target.value.replace(/[^0-9]+/g,"")) || 0;
        } else if (target.matches('.item-desc')) {
            quoteItem.description = target.value;
        }
        
        State.updateActiveQuote(quote);
        UI.updateQuoteSummary();
        UI.updateItemRowTotal(row);
    });

    D.quoteItemsTableBody.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        const row = target.closest('tr');
        if (!row || !row.dataset.itemId) return;
    
        const itemId = row.dataset.itemId;
    
        // Handle delete button clicks first
        if (target.closest('.delete-item-btn')) {
            UI.handleRemoveItemFromQuote(itemId);
            return; // Important to stop further processing
        }
    
        // Handle clicks specifically on the edit pencil
        const pencil = target.closest<HTMLElement>('.edit-indicator');
        if (pencil) {
            // Check if it's for the description
            const descWrapper = pencil.closest('.item-desc-mobile-view');
            if (descWrapper) {
                UI.openDescriptionEditModal(itemId, 'quote');
                return;
            }
    
            // Check if it's for quantity or price
            const valueWrapper = pencil.closest<HTMLElement>('.item-value-mobile-view');
            if (valueWrapper) {
                const field = valueWrapper.dataset.field as 'quantity' | 'price' | undefined;
                if (field) {
                    UI.openValueEditModal(itemId, field, 'quote');
                }
            }
        }
    });

    D.vatToggleSwitch.addEventListener('change', UI.handleVatToggle);

    D.quoteTabsBar.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        const tab = target.closest<HTMLElement>('.quote-tab');
        if (!tab) return;

        const closeBtn = target.closest('.close-tab-btn');

        if (closeBtn && tab.dataset.id) {
            e.stopPropagation();
            UI.closeQuoteTab(tab.dataset.id);
        } else if (tab.classList.contains('new-quote-tab')) {
            UI.createNewQuote(tab);
        } else if (tab.dataset.id) {
            UI.switchQuoteTab(tab.dataset.id);
        }
    });

    D.quoteTermsTextarea.addEventListener('input', () => {
        const quote = State.getActiveQuote();
        if (quote) {
            quote.terms = D.quoteTermsTextarea.value;
            State.updateActiveQuote(quote);
        }
    });

    D.quoteInternalNotesTextarea.addEventListener('input', () => {
        const quote = State.getActiveQuote();
        if (quote) {
            quote.internal_notes = D.quoteInternalNotesTextarea.value;
            State.updateActiveQuote(quote);
        }
    });

    D.quoteSedeSelect.addEventListener('change', (e) => {
        const quote = State.getActiveQuote();
        if (quote) {
            quote.sede_id = (e.target as HTMLSelectElement).value || null;
            State.updateActiveQuote(quote);
        }
    });

    D.quoteAddSedeBtn.addEventListener('click', () => {
        const quote = State.getActiveQuote();
        if (quote && quote.clientId) {
            UI.handleAddSedeClick('quote', quote.clientId);
        } else {
            UI.showNotification("Seleccione un cliente Empresa primero", "warning");
        }
    });
}

function setupManagementEventListeners() {
    // Clients
    D.clientListSearchInput.addEventListener('input', () => UI.renderClientsList());
    D.addNewClientPageBtn.addEventListener('click', () => UI.openEntityModal('client'));
    D.addNewSedePageBtn.addEventListener('click', () => UI.openEntityModal('sede', null));
    D.deleteAllClientsBtn.addEventListener('click', UI.handleDeleteAllClients);
    D.clientsListContainer.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        const editBtn = target.closest('.edit-btn') as HTMLElement | null;
        const deleteBtn = target.closest('.delete-btn') as HTMLElement | null;
        const addSedeBtn = target.closest('.add-sede-client-btn') as HTMLElement | null;

        if (editBtn && editBtn.dataset.id) {
            UI.openEntityModal('client', editBtn.dataset.id);
        } else if (addSedeBtn && addSedeBtn.dataset.id) {
            UI.openEntityModal('sede', addSedeBtn.dataset.id);
        } else if (deleteBtn && deleteBtn.dataset.id) {
            UI.handleDeleteClient(deleteBtn.dataset.id);
        }
    });

    // Items
    D.itemListSearchInput.addEventListener('input', () => UI.renderCatalogItemsList());
    D.addNewItemPageBtn.addEventListener('click', () => UI.openEntityModal('item'));
    D.deleteAllItemsBtn.addEventListener('click', UI.handleDeleteAllItems);
    D.itemsListContainer.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        const editBtn = target.closest('.edit-btn') as HTMLElement | null;
        const deleteBtn = target.closest('.delete-btn') as HTMLElement | null;
        
        if (editBtn && editBtn.dataset.id) {
            UI.openEntityModal('item', editBtn.dataset.id);
        } else if (deleteBtn && deleteBtn.dataset.id) {
            UI.handleDeleteItem(deleteBtn.dataset.id);
        }
    });
    
    // Saved Quotes
    D.savedQuotesSearchInput.addEventListener('input', () => UI.renderSavedQuotesPageList());
    D.deleteAllQuotesBtn.addEventListener('click', UI.handleDeleteAllSavedQuotes);

    // Orders
    D.orderListSearchInput.addEventListener('input', UI.renderOrdersList);
    D.addNewOrderPageBtn.addEventListener('click', UI.openOrderSourceModal);
    D.ordersListContainer.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        const editBtn = target.closest('.edit-btn') as HTMLElement | null;
        const deleteBtn = target.closest('.delete-btn') as HTMLElement | null;

        if (editBtn && editBtn.dataset.id) {
            UI.navigateToOrderWorkspace(editBtn.dataset.id);
        } else if (deleteBtn && deleteBtn.dataset.id) {
            UI.handleDeleteOrder(deleteBtn.dataset.id);
        }
    });

    // Technicians
    D.technicianListSearchInput.addEventListener('input', UI.renderTechniciansList);
    D.addNewTechnicianPageBtn.addEventListener('click', () => UI.openEntityModal('technician'));
    D.techniciansListContainer.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        const editBtn = target.closest('.edit-btn') as HTMLElement | null;
        const deleteBtn = target.closest('.delete-btn') as HTMLElement | null;

        if (editBtn && editBtn.dataset.id) {
            UI.openEntityModal('technician', editBtn.dataset.id);
        } else if (deleteBtn && deleteBtn.dataset.id) {
            UI.handleDeleteTechnician(deleteBtn.dataset.id);
        }
    });
}

function setupModalEventListeners() {
    D.closeModalBtns.forEach(btn => btn.addEventListener('click', UI.closeAllModals));
    D.cancelModalBtns.forEach(btn => btn.addEventListener('click', UI.closeAllModals));
    
    const modals = [D.entityModal, D.pdfPreviewModal, D.descriptionEditModal, D.valueEditModal, D.orderSourceModal, D.confirmationModal];
    modals.forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) UI.closeAllModals();
        });
    });

    D.modalForm.addEventListener('submit', UI.handleModalFormSubmit);
    D.descriptionEditForm.addEventListener('submit', UI.handleDescriptionFormSubmit);
    D.valueEditForm.addEventListener('submit', UI.handleValueEditFormSubmit);

    // Quote Page Client/Item Modals
    D.addClientBtn.addEventListener('click', () => UI.openEntityModal('client'));
    D.editClientBtn.addEventListener('click', UI.handleEditClientClick);
    D.addNewItemQuotePageBtn.addEventListener('click', () => UI.openEntityModal('item'));

    // Order Source Modal
    D.createOrderManuallyBtn.addEventListener('click', async () => {
        UI.closeAllModals();
        await UI.navigateToOrderWorkspace(null);
    });
    D.createOrderFromQuoteBtn.addEventListener('click', () => {
        D.orderSourceQuoteSearchInput.style.display = 'block';
        D.orderSourceQuoteSearchInput.focus();
    });

    // Confirmation Modal
    D.confirmationModalConfirmBtn.addEventListener('click', UI.handleConfirmAction);
    D.confirmationModalCancelBtn.addEventListener('click', UI.closeConfirmationModal);
}

function setupGlobalActionListeners() {
    D.duplicateQuoteBtn.addEventListener('click', () => {
        const activeId = State.getActiveQuoteId();
        if (activeId) {
            UI.handleDuplicateQuote(activeId, true, D.duplicateQuoteBtn as HTMLButtonElement);
        }
    });
    D.saveQuoteBtn.addEventListener('click', UI.handleSaveQuote);
    D.deleteCurrentQuoteBtn.addEventListener('click', () => {
        const activeId = State.getActiveQuoteId();
        if (activeId) {
            UI.handleDeleteQuote(activeId);
        }
    });
    D.generatePdfBtn.addEventListener('click', UI.handleGeneratePdf);
    
    D.savedQuotesPageContainer.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        const quoteRow = target.closest('tr') as HTMLTableRowElement | null;
        if (!quoteRow || !quoteRow.dataset.id) return;

        const deleteBtn = target.closest('.delete-btn');
        const createOrderBtn = target.closest('.create-order-btn');
        const editQuoteBtn = target.closest('.edit-quote-btn');
        const duplicateListBtn = target.closest('.copy-quote-btn');
        const pdfListBtn = target.closest('.generate-pdf-list-btn');
        const billListBtn = target.closest('.generate-bill-list-btn');

        if (deleteBtn) {
            e.stopPropagation();
            UI.handleDeleteQuote(quoteRow.dataset.id);
        } else if (createOrderBtn) {
            e.stopPropagation();
            UI.navigateToOrderWorkspace(null, quoteRow.dataset.id);
        } else if (duplicateListBtn) {
            e.stopPropagation();
            UI.handleDuplicateQuote(quoteRow.dataset.id, false, duplicateListBtn as HTMLButtonElement);
        } else if (pdfListBtn) {
            e.stopPropagation();
            UI.handleGeneratePdfFromList(quoteRow.dataset.id, pdfListBtn as HTMLButtonElement);
        } else if (billListBtn) {
            e.stopPropagation();
            UI.handleGenerateBillFromList(quoteRow.dataset.id, billListBtn as HTMLButtonElement);
        } else if (editQuoteBtn) {
            e.stopPropagation();
            UI.loadQuote(quoteRow.dataset.id);
        } else {
            UI.loadQuote(quoteRow.dataset.id);
        }
    });
}

function setupOrderWorkspaceEventListeners() {
    UI.setupOrderAnnexUpload();
    D.backToOrdersListBtn?.addEventListener('click', () => {
        const orderWorkspace = document.getElementById('page-order-workspace');
        if (orderWorkspace?.classList.contains('as-modal')) {
            orderWorkspace.classList.remove('as-modal', 'active');
        } else {
            UI.navigateTo('page-orders');
        }
    });
    D.saveOrderBtn.addEventListener('click', UI.handleSaveOrder);
    D.generateOrderPdfBtn.addEventListener('click', UI.handleGenerateOrderPdf);
    // Client and Item Modals
    D.orderAddClientBtn.addEventListener('click', () => UI.openEntityModal('client'));
    D.orderEditClientBtn.addEventListener('click', UI.handleEditClientClickOrder);
    D.orderAddNewItemBtn.addEventListener('click', () => UI.openEntityModal('item'));

    D.orderSedeSelect.addEventListener('change', (e) => {
        const order = State.getCurrentOrder();
        if (order) {
            order.sede_id = (e.target as HTMLSelectElement).value || null;
            UI.handleOrderDetailsChange();
        }
    });

    D.orderAddSedeBtn.addEventListener('click', () => {
        const order = State.getCurrentOrder();
        if (order && order.clientId) {
            UI.handleAddSedeClick('order', order.clientId);
        } else {
            UI.showNotification("Seleccione un cliente Empresa primero", "warning");
        }
    });

    const setupTableListeners = (tbody: HTMLElement) => {
        tbody.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            const row = target.closest('tr');
            if (!row || !row.dataset.itemId) return;
        
            const itemId = row.dataset.itemId;
        
            if (target.closest('.delete-item-btn')) {
                UI.handleRemoveItemFromOrder(itemId);
                return;
            }
        
            const pencil = target.closest<HTMLElement>('.edit-indicator');
            if (pencil) {
                const descWrapper = pencil.closest('.item-desc-mobile-view');
                if (descWrapper) {
                    UI.openDescriptionEditModal(itemId, 'order');
                    return;
                }
        
                const valueWrapper = pencil.closest<HTMLElement>('.item-value-mobile-view');
                if (valueWrapper) {
                    const field = valueWrapper.dataset.field as 'quantity' | 'price' | undefined;
                    if (field) {
                        UI.openValueEditModal(itemId, field, 'order');
                    }
                }
            }
        });
        tbody.addEventListener('input', UI.handleOrderItemChange);
    };

    if (D.orderServicesTableBody) setupTableListeners(D.orderServicesTableBody);
    if (D.orderMaterialsTableBody) setupTableListeners(D.orderMaterialsTableBody);
    
    // Listeners are setup via setupTableListeners
    D.orderTypeSelect.addEventListener('change', UI.handleOrderDetailsChange);
    D.orderTypeCustomInput.addEventListener('input', UI.handleOrderDetailsChange);
    D.orderStatusSelect.addEventListener('change', UI.handleOrderDetailsChange);
    D.orderNotesTextarea.addEventListener('input', UI.handleOrderDetailsChange);
    D.orderDateInput.addEventListener('input', UI.handleOrderDetailsChange);
    D.orderTimeInput.addEventListener('input', UI.handleOrderDetailsChange);
    D.orderClientCityInput.addEventListener('input', UI.handleOrderDetailsChange);
    document.querySelectorAll('.preset-time-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const time = (e.currentTarget as HTMLElement).dataset.time;
            if(time) {
                D.orderTimeInput.value = time;
                UI.handleOrderDetailsChange();
            }
        });
    });
    
    if (D.orderDifficultySelect) {
        D.orderDifficultySelect.addEventListener('change', () => {
            UI.handleOrderDifficultyChange();
            UI.handleOrderDetailsChange(); // Para guardar automáticamente
        });
    }

    D.orderDurationHoursInput.addEventListener('input', UI.handleOrderDetailsChange);
    D.orderDurationMinutesInput.addEventListener('input', UI.handleOrderDetailsChange);
}


function setupSettingsEventListeners() {
    D.themeOptionsContainer?.addEventListener('change', (e) => {
        const target = e.target as HTMLInputElement;
        if (target.name === 'theme') {
            UI.applyTheme(target.value as 'light' | 'dark');
        }
    });
    D.fontSizeSlider?.addEventListener('input', (e) => {
        const newSize = (e.target as HTMLInputElement).value;
        UI.applyFontSize(parseInt(newSize));
    });

    D.vatRateSettingInput?.addEventListener('input', async (e) => {
        const newRate = parseFloat((e.target as HTMLInputElement).value) || 0;
        await State.setDefaultVatRate(newRate);
        UI.showNotification(`Tasa de IVA por defecto actualizada a ${newRate}%.`);
    });

    D.pdfTemplateOptionsContainer?.addEventListener('click', async (e) => {
        const target = e.target as HTMLElement;
        const previewBtn = target.closest<HTMLButtonElement>('.preview-pdf-btn');
        const radioLabel = target.closest<HTMLLabelElement>('.template-option');

        if (previewBtn) {
            e.preventDefault();
            e.stopPropagation();
            const template = previewBtn.dataset.template as PdfTemplate | undefined;
            if (template) {
                const originalContent = previewBtn.innerHTML;
                previewBtn.disabled = true;
                previewBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i>`;
                try {
                    await UI.handlePreviewPdfTemplate(template);
                } catch(err) {
                    console.error("PDF preview failed", err);
                } finally {
                    previewBtn.disabled = false;
                    previewBtn.innerHTML = originalContent;
                }
            }
        } else if (radioLabel) {
            const radio = radioLabel.querySelector<HTMLInputElement>('input[type="radio"]');
            if (radio && !radio.checked) {
                radio.checked = true;
                await UI.applyPdfTemplate(radio.value as PdfTemplate);
            }
        }
    });
    
    D.pdfOutputOptionsContainer?.addEventListener('change', (e) => {
        const target = e.target as HTMLInputElement;
        if (target.name === 'pdf-output') {
            const preference = target.value as 'preview' | 'download';
            UI.applyPdfOutputPreference(preference);
        }
    });


    D.backupBtn?.addEventListener('click', UI.handleBackup);
    D.restoreInput?.addEventListener('change', UI.handleRestore);
    D.resetAppBtn?.addEventListener('click', UI.handleResetApplication);
    D.logoutBtn.addEventListener('click', () => {
        UI.showConfirmationModal('Cerrar sesión', '¿Desea cerrar sesión?', handleLogout);
    });
    D.currentUserLogout?.addEventListener('click', () => {
        UI.showConfirmationModal('Cerrar sesión', '¿Desea cerrar sesión?', handleLogout);
    });
    D.changePasswordForm.addEventListener('submit', UI.handleChangePassword);

    D.saveTextsBtn?.addEventListener('click', async () => {
        const btn = D.saveTextsBtn;
        const originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Guardando...`;

        try {
            const noVat = D.termsNoVatSetting.value;
            const withVat = D.termsWithVatSetting.value;
            const footer = D.pdfFooterTextSetting.value;

            await Promise.all([
                State.setQuoteTermsNoVat(noVat),
                State.setQuoteTermsWithVat(withVat),
                State.setPdfFooterText(footer)
            ]);

            UI.showNotification('Textos guardados correctamente.', 'success');
        } catch (error: any) {
            UI.showNotification(`Error al guardar los textos: ${error.message}`, 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    });

    D.saveCompanyDataBtn?.addEventListener('click', async () => {
        const btn = D.saveCompanyDataBtn;
        const originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Guardando...`;

        try {
            await Promise.all([
                State.setCompanyName(D.companyNameSetting.value),
                State.setCompanyAddress1(D.companyAddress1Setting.value),
                State.setCompanyAddress2(D.companyAddress2Setting.value),
                State.setCompanyWebsite(D.companyWebsiteSetting.value),
                State.setCompanyPhone(D.companyPhoneSetting.value),
                State.setCompanyEmail(D.companyEmailSetting.value)
            ]);

            UI.showNotification('Datos de la empresa guardados.', 'success');
        } catch (error: any) {
            UI.showNotification(`Error al guardar datos: ${error.message}`, 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    });
}

function setupPdfDownloadListener() {
    D.downloadPdfBtn.addEventListener('click', async () => {
        const doc = State.getCurrentPdfDocForDownload();
        const fileName = State.getCurrentPdfFileName();
        
        if (doc) {
            const saveSuccess = await UI.handleSaveQuote();
            if (saveSuccess) {
                const effectiveFileName = fileName || 'Cotizacion.pdf';
                UI.showNotification(`Iniciando descarga de ${effectiveFileName}`, 'info');
                doc.save(effectiveFileName);
                if (!fileName) {
                     UI.showNotification('No se encontró el nombre de archivo, se usó uno genérico.', 'warning');
                }
                UI.closeAllModals();
            }
        } else {
            UI.showNotification('No hay un PDF para descargar.', 'error');
        }
    });
}

function setupAgendaEventListeners() {
    D.agendaPrevBtn?.addEventListener('click', UI.handleAgendaNavPrev);
    D.agendaNextBtn?.addEventListener('click', UI.handleAgendaNavNext);
    D.agendaViewSwitcher?.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        const btn = target.closest('button');
        if (btn && btn.dataset.view) {
            const view = btn.dataset.view as 'month' | 'week' | 'day';
            UI.handleAgendaViewChange(view);
        }
    });
}

function setupOrderTabsEventListeners() {
    const ordersPage = document.getElementById('page-orders');
    if (!ordersPage) return;

    const tabsContainer = ordersPage.querySelector('.tabs-container');
    if (!tabsContainer) return;

    tabsContainer.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        const tabLink = target.closest('.tab-link');
        if (tabLink && !tabLink.classList.contains('active')) {
            const tabType = tabLink.getAttribute('data-tab') as 'pending' | 'completed';
            if (!tabType) return;

            tabsContainer.querySelectorAll('.tab-link').forEach(tab => tab.classList.remove('active'));
            tabLink.classList.add('active');
            
            State.setActiveOrderTab(tabType);
            UI.renderOrdersList();
        }
    });
}

export function setupEventListeners() {
    setupNavigationEventListeners();
    setupQuoteEventListeners();
    setupManagementEventListeners();
    setupModalEventListeners();
    setupGlobalActionListeners();
    setupSettingsEventListeners();
    setupPdfDownloadListener();
    setupOrderWorkspaceEventListeners();
    setupAgendaEventListeners();
    setupOrderTabsEventListeners();

    UI.setupItemSearch(D.itemSearchInput, D.itemSearchResultsContainer, 'quote');
    UI.setupClientSearch(D.clientSearchInput, D.clientSearchResultsContainer, 'quote');
    UI.setupItemSearch(D.orderItemSearchInput, D.orderItemSearchResults, 'order');
    UI.setupClientSearch(D.orderClientSearchInput, D.orderClientSearchResults, 'order');
    UI.setupOrderSourceSearch();
    UI.setupCustomTechnicianSelector();
    UI.setupCustomOrderTypeSelector();


    flatpickr(D.quoteDateInput, {
        altInput: true,
        altFormat: "d-m-Y",
        dateFormat: "Y-m-d",
        locale: Spanish,
        onChange: (selectedDates, dateStr) => {
            const quote = State.getActiveQuote();
            if (quote && dateStr) {
                quote.date = `${dateStr}T12:00:00.000Z`;
                State.updateActiveQuote(quote);
            }
        },
    });

    flatpickr(D.orderDateInput, {
        altInput: true,
        altFormat: "d-m-Y",
        dateFormat: "Y-m-d",
        locale: Spanish,
        onChange: UI.handleOrderDetailsChange,
    });
}
