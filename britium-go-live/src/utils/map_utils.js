export async function saveManualMapPin(parcelId, lat, lng) {
  try {
    const response = await fetch(import.meta.env.VITE_API_URL + '/coordinates/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pickup_id: parcelId,
        latitude: lat,
        longitude: lng
      })
    });
    
    const data = await response.json();
    if (data.success) {
      alert('Location pinned and saved to dispatch board!');
      return true;
    } else {
      alert('Failed to save location: ' + data.error);
      return false;
    }
  } catch (error) {
    console.error('Error saving map pin:', error);
    return false;
  }
}
