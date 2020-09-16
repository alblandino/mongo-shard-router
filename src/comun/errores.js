class ErrorDeConfiguracion extends Error {
  constructor(mensaje) {
    super(mensaje);
    this.name = 'ErrorDeConfiguracion';
  }
}

class ErrorDeEnrutamiento extends Error {
  constructor(mensaje) {
    super(mensaje);
    this.name = 'ErrorDeEnrutamiento';
  }
}

class ErrorDeOperacion extends Error {
  constructor(mensaje) {
    super(mensaje);
    this.name = 'ErrorDeOperacion';
  }
}

module.exports = { ErrorDeConfiguracion, ErrorDeEnrutamiento, ErrorDeOperacion };
