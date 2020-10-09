const validarConfiguracion = require('../configuracion/validar-configuracion');
const ConfiguracionColeccion = require('../configuracion/configuracion-coleccion');
const RepositorioDistribuido = require('../repositorios/repositorio-distribuido');
const RepositorioShard = require('../repositorios/repositorio-shard');
const Conexiones = require('./conexiones');
const Topologia = require('./topologia');
const Rebalanceador = require('./rebalanceador');
const { ErrorDeConfiguracion, ErrorDeOperacion } = require('../comun/errores');

class Cluster {
  constructor(configuracion) {
    validarConfiguracion(configuracion);

    this.shardsIniciales = configuracion.shards;
    this.colecciones = crearConfiguracionesDeColecciones(configuracion.colecciones);
    this.topologia = new Topologia(configuracion);
    this.enrutador = this.topologia.crearEnrutador();
    this.conexiones = new Conexiones();
    this.rebalanceador = new Rebalanceador(this);
    this.repositorios = new Map();
    this.shardsPorQuitar = [];
    this.rebalanceoPendiente = false;
  }

  async conectar() {
    for (const shard of this.shardsIniciales) {
      await this.conexiones.conectar(shard);
    }
  }

  async cerrar() {
    await this.conexiones.desconectarTodos();
  }

  repositorio(nombreColeccion) {
    if (!this.repositorios.has(nombreColeccion)) {
      this.repositorios.set(nombreColeccion, new RepositorioDistribuido(this, nombreColeccion));
    }
    return this.repositorios.get(nombreColeccion);
  }

  repositorioShard(nombreShard, nombreColeccion) {
    return new RepositorioShard(this.conexiones.baseDeDatos(nombreShard), nombreColeccion);
  }

  configuracionDeColeccion(nombre) {
    const configuracion = this.colecciones.get(nombre);
    if (!configuracion) {
      throw new ErrorDeConfiguracion('La coleccion ' + nombre + ' no esta configurada');
    }
    return configuracion;
  }

  nombresDeShards() {
    return [...this.enrutador.shards];
  }

  estaRebalanceando() {
    return this.rebalanceoPendiente;
  }

  shardDeDocumento(configuracion, documento) {
    return this.enrutador.shardDeDocumento(configuracion, documento);
  }

  shardsDeFiltro(configuracion, filtro, zona) {
    return this.enrutador.shardsDeFiltro(configuracion, filtro, zona);
  }

  // con un rebalanceo pendiente un documento puede estar todavia en su shard viejo,
  // por eso se le pregunta a todos
  shardsParaConsulta(configuracion, filtro, zona) {
    if (this.rebalanceoPendiente) {
      return this.conexiones.nombres();
    }
    return this.shardsDeFiltro(configuracion, filtro, zona);
  }

  async agregarShard(shard, nombreZona) {
    this.validarQueNoHayRebalanceoPendiente();
    this.topologia.validarQueSePuedeAgregar(shard.nombre, nombreZona);

    await this.conexiones.conectar(shard);
    this.topologia.agregarShard(shard.nombre, nombreZona);
    this.cambiarEnrutador();
  }

  // el shard se sigue usando hasta que rebalancear() le saca todos los documentos
  async quitarShard(nombre) {
    this.validarQueNoHayRebalanceoPendiente();

    this.topologia.quitarShard(nombre);
    this.shardsPorQuitar.push(nombre);
    this.cambiarEnrutador();
  }

  async rebalancear(tamanoLote) {
    const configuraciones = [...this.colecciones.values()];
    const movidos = await this.rebalanceador.rebalancear(configuraciones, this.conexiones.nombres(), tamanoLote);

    await this.desconectarShardsQuitados();
    this.rebalanceoPendiente = false;
    return movidos;
  }

  cambiarEnrutador() {
    this.enrutador = this.topologia.crearEnrutador();
    this.rebalanceoPendiente = true;
  }

  async desconectarShardsQuitados() {
    for (const nombre of this.shardsPorQuitar) {
      await this.conexiones.desconectar(nombre);
    }
    this.shardsPorQuitar = [];
  }

  validarQueNoHayRebalanceoPendiente() {
    if (this.rebalanceoPendiente) {
      throw new ErrorDeOperacion('Hay un rebalanceo pendiente, primero hay que llamar a rebalancear()');
    }
  }
}

function crearConfiguracionesDeColecciones(colecciones) {
  const configuraciones = new Map();
  for (const [nombre, opciones] of Object.entries(colecciones)) {
    configuraciones.set(nombre, new ConfiguracionColeccion(nombre, opciones));
  }
  return configuraciones;
}

async function crearCluster(configuracion) {
  const cluster = new Cluster(configuracion);
  await cluster.conectar();
  return cluster;
}

module.exports = { Cluster, crearCluster };
