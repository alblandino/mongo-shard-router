const TAMANO_LOTE_POR_DEFECTO = 500;

// mueve los documentos que quedaron en un shard que ya no les corresponde
class Rebalanceador {
  constructor(cluster) {
    this.cluster = cluster;
  }

  async rebalancear(configuraciones, shards, tamanoLote = TAMANO_LOTE_POR_DEFECTO) {
    const movidosPorColeccion = {};
    for (const configuracion of configuraciones) {
      movidosPorColeccion[configuracion.nombre] = await this.rebalancearColeccion(configuracion, shards, tamanoLote);
    }
    return movidosPorColeccion;
  }

  async rebalancearColeccion(configuracion, shards, tamanoLote) {
    let movidos = 0;
    for (const shard of shards) {
      movidos += await this.rebalancearShard(configuracion, shard, tamanoLote);
    }
    return movidos;
  }

  async rebalancearShard(configuracion, shardOrigen, tamanoLote) {
    const repositorioOrigen = this.cluster.repositorioShard(shardOrigen, configuracion.nombre);
    let lote = [];
    let movidos = 0;

    for await (const documento of repositorioOrigen.recorrerTodos()) {
      const shardDestino = this.cluster.shardDeDocumento(configuracion, documento);
      if (shardDestino !== shardOrigen) {
        lote.push({ documento, shardDestino });
      }

      if (lote.length >= tamanoLote) {
        movidos += await this.moverLote(configuracion, repositorioOrigen, lote);
        lote = [];
      }
    }

    if (lote.length > 0) {
      movidos += await this.moverLote(configuracion, repositorioOrigen, lote);
    }
    return movidos;
  }

  // primero se copia al destino y despues se borra del origen,
  // asi si algo falla a la mitad el documento queda repetido pero no se pierde
  async moverLote(configuracion, repositorioOrigen, lote) {
    for (const { documento, shardDestino } of lote) {
      await this.cluster.repositorioShard(shardDestino, configuracion.nombre).guardar(documento);
    }

    await repositorioOrigen.eliminarPorIds(lote.map(({ documento }) => documento._id));
    return lote.length;
  }
}

module.exports = Rebalanceador;
