const AnilloHash = require('../hash/anillo-hash');
const { valoresExactosDelFiltro, llaveATexto } = require('./filtros');
const { obtenerValor, sinRepetidos } = require('../comun/documentos');
const { ErrorDeEnrutamiento } = require('../comun/errores');

// decide en que shard va cada documento y a que shards hay que mandar cada consulta
class Enrutador {
  constructor({ shards, nodosVirtuales }) {
    this.shards = shards;
    this.anillo = new AnilloHash(shards, nodosVirtuales);
  }

  shardDeDocumento(configuracion, documento) {
    return this.anillo.obtenerShard(obtenerLlave(configuracion, documento));
  }

  // si el filtro no tiene la llave la consulta tiene que ir a todos los shards
  shardsDeFiltro(configuracion, filtro) {
    const llaves = valoresExactosDelFiltro(filtro, configuracion.campoLlave);

    if (!llaves) {
      return [...this.shards];
    }
    return sinRepetidos(llaves.map(llave => this.anillo.obtenerShard(llaveATexto(llave))));
  }
}

function obtenerLlave(configuracion, documento) {
  const valor = obtenerValor(documento, configuracion.campoLlave);
  if (valor === undefined || valor === null) {
    throw new ErrorDeEnrutamiento('El documento no tiene el campo ' + configuracion.campoLlave);
  }
  return llaveATexto(valor);
}

module.exports = Enrutador;
