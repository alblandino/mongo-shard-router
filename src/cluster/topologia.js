const Enrutador = require('../enrutamiento/enrutador');
const { ErrorDeOperacion } = require('../comun/errores');

// los shards que tiene el cluster en este momento
class Topologia {
  constructor({ shards, nodosVirtuales }) {
    this.shards = shards.map(shard => shard.nombre);
    this.nodosVirtuales = nodosVirtuales;
  }

  crearEnrutador() {
    return new Enrutador({
      shards: [...this.shards],
      nodosVirtuales: this.nodosVirtuales
    });
  }

  validarQueSePuedeAgregar(nombre) {
    if (this.shards.includes(nombre)) {
      throw new ErrorDeOperacion('Ya existe un shard con el nombre ' + nombre);
    }
  }

  agregarShard(nombre) {
    this.validarQueSePuedeAgregar(nombre);
    this.shards.push(nombre);
  }

  quitarShard(nombre) {
    this.validarQueSePuedeQuitar(nombre);
    this.shards = this.shards.filter(shard => shard !== nombre);
  }

  validarQueSePuedeQuitar(nombre) {
    if (!this.shards.includes(nombre)) {
      throw new ErrorDeOperacion('No existe el shard ' + nombre);
    }
    if (this.shards.length === 1) {
      throw new ErrorDeOperacion('No se puede quitar el ultimo shard');
    }
  }
}

module.exports = Topologia;
