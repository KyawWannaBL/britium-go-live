export const generateOptimizedRoute = async (selectedWaybills, riderId) => {
  // Defaulting to Britium Depot in Yangon
  const hubLocation = { latitude: 16.8053, longitude: 96.1561 }; 

  try {
    const response = await fetch('/api/optimize-wayplan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ waybills: selectedWaybills, riderId, hubLocation })
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Failed to optimize route');
    }
    
    return data;
  } catch (error) {
    console.error('Wayplan Generation Error:', error);
    throw error;
  }
};
