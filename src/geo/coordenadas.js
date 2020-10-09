const RADIO_TIERRA_KM = 6371;

function distanciaKm(origen, destino) {
  const diferenciaLat = aRadianes(destino.lat - origen.lat);
  const diferenciaLng = aRadianes(destino.lng - origen.lng);

  const a = Math.sin(diferenciaLat / 2) ** 2 +
    Math.cos(aRadianes(origen.lat)) * Math.cos(aRadianes(destino.lat)) * Math.sin(diferenciaLng / 2) ** 2;

  return 2 * RADIO_TIERRA_KM * Math.asin(Math.sqrt(a));
}

function aRadianes(grados) {
  return grados * Math.PI / 180;
}

function leerPunto(valor) {
  if (!valor) {
    return null;
  }

  const { lat, lng } = extraerLatitudYLongitud(valor);
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return null;
  }
  return { lat, lng };
}

function extraerLatitudYLongitud(valor) {
  if (Array.isArray(valor)) {
    return { lng: valor[0], lat: valor[1] };
  }
  if (valor.type === 'Point') {
    return { lng: valor.coordinates[0], lat: valor.coordinates[1] };
  }
  return { lat: valor.lat, lng: valor.lng };
}

module.exports = { distanciaKm, leerPunto };
