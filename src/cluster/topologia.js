const Enrutador = require('../enrutamiento/enrutador');
const { ErrorDeOperacion } = require('../comun/errores');

// los shards y las zonas que tiene el cluster en este momento
class Topologia {
  constructor({ shards, zonas = [], zonaPorDefecto, nodosVirtuales }) {
    this.shards = shards.map(shard => shard.nombre);
    this.zonas = copiarZonas(zonas);
    this.zonaPorDefecto = zonaPorDefecto;
    this.nodosVirtuales = nodosVirtuales;
  }

  crearEnrutador() {
    return new Enrutador({
      shards: [...this.shards],
      zonas: copiarZonas(this.zonas),
      zonaPorDefecto: this.zonaPorDefecto,
      nodosVirtuales: this.nodosVirtuales
    });
  }

  validarQueSePuedeAgregar(nombre, nombreZona) {
    if (this.shards.includes(nombre)) {
      throw new ErrorDeOperacion('Ya existe un shard con el nombre ' + nombre);
    }
    if (nombreZona) {
      this.buscarZona(nombreZona);
    }
  }

  agregarShard(nombre, nombreZona) {
    this.validarQueSePuedeAgregar(nombre, nombreZona);

    this.shards.push(nombre);
    if (nombreZona) {
      this.buscarZona(nombreZona).shards.push(nombre);
    }
  }

  quitarShard(nombre) {
    this.validarQueSePuedeQuitar(nombre);

    this.shards = this.shards.filter(shard => shard !== nombre);
    for (const zona of this.zonas) {
      zona.shards = zona.shards.filter(shard => shard !== nombre);
    }
  }

  validarQueSePuedeQuitar(nombre) {
    if (!this.shards.includes(nombre)) {
      throw new ErrorDeOperacion('No existe el shard ' + nombre);
    }
    if (this.shards.length === 1) {
      throw new ErrorDeOperacion('No se puede quitar el ultimo shard');
    }

    const zonaQueQuedariaVacia = this.zonas.find(zona => zona.shards.length === 1 && zona.shards[0] === nombre);
    if (zonaQueQuedariaVacia) {
      throw new ErrorDeOperacion('No se puede quitar ' + nombre + ' porque es el unico shard de la zona ' + zonaQueQuedariaVacia.nombre);
    }
  }

  buscarZona(nombre) {
    const zona = this.zonas.find(z => z.nombre === nombre);
    if (!zona) {
      throw new ErrorDeOperacion('No existe la zona ' + nombre);
    }
    return zona;
  }
}

function copiarZonas(zonas) {
  return zonas.map(zona => ({ ...zona, shards: [...zona.shards] }));
}

module.exports = Topologia;
