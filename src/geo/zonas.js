const { distanciaKm, leerPunto } = require('./coordenadas');
const { obtenerValor, sinRepetidos } = require('../comun/documentos');
const { valoresExactosDelFiltro } = require('../enrutamiento/filtros');
const { ErrorDeEnrutamiento } = require('../comun/errores');

class Zonas {
  constructor(zonas = [], zonaPorDefecto = null) {
    this.zonas = zonas;
    this.zonaPorDefecto = zonaPorDefecto;
    this.zonaPorPais = indexarZonasPorPais(zonas);
  }

  nombres() {
    return this.zonas.map(zona => zona.nombre);
  }

  validarQueExiste(nombre) {
    if (!this.zonas.some(zona => zona.nombre === nombre)) {
      throw new ErrorDeEnrutamiento('No existe la zona ' + nombre);
    }
  }

  // primero por pais, despues por coordenadas y por ultimo la zona por defecto
  zonaDeDocumento(configuracion, documento) {
    const zona = this.zonaPorPaisDelDocumento(configuracion, documento) ||
      this.zonaPorUbicacionDelDocumento(configuracion, documento) ||
      this.zonaPorDefecto;

    if (!zona) {
      throw new ErrorDeEnrutamiento('No se pudo saber la zona del documento y no hay zona por defecto');
    }
    return zona;
  }

  // devuelve null cuando los documentos pueden estar en cualquier zona: si el filtro no tiene pais
  // o tiene uno que no esta en ninguna zona (esos documentos se ubicaron por coordenadas)
  zonasDeFiltro(configuracion, filtro) {
    if (!configuracion.campoPais) {
      return null;
    }

    const paises = valoresExactosDelFiltro(filtro, configuracion.campoPais);
    if (!paises) {
      return null;
    }

    const zonas = paises.map(pais => this.zonaDelPais(pais));
    if (zonas.includes(null)) {
      return null;
    }
    return sinRepetidos(zonas);
  }

  zonaPorPaisDelDocumento(configuracion, documento) {
    if (!configuracion.campoPais) {
      return null;
    }
    return this.zonaDelPais(obtenerValor(documento, configuracion.campoPais));
  }

  zonaPorUbicacionDelDocumento(configuracion, documento) {
    if (!configuracion.campoUbicacion) {
      return null;
    }
    const punto = leerPunto(obtenerValor(documento, configuracion.campoUbicacion));
    return punto ? this.zonaMasCercana(punto) : null;
  }

  zonaDelPais(pais) {
    if (!pais) {
      return null;
    }
    return this.zonaPorPais[String(pais).toUpperCase()] || null;
  }

  zonaMasCercana(punto) {
    let zonaMasCercana = null;
    let menorDistancia = Infinity;

    for (const zona of this.zonas.filter(z => z.centro)) {
      const distancia = distanciaKm(punto, zona.centro);
      if (distancia < menorDistancia) {
        menorDistancia = distancia;
        zonaMasCercana = zona.nombre;
      }
    }

    return zonaMasCercana;
  }
}

function indexarZonasPorPais(zonas) {
  const zonaPorPais = {};
  for (const zona of zonas) {
    for (const pais of zona.paises || []) {
      zonaPorPais[pais.toUpperCase()] = zona.nombre;
    }
  }
  return zonaPorPais;
}

module.exports = Zonas;
