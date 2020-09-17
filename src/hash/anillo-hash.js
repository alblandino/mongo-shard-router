const calcularHash = require('./calcular-hash');

const NODOS_VIRTUALES_POR_DEFECTO = 500;

class AnilloHash {
  constructor(shards, nodosVirtuales = NODOS_VIRTUALES_POR_DEFECTO) {
    this.shards = shards;
    this.puntos = crearPuntos(shards, nodosVirtuales);
  }

  obtenerShard(llave) {
    const indice = this.buscarPrimerPuntoDesde(calcularHash(llave));
    return this.puntos[indice].shard;
  }

  // busqueda binaria del primer punto con posicion mayor o igual,
  // si no hay ninguno se le da la vuelta al anillo y se usa el primero
  buscarPrimerPuntoDesde(posicion) {
    let inicio = 0;
    let fin = this.puntos.length - 1;
    let encontrado = 0;

    while (inicio <= fin) {
      const medio = Math.floor((inicio + fin) / 2);
      if (this.puntos[medio].posicion >= posicion) {
        encontrado = medio;
        fin = medio - 1;
      } else {
        inicio = medio + 1;
      }
    }

    return encontrado;
  }
}

// cada shard se pone varias veces en el anillo para que los datos queden mejor repartidos
function crearPuntos(shards, nodosVirtuales) {
  const puntos = [];
  for (const shard of shards) {
    for (let i = 0; i < nodosVirtuales; i++) {
      puntos.push({ posicion: calcularHash(shard + '-' + i), shard: shard });
    }
  }
  return puntos.sort((a, b) => a.posicion - b.posicion);
}

module.exports = AnilloHash;
