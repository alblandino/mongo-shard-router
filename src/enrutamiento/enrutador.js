const AnilloHash = require('../hash/anillo-hash');
const Zonas = require('../geo/zonas');
const { valoresExactosDelFiltro, llaveATexto } = require('./filtros');
const { obtenerValor, sinRepetidos } = require('../comun/documentos');
const { ErrorDeEnrutamiento } = require('../comun/errores');

// decide en que shard va cada documento y a que shards hay que mandar cada consulta.
// sin geolocalizacion hay un solo anillo con todos los shards, con geolocalizacion hay un anillo por zona
class Enrutador {
  constructor({ shards, zonas = [], zonaPorDefecto, nodosVirtuales }) {
    this.shards = shards;
    this.anilloGeneral = new AnilloHash(shards, nodosVirtuales);
    this.zonas = new Zonas(zonas, zonaPorDefecto);
    this.anillosPorZona = crearAnillosPorZona(zonas, nodosVirtuales);
  }

  shardDeDocumento(configuracion, documento) {
    const llave = obtenerLlave(configuracion, documento);
    return this.anilloDelDocumento(configuracion, documento).obtenerShard(llave);
  }

  shardsDeFiltro(configuracion, filtro, zona) {
    const llaves = valoresExactosDelFiltro(filtro, configuracion.campoLlave);
    const anillos = this.anillosDelFiltro(configuracion, filtro, zona);

    if (!llaves) {
      return sinRepetidos(anillos.flatMap(anillo => anillo.shards));
    }
    return sinRepetidos(anillos.flatMap(anillo => llaves.map(llave => anillo.obtenerShard(llaveATexto(llave)))));
  }

  anilloDelDocumento(configuracion, documento) {
    if (!configuracion.usaGeolocalizacion()) {
      return this.anilloGeneral;
    }
    const zona = this.zonas.zonaDeDocumento(configuracion, documento);
    return this.anillosPorZona[zona];
  }

  anillosDelFiltro(configuracion, filtro, zona) {
    if (!configuracion.usaGeolocalizacion()) {
      return [this.anilloGeneral];
    }
    return this.zonasDelFiltro(configuracion, filtro, zona).map(nombre => this.anillosPorZona[nombre]);
  }

  zonasDelFiltro(configuracion, filtro, zona) {
    if (zona) {
      this.zonas.validarQueExiste(zona);
      return [zona];
    }
    return this.zonas.zonasDeFiltro(configuracion, filtro) || this.zonas.nombres();
  }
}

function obtenerLlave(configuracion, documento) {
  const valor = obtenerValor(documento, configuracion.campoLlave);
  if (valor === undefined || valor === null) {
    throw new ErrorDeEnrutamiento('El documento no tiene el campo ' + configuracion.campoLlave);
  }
  return llaveATexto(valor);
}

function crearAnillosPorZona(zonas, nodosVirtuales) {
  const anillos = {};
  for (const zona of zonas) {
    anillos[zona.nombre] = new AnilloHash(zona.shards, nodosVirtuales);
  }
  return anillos;
}

module.exports = Enrutador;
