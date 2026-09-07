const { getCoordinates } = require('./geocode_fixer');

async function test() {
    console.log("Testing strict geocoding vs fallback...");
    
    // Test 1: Ambiguous address that should trigger the Thaketa fallback
    const result1 = await getCoordinates("အမှတ် (၁၀)၊ (က) ရပ်ကွက်", "သာကေတ");
    console.log("Test 1 Result:", result1);
    
    // Test 2: Address that should find a real coordinate in Kamayut
    const result2 = await getCoordinates("Hledan Centre", "ကမာရွတ်");
    console.log("Test 2 Result:", result2);
}
test();
