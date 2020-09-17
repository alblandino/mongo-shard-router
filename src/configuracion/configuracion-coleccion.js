const CAMPO_LLAVE_POR_DEFECTO = '_id';

class ConfiguracionColeccion {
  constructor(nombre, opciones = {}) {
    this.nombre = nombre;
    this.campoLlave = opciones.llave || CAMPO_LLAVE_POR_DEFECTO;
  }

  // si uno de estos campos cambia el documento tendria que irse a otro shard
  camposQueDecidenElShard() {
    return [this.campoLlave];
  }
}

module.exports = ConfiguracionColeccion;
