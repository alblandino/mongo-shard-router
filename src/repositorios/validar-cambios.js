const { ErrorDeOperacion } = require('../comun/errores');

function validarCambios(cambios, camposProtegidos) {
  for (const operador of Object.keys(cambios)) {
    validarOperador(operador);

    const campoProtegido = buscarCampoProtegido(Object.keys(cambios[operador]), camposProtegidos);
    if (campoProtegido) {
      throw new ErrorDeOperacion('No se puede cambiar el campo ' + campoProtegido + ' porque decide en que shard va el documento');
    }
  }
}

function validarOperador(operador) {
  if (!operador.startsWith('$')) {
    throw new ErrorDeOperacion('Los cambios tienen que usar operadores como $set o $inc');
  }
}

function buscarCampoProtegido(campos, camposProtegidos) {
  return camposProtegidos.find(protegido =>
    campos.some(campo => campo === protegido || campo.startsWith(protegido + '.'))
  );
}

module.exports = validarCambios;
