const { MongoClient } = require('mongodb');
const { ErrorDeOperacion } = require('../comun/errores');

// sin estas opciones el driver 3.x avisa que el parser de uri y el motor de topologia viejos estan deprecados
const OPCIONES_DE_CONEXION = { useNewUrlParser: true, useUnifiedTopology: true };

// un cliente de mongo por cada shard
class Conexiones {
  constructor() {
    this.clientes = new Map();
    this.basesDeDatos = new Map();
  }

  async conectar(shard) {
    const cliente = new MongoClient(shard.uri, OPCIONES_DE_CONEXION);
    await cliente.connect();

    this.clientes.set(shard.nombre, cliente);
    this.basesDeDatos.set(shard.nombre, shard.baseDatos || shard.nombre);
  }

  baseDeDatos(nombreShard) {
    const cliente = this.clientes.get(nombreShard);
    if (!cliente) {
      throw new ErrorDeOperacion('El shard ' + nombreShard + ' no existe o no esta conectado');
    }
    return cliente.db(this.basesDeDatos.get(nombreShard));
  }

  existe(nombreShard) {
    return this.clientes.has(nombreShard);
  }

  nombres() {
    return [...this.clientes.keys()];
  }

  async desconectar(nombreShard) {
    await this.clientes.get(nombreShard).close();
    this.clientes.delete(nombreShard);
    this.basesDeDatos.delete(nombreShard);
  }

  async desconectarTodos() {
    for (const nombre of this.nombres()) {
      await this.desconectar(nombre);
    }
  }
}

module.exports = Conexiones;
