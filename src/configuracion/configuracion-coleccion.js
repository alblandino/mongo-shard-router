const CAMPO_LLAVE_POR_DEFECTO = '_id';

class ConfiguracionColeccion {
  constructor(nombre, opciones = {}) {
    const geo = opciones.geo || {};

    this.nombre = nombre;
    this.campoLlave = opciones.llave || CAMPO_LLAVE_POR_DEFECTO;
    this.campoPais = geo.pais || null;
    this.campoUbicacion = geo.ubicacion || null;
  }

  usaGeolocalizacion() {
    return Boolean(this.campoPais || this.campoUbicacion);
  }

  // si uno de estos campos cambia el documento tendria que irse a otro shard
  camposQueDecidenElShard() {
    return [this.campoLlave, this.campoPais, this.campoUbicacion].filter(Boolean);
  }
}

module.exports = ConfiguracionColeccion;
