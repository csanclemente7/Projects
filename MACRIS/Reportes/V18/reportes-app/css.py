import os

css = open('index.css', 'r', encoding='utf-8').read()

append = '''
/* ---------- WORKER ACTIONS DASHBOARD (MOCKUPS SPECIFIC) ---------- */
.worker-actions-panel {
    background: var(--corporate-bg-dark);
    border: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: 12px;
    padding: 24px;
    margin-bottom: 20px;
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.4);
}

.actions-header h3 {
    color: #e2e8f0;
    font-size: 1.1rem;
    font-weight: 500;
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 8px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    padding-bottom: 15px;
}

.actions-header h3 i {
    color: #00dfff; /* accent cyan */
}

.actions-header p {
    color: #94a3b8;
    font-size: 0.85rem;
    line-height: 1.4;
    margin-bottom: 20px;
}

.btn-iniciar-reporte {
    width: 100%;
    /* sleek blue gradient from img 2 */
    background: linear-gradient(180deg, #2b95de 0%, #0c619e 100%);
    color: white;
    border: none;
    border-radius: 8px;
    padding: 14px;
    font-size: 0.95rem;
    font-weight: 500;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    cursor: pointer;
    box-shadow: 0 4px 15px rgba(12, 97, 158, 0.4);
    transition: all 0.2s ease;
    margin-bottom: 15px;
}

.btn-iniciar-reporte:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(12, 97, 158, 0.6);
}

.actions-grid-2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    margin-bottom: 20px;
}

.action-card-square {
    /* dark transparent background from img 1 squares */
    background: rgba(30, 41, 59, 0.4);
    border: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: 10px;
    padding: 20px 10px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.2s ease;
    color: #e2e8f0;
}

.action-card-square:hover {
    background: rgba(30, 41, 59, 0.8);
    border-color: rgba(255, 255, 255, 0.1);
}

.action-card-square i {
    font-size: 2rem;
    color: #38bdf8; /* light blue */
    margin-bottom: 12px;
}

.action-card-square .card-title {
    font-weight: 600;
    font-size: 0.85rem;
    margin-bottom: 4px;
}

.action-card-square .card-desc {
    font-size: 0.65rem;
    color: #64748b;
    text-align: center;
    line-height: 1.2;
}

.tip-banner {
    display: flex;
    align-items: center;
    gap: 12px;
    background: rgba(15, 23, 42, 0.6);
    border: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: 8px;
    padding: 12px 16px;
    position: relative;
    overflow: hidden;
}

.tip-banner::after {
    /* Inner bottom cyan glow effect from img 3 */
    content: '';
    position: absolute;
    bottom: -1px;
    left: 10%;
    width: 80%;
    height: 1px;
    background: radial-gradient(circle, rgba(0, 223, 255, 0.8) 0%, transparent 80%);
    box-shadow: 0 -1px 8px 1px rgba(0, 223, 255, 0.5);
}

.tip-banner i {
    color: #0ea5e9;
    font-size: 1.2rem;
}

.tip-banner span {
    color: #94a3b8;
    font-size: 0.8rem;
    line-height: 1.3;
}

.tip-banner strong {
    color: #cbd5e1;
    font-weight: 500;
}
'''
if '.worker-actions-panel' not in css:
    open('index.css', 'w', encoding='utf-8').write(css + append)

print("done css")
