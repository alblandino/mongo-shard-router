const { ObjectId } = require('mongodb');

// tambien sirve para campos anidados como 'direccion.pais'
function obtenerValor(objeto, campo) {
  if (objeto[campo] !== undefined) {
    return objeto[campo];
  }
  return campo.split('.').reduce((actual, parte) => (actual ? actual[parte] : undefined), objeto);
}

function asignarIdSiNoTiene(documento) {
  if (!documento._id) {
    documento._id = new ObjectId();
  }
}

function quitarRepetidosPorId(documentos) {
  const idsVistos = new Set();
  return documentos.filter(documento => {
    const id = String(documento._id);
    if (idsVistos.has(id)) {
      return false;
    }
    idsVistos.add(id);
    return true;
  });
}

function sinRepetidos(lista) {
  return [...new Set(lista)];
}

module.exports = { obtenerValor, asignarIdSiNoTiene, quitarRepetidosPorId, sinRepetidos };
