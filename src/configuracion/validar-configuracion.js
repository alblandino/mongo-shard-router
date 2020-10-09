const { ErrorDeConfiguracion } = require('../comun/errores');

function validarConfiguracion(configuracion) {
  const zonas = configuracion.zonas || [];

  validarShards(configuracion.shards);
  validarZonas(zonas, configuracion.shards, configuracion.zonaPorDefecto);
  validarColecciones(configuracion.colecciones, zonas);
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

function validarZonas(zonas, shards, zonaPorDefecto) {
  const nombresDeShards = shards.map(shard => shard.nombre);

  for (const zona of zonas) {
    if (!zona.shards || zona.shards.length === 0) {
      throw new ErrorDeConfiguracion('La zona ' + zona.nombre + ' no tiene shards');
    }

    const shardQueNoExiste = zona.shards.find(nombre => !nombresDeShards.includes(nombre));
    if (shardQueNoExiste) {
      throw new ErrorDeConfiguracion('La zona ' + zona.nombre + ' tiene un shard que no existe: ' + shardQueNoExiste);
    }
  }

  if (zonaPorDefecto && !zonas.some(zona => zona.nombre === zonaPorDefecto)) {
    throw new ErrorDeConfiguracion('La zona por defecto ' + zonaPorDefecto + ' no existe');
  }
}

function validarColecciones(colecciones, zonas) {
  if (!colecciones || Object.keys(colecciones).length === 0) {
    throw new ErrorDeConfiguracion('Hay que configurar las colecciones');
  }

  for (const [nombre, opciones] of Object.entries(colecciones)) {
    if (opciones.geo && zonas.length === 0) {
      throw new ErrorDeConfiguracion('La coleccion ' + nombre + ' usa geolocalizacion pero no hay zonas configuradas');
    }
  }
}

module.exports = validarConfiguracion;
