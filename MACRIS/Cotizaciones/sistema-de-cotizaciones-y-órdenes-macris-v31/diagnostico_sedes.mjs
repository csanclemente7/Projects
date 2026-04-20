/**
 * Diagnóstico: Sedes con client_id incorrecto
 *
 * Este script cruza la tabla `clients` (DB Cotizaciones) con
 * `maintenance_companies` (DB Mantenimiento) para detectar sedes que
 * apuntan a una empresa incorrecta o inexistente.
 *
 * Ejecutar con: node diagnostico_sedes.mjs
 */

import { createClient } from '@supabase/supabase-js';

const supabaseQuotes = createClient(
    'https://ctitnuadeqdwsgulhpjg.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN0aXRudWFkZXFkd3NndWxocGpnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI3NjAxMjQsImV4cCI6MjA2ODMzNjEyNH0.Tmd2X11ukDi3I2h4uDXVABghKyMgcPpUMcGIdZbjOQE'
);

const supabaseOrders = createClient(
    'https://fzcalgofrhbqvowazdpk.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ6Y2FsZ29mcmhicXZvd2F6ZHBrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE0NjQwNTQsImV4cCI6MjA2NzA0MDA1NH0.yavOv5g0iQElk7X8GHOAQrO9rnvb2mDb-i2PgtGCX-o'
);

async function main() {
    console.log('=== DIAGNÓSTICO DE SEDES ===\n');

    // 1. Traer todos los clientes empresa de DB Cotizaciones
    const { data: clients, error: clientsError } = await supabaseQuotes
        .from('clients')
        .select('id, name, manualId, category')
        .eq('category', 'empresa');

    if (clientsError) { console.error('Error fetching clients:', clientsError); process.exit(1); }

    const empresaMap = new Map(clients.map(c => [c.id, c]));
    const empresaIds = new Set(clients.map(c => c.id));

    console.log(`Empresas encontradas en DB Cotizaciones: ${clients.length}`);
    clients.forEach(c => console.log(`  [${c.manualId}] ${c.name} (${c.id.slice(0,8)}...)`));
    console.log('');

    // 2. Traer todos los registros de maintenance_companies
    const { data: companies, error: companiesError } = await supabaseOrders
        .from('maintenance_companies')
        .select('*');

    if (companiesError) { console.error('Error fetching companies:', companiesError); process.exit(1); }

    console.log(`Registros en maintenance_companies: ${companies.length}`);
    console.log('');

    // 3. Separar registros raíz (sin client_id) de sedes (con client_id)
    const roots = companies.filter(c => !c.client_id);
    const sedes = companies.filter(c => !!c.client_id);

    console.log(`Registros raíz (empresas sincronizadas, sin client_id): ${roots.length}`);
    console.log(`Registros sede (con client_id): ${sedes.length}`);
    console.log('');

    // 4. Verificar cada sede: su client_id debe apuntar a una empresa conocida
    console.log('=== VERIFICACIÓN DE SEDES ===\n');

    let sedesOk = 0;
    let sedesConProblema = [];

    for (const sede of sedes) {
        const empresaPadre = empresaMap.get(sede.client_id);
        if (empresaPadre) {
            sedesOk++;
        } else {
            // El client_id no corresponde a ninguna empresa conocida en Cotizaciones
            // Buscar si coincide con algún registro raíz de maintenance_companies (posible confusión)
            const rootMatch = roots.find(r => r.id === sede.client_id);
            sedesConProblema.push({
                sede,
                rootMatch: rootMatch || null,
                issue: rootMatch
                    ? `client_id apunta a un registro raíz de maintenance_companies (empresa no sincronizada)`
                    : `client_id (${sede.client_id.slice(0,8)}...) NO existe en ninguna tabla conocida`
            });
        }
    }

    console.log(`Sedes con client_id CORRECTO: ${sedesOk}`);
    console.log(`Sedes con client_id INCORRECTO u HUÉRFANO: ${sedesConProblema.length}`);
    console.log('');

    if (sedesConProblema.length > 0) {
        console.log('--- SEDES CON PROBLEMAS ---');
        sedesConProblema.forEach(({ sede, rootMatch, issue }) => {
            console.log(`\nSede: "${sede.name}" (ID: ${sede.id})`);
            console.log(`  client_id apunta a: ${sede.client_id}`);
            console.log(`  Problema: ${issue}`);
            if (rootMatch) {
                console.log(`  Empresa raíz encontrada con ese ID: "${rootMatch.name}"`);
            }
        });
    }

    // 5. Verificar también si hay sedes cuyo client_id apunta a la empresa CORRECTA
    //    pero la empresa NO tiene entrada en maintenance_companies (raíz faltante)
    console.log('\n=== EMPRESAS SIN ENTRADA RAÍZ EN maintenance_companies ===\n');
    const rootIds = new Set(roots.map(r => r.id));
    let empresasSinRaiz = clients.filter(c => !rootIds.has(c.id));
    if (empresasSinRaiz.length === 0) {
        console.log('Todas las empresas tienen su entrada raíz sincronizada. OK');
    } else {
        console.log(`Empresas sin entrada raíz (no sincronizadas a maintenance_companies):`);
        empresasSinRaiz.forEach(c => console.log(`  [${c.manualId}] ${c.name} (${c.id})`));
    }

    // 6. Resumen por empresa: qué sedes tiene cada una
    console.log('\n=== MAPA EMPRESA → SEDES ===\n');
    for (const empresa of clients) {
        const sedesDeEmpresa = sedes.filter(s => s.client_id === empresa.id);
        if (sedesDeEmpresa.length > 0) {
            console.log(`[${empresa.manualId}] ${empresa.name}:`);
            sedesDeEmpresa.forEach(s => console.log(`    - ${s.name} (city_id: ${s.city_id || 'N/A'}, address: ${s.address || 'N/A'})`));
        }
    }

    console.log('\n=== FIN DEL DIAGNÓSTICO ===');
}

main().catch(console.error);
