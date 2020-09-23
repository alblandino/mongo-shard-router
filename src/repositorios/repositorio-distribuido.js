const validarCambios = require('./validar-cambios');
const combinarResultados = require('./combinar-resultados');
const { asignarIdSiNoTiene } = require('../comun/documentos');
const { ErrorDeOperacion } = require('../comun/errores');

// repositorio de una coleccion repartida en varios shards.
// se puede usar directo con cluster.repositorio('nombre') o extenderlo para agregar consultas propias
class RepositorioDistribuido {
  constructor(cluster, nombreColeccion) {
    this.cluster = cluster;
    this.configuracion = cluster.configuracionDeColeccion(nombreColeccion);
  }

  async insertarUno(documento) {
    asignarIdSiNoTiene(documento);
    const shard = this.shardDeDocumento(documento);
    await this.repositorioDe(shard).insertarUno(documento);
    return { id: documento._id, shard };
  }

  async insertarVarios(documentos) {
    const documentosPorShard = this.agruparPorShard(documentos);
    const shards = Object.keys(documentosPorShard);

    await Promise.all(shards.map(shard => this.repositorioDe(shard).insertarVarios(documentosPorShard[shard])));
    return { insertados: documentos.length, shards };
  }

  // opciones: orden, saltar, limite y campos
  async buscar(filtro = {}, opciones = {}) {
    const shards = this.shardsPara(filtro);

    if (shards.length === 1) {
      return this.repositorioDe(shards[0]).buscar(filtro, opciones);
    }
    return this.buscarEnVariosShards(shards, filtro, opciones);
  }

  async buscarUno(filtro = {}, opciones = {}) {
    const documentos = await this.buscar(filtro, { ...opciones, limite: 1 });
    return documentos[0] || null;
  }

  buscarPorId(id) {
    return this.buscarUno({ _id: id });
  }

  async contar(filtro = {}) {
    const cantidades = await this.ejecutarEnShards(filtro, repositorio => repositorio.contar(filtro));
    return sumar(cantidades);
  }

  async actualizarUno(filtro, cambios, opciones = {}) {
    validarCambios(cambios, this.configuracion.camposQueDecidenElShard());

    const actualizado = await this.actualizarEnElPrimeroQueCoincida(filtro, cambios);
    if (actualizado) {
      return actualizado;
    }
    if (opciones.upsert) {
      return this.insertarConUpsert(filtro, cambios);
    }
    return { encontrados: 0, modificados: 0, shard: null };
  }

  async actualizarVarios(filtro, cambios) {
    validarCambios(cambios, this.configuracion.camposQueDecidenElShard());

    const resultados = await this.ejecutarEnShards(filtro, repositorio => repositorio.actualizarVarios(filtro, cambios));
    return {
      encontrados: sumar(resultados.map(resultado => resultado.encontrados)),
      modificados: sumar(resultados.map(resultado => resultado.modificados))
    };
  }

  async eliminarUno(filtro) {
    for (const shard of this.shardsPara(filtro)) {
      const eliminados = await this.repositorioDe(shard).eliminarUno(filtro);
      if (eliminados > 0) {
        return { eliminados, shard };
      }
    }
    return { eliminados: 0, shard: null };
  }

  async eliminarVarios(filtro) {
    const eliminados = await this.ejecutarEnShards(filtro, repositorio => repositorio.eliminarVarios(filtro));
    return { eliminados: sumar(eliminados) };
  }

  // a que shards se manda una consulta con este filtro
  shardsPara(filtro) {
    return this.cluster.shardsParaConsulta(this.configuracion, filtro || {});
  }

  // a cada shard se le piden saltar + limite documentos porque el corte se hace despues de juntarlos
  async buscarEnVariosShards(shards, filtro, opciones) {
    const saltar = opciones.saltar || 0;
    const limite = opciones.limite || 0;
    const opcionesPorShard = { ...opciones, saltar: 0, limite: limite ? saltar + limite : 0 };

    const resultados = await Promise.all(shards.map(shard => this.repositorioDe(shard).buscar(filtro, opcionesPorShard)));
    return combinarResultados(resultados, opciones, this.cluster.estaRebalanceando());
  }

  async actualizarEnElPrimeroQueCoincida(filtro, cambios) {
    for (const shard of this.shardsPara(filtro)) {
      const resultado = await this.repositorioDe(shard).actualizarUno(filtro, cambios);
      if (resultado.encontrados > 0) {
        return { encontrados: resultado.encontrados, modificados: resultado.modificados, shard };
      }
    }
    return null;
  }

  async insertarConUpsert(filtro, cambios) {
    const shard = this.shardDestinoDelFiltro(filtro);
    const resultado = await this.repositorioDe(shard).actualizarUno(filtro, cambios, { upsert: true });
    return { encontrados: 0, modificados: 0, idInsertado: resultado.idInsertado, shard };
  }

  shardDestinoDelFiltro(filtro) {
    const shards = this.cluster.shardsDeFiltro(this.configuracion, filtro);
    if (shards.length !== 1) {
      throw new ErrorDeOperacion('Para hacer upsert el filtro tiene que tener la llave del shard');
    }
    return shards[0];
  }

  agruparPorShard(documentos) {
    const documentosPorShard = {};
    for (const documento of documentos) {
      asignarIdSiNoTiene(documento);
      const shard = this.shardDeDocumento(documento);
      documentosPorShard[shard] = documentosPorShard[shard] || [];
      documentosPorShard[shard].push(documento);
    }
    return documentosPorShard;
  }

  ejecutarEnShards(filtro, operacion) {
    const shards = this.shardsPara(filtro);
    return Promise.all(shards.map(shard => operacion(this.repositorioDe(shard))));
  }

  shardDeDocumento(documento) {
    return this.cluster.shardDeDocumento(this.configuracion, documento);
  }

  repositorioDe(shard) {
    return this.cluster.repositorioShard(shard, this.configuracion.nombre);
  }
}

function sumar(numeros) {
  return numeros.reduce((total, numero) => total + numero, 0);
}

module.exports = RepositorioDistribuido;
