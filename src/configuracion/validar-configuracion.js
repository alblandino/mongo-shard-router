const { ErrorDeConfiguracion } = require('../comun/errores');

function validarConfiguracion(configuracion) {
  validarShards(configuracion.shards);
  validarColecciones(configuracion.colecciones);
}

function validarShards(shards) {
  if (!Array.isArray(shards) || shards.length === 0) {
    throw new ErrorDeConfiguracion('Hay que configurar por lo menos un shard');
  }

  const nombres = new Set();
  for (const shard of shards) {
    if (!shard.nombre || !shard.uri) {
      throw new ErrorDeConfiguracion('Cada shard necesita nombre y uri');
    }
    if (nombres.has(shard.nombre)) {
      throw new ErrorDeConfiguracion('El shard ' + shard.nombre + ' esta repetido');
    }
    nombres.add(shard.nombre);
  }
}

function validarColecciones(colecciones) {
  if (!colecciones || Object.keys(colecciones).length === 0) {
    throw new ErrorDeConfiguracion('Hay que configurar las colecciones');
  }
}

module.exports = validarConfiguracion;
