const { obtenerValor, quitarRepetidosPorId } = require('../comun/documentos');

// junta lo que devolvio cada shard y aplica el orden, saltar y limite sobre el total
function combinarResultados(resultadosPorShard, opciones, quitarRepetidos) {
  let documentos = resultadosPorShard.flat();

  if (quitarRepetidos) {
    documentos = quitarRepetidosPorId(documentos);
  }
  if (opciones.orden) {
    documentos.sort(crearComparador(opciones.orden));
  }
  return paginar(documentos, opciones.saltar || 0, opciones.limite || 0);
}

function paginar(documentos, saltar, limite) {
  const fin = limite ? saltar + limite : undefined;
  return documentos.slice(saltar, fin);
}

// el orden es igual al sort de mongo: { campo: 1, otroCampo: -1 }
function crearComparador(orden) {
  const campos = Object.keys(orden);

  return (a, b) => {
    for (const campo of campos) {
      const resultado = compararValores(obtenerValor(a, campo), obtenerValor(b, campo));
      if (resultado !== 0) {
        return orden[campo] === -1 ? -resultado : resultado;
      }
    }
    return 0;
  };
}

function compararValores(a, b) {
  const valorA = normalizar(a);
  const valorB = normalizar(b);

  if (valorA === valorB) return 0;
  if (valorA === null) return -1;
  if (valorB === null) return 1;
  return valorA < valorB ? -1 : 1;
}

// lo que no existe cuenta como null, las fechas por milisegundos y los ObjectId por su texto
function normalizar(valor) {
  if (valor === undefined || valor === null) return null;
  if (valor instanceof Date) return valor.getTime();
  if (typeof valor.toHexString === 'function') return valor.toHexString();
  return valor;
}

module.exports = combinarResultados;
