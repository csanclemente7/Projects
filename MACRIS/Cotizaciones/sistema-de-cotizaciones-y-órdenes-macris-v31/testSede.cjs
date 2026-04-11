const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.VITE_SUPABASE_URL_ORDERS || "https://fzcalgofrhbqvowazdpk.supabase.co";
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY_ORDERS || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ6Y2FsZ29mcmhicXZvd2F6ZHBrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MDkyMjQwMDUsImV4cCI6MjA2NzA0MDA1NH0.yavOv5g0iQElk7X8GHOAQrO9rnvb2mDb-i2PgtGCX-o";

const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
    const newSede = {
        id: 'test-sede-id-random-1234',
        name: 'Sede Test',
        company_id: 'test-company-id-1234',
        address: null,
        city_id: null,
        phone: null,
        contact_person: null
    };

    const res = await supabase.from('maintenance_sede').upsert([newSede], { onConflict: 'id' }).select().single();
    if (res.error) {
        console.error("SUPABASE ERROR DETAILS:", res.error);
    } else {
        console.log("SUCCESS:", res.data);
    }
}
test();
