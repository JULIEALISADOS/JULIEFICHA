/**
 * Origen de la clienta (solo local, sin terceros).
 * 18-nov-2026: se quitaron la consulta de ubicacion por IP a un tercero y el envio de visitas a la base.
 * Solo lee las UTM del enlace (si las hay) y las deja en la sesion del navegador.
 */
export async function initJuliePixel() {
    const urlParams = new URLSearchParams(window.location.search);
    const utm_source = urlParams.get('utm_source') || 'Directo';
    const utm_medium = urlParams.get('utm_medium') || 'Ninguno';
    const utm_campaign = urlParams.get('utm_campaign') || 'Ninguna';
    const marketingData = { utm_source, utm_medium, utm_campaign, ubicacion: 'No capturada', timestamp: new Date().toISOString() };
    sessionStorage.setItem('julie_marketing_data', JSON.stringify(marketingData));
}

export function getMarketingContext() {
    const data = sessionStorage.getItem('julie_marketing_data');
    return data ? JSON.parse(data) : { utm_source: 'Directo', utm_medium: 'Ninguno', utm_campaign: 'Ninguna', ubicacion: 'No capturada' };
}
