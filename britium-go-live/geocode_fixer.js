const MAPBOX_TOKEN = process.env.MAPBOX_TOKEN;
const YANGON_BBOX = '95.84,16.52,96.53,17.22'; 

export function sanitizeAddress(rawAddress) {
    if (!rawAddress) return "";
    return rawAddress
        .replace(/\(.*?\)/g, '')
        .replace(/အမှတ်|အခန်း|တိုက်|အလွှာ|အိမ်အမှတ်/g, '') 
        .replace(/\s+/g, ' ')
        .trim();
}

const TOWNSHIP_CENTROIDS = {
    "သာကေတ": { lat: 16.8122, lng: 96.1883 },
    "တောင်ဥက္ကလာပ": { lat: 16.8450, lng: 96.1856 },
    "သင်္ဃန်းကျွန်း": { lat: 16.8229, lng: 96.1878 },
    "လှိုင်": { lat: 16.8407, lng: 96.1265 },
    "ကမာရွတ်": { lat: 16.8248, lng: 96.1306 },
    "စမ်းချောင်း": { lat: 16.8041, lng: 96.1332 }
    // Add remaining townships as needed
};

function getCentroidFallback(township) {
    const defaultCoords = TOWNSHIP_CENTROIDS[township];
    if (defaultCoords) {
        return { lat: defaultCoords.lat, lng: defaultCoords.lng, status: 'APPLY_CORRECTION_FALLBACK' };
    }
    return { lat: null, lng: null, status: 'MANUAL_REVIEW_REQUIRED' };
}

export async function getCoordinates(address, township) {
    const cleanAddress = sanitizeAddress(address);
    const query = encodeURIComponent(`${cleanAddress}, ${township}, Yangon`);
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${query}.json?access_token=${MAPBOX_TOKEN}&bbox=${YANGON_BBOX}&limit=1`;

    try {
        const response = await fetch(url);
        const data = await response.json();

        if (data.features && data.features.length > 0) {
            const [longitude, latitude] = data.features[0].center;
            return { lat: latitude, lng: longitude, status: 'SUCCESS' };
        } else {
            return getCentroidFallback(township);
        }
    } catch (error) {
        console.error("Geocoding failed:", error);
        return getCentroidFallback(township);
    }
}
console.log("Geocoding utility loaded successfully.");
