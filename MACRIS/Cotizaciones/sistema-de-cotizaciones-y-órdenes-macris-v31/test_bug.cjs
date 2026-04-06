const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch'); // Ensure we have fetch if node is old, but node 18+ has it.

const QUOTES_SUPABASE_URL = 'https://ctitnuadeqdwsgulhpjg.supabase.co';
const QUOTES_SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN0aXRudWFkZXFkd3NndWxocGpnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI3NjAxMjQsImV4cCI6MjA2ODMzNjEyNH0.Tmd2X11ukDi3I2h4uDXVABghKyMgcPpUMcGIdZbjOQE';
const supabaseQuotes = createClient(QUOTES_SUPABASE_URL, QUOTES_SUPABASE_KEY);

async function testSaveQuote() {
    // 1. Create a dummy quote
    const { data: q, error: qErr } = await supabaseQuotes.from('quotes').insert({
        manualId: 'TEST-123',
        date: '2023-01-01',
        clientId: null,
        taxRate: 0,
        terms: 'TEST'
    }).select().single();
    
    if (qErr) {
        console.error("Quote creation error:", qErr);
        return;
    }

    // 2. Prepare itemsToInsert mimicking the app
    const savedQuote = q;
    const items = [
        // A normal item that might come from the UI. 
        // Notice it might lack manualId if the user didn't enter one, or has it if they did.
        { description: 'Test Item', quantity: 1, price: 100 } 
    ];
    const image_urls = ['path1.jpg'];

    const itemsToInsert = [];
    if (items && items.length > 0) {
        items.forEach(i => {
            const { created_at, ...itemInsert } = i;
            itemsToInsert.push({ ...itemInsert, quoteId: savedQuote.id });
        });
    }
    
    if (image_urls && image_urls.length > 0) {
        image_urls.forEach((url, idx) => {
            itemsToInsert.push({
                quoteId: savedQuote.id,
                description: `<IMAGE::>${url}`,
                quantity: 0,
                price: 0,
                itemId: null,
                manualId: `IMG-${idx}`
            });
        });
    }

    console.log("itemsToInsert:", itemsToInsert);

    // 3. Insert and catch
    const { data: newItems, error: itemsError } = await supabaseQuotes.from('quote_items').insert(itemsToInsert).select();
    if (itemsError) {
        console.error("EXPECTED ERROR FOUND:");
        console.error(itemsError);
    } else {
        console.log("Inserted successfully:", newItems);
    }
    
    // cleanup
    await supabaseQuotes.from('quote_items').delete().eq('quoteId', savedQuote.id);
    await supabaseQuotes.from('quotes').delete().eq('id', savedQuote.id);
}

testSaveQuote();
