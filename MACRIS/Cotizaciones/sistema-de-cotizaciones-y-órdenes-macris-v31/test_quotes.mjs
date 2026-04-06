import { createClient } from '@supabase/supabase-js';

const QUOTES_SUPABASE_URL = 'https://ctitnuadeqdwsgulhpjg.supabase.co';
const QUOTES_SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN0aXRudWFkZXFkd3NndWxocGpnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI3NjAxMjQsImV4cCI6MjA2ODMzNjEyNH0.Tmd2X11ukDi3I2h4uDXVABghKyMgcPpUMcGIdZbjOQE';
const supabaseQuotes = createClient(QUOTES_SUPABASE_URL, QUOTES_SUPABASE_KEY);

async function getQuote() {
    const { data, error } = await supabaseQuotes.from('quotes').select('id, internal_notes, created_at').order('created_at', { ascending: false }).limit(2);
    if (error) console.error(error);
    console.log(data);
}
getQuote();
