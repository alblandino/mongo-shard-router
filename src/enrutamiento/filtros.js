const { ObjectId } = require('mongodb');
const { obtenerValor } = require('../comun/documentos');

// { pais: 'DO' } -> ['DO']
// { pais: { $in: ['DO', 'MX'] } } -> ['DO', 'MX']
// devuelve null si el filtro no busca valores exactos en ese campo
function valoresExactosDelFiltro(filtro, campo) {
  const valor = obtenerValor(filtro, campo);

  if (valor === undefined || valor === null) {
    return null;
  }
  if (esValorSimple(valor)) {
    return [valor];
  }
  if (valor.$eq !== undefined) {
    return [valor.$eq];
  }
  if (Array.isArray(valor.$in)) {
    return valor.$in;
  }
  return null;
}

function esValorSimple(valor) {
  return typeof valor === 'string' || typeof valor === 'number' || valor instanceof ObjectId;
}

function llaveATexto(valor) {
  if (valor instanceof Date) {
    return valor.toISOString();
  }
  return String(valor);
}

module.exports = { valoresExactosDelFiltro, llaveATexto };
