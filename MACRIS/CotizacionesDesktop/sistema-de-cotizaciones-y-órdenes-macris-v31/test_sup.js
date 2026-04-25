import { createClient } from '@supabase/supabase-js';
const s = createClient('https://ctitnuadeqdwsgulhpjg.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN0aXRudWFkZXFkd3NndWxocGpnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI3NjAxMjQsImV4cCI6MjA2ODMzNjEyNH0.Tmd2X11ukDi3I2h4uDXVABghKyMgcPpUMcGIdZbjOQE');
async function test() {
    try {
        const res = await s.storage.listBuckets();
        console.log("Buckets:", res.data);
        const ref = await s.from('quotes').select('image_urls').limit(1);
        console.log("Quotes query image_urls:", ref.error ? ref.error : "success", ref.data);
    } catch(e) { console.error(e) }
}
test();
