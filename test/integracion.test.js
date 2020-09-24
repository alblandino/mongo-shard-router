const assert = require('assert');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { crearCluster, RepositorioDistribuido, ErrorDeOperacion } = require('../src');

const TOTAL_PEDIDOS = 2000;

class RepositorioPedidos extends RepositorioDistribuido {
  constructor(cluster) {
    super(cluster, 'pedidos');
  }

  buscarPorCliente(clienteId) {
    return this.buscar({ clienteId });
  }
}

let servidores = [];
let uris = [];
let cluster;
let pedidos;
let usuarios;
const pedidosInsertados = [];

function crearPedidos() {
  for (let i = 0; i < TOTAL_PEDIDOS; i++) {
    pedidosInsertados.push({
      clienteId: 'c' + (i % 300),
      total: (i * 37) % 1000,
      numero: i
    });
  }
  return pedidosInsertados;
}

function pedidosDelCliente(clienteId) {
  return pedidosInsertados.filter(pedido => pedido.clienteId === clienteId).length;
}

function enShard(shard, nombreColeccion = 'pedidos') {
  return cluster.repositorioShard(shard, nombreColeccion);
}

// revisa que cada documento este en el shard que dice el enrutador y devuelve cuantos hay
async function revisarUbicacion(repositorio) {
  let total = 0;
  for (const shard of cluster.nombresDeShards()) {
    const documentos = await enShard(shard, repositorio.configuracion.nombre).buscar({});
    total += documentos.length;
    for (const documento of documentos) {
      assert.strictEqual(cluster.shardDeDocumento(repositorio.configuracion, documento), shard);
    }
  }
  return total;
}

describe('mongo-shard-router', function () {
  before(async function () {
    // si mongodb no se descargo en el npm install se descarga aqui y tarda bastante
    this.timeout(300000);

    servidores = await Promise.all([1, 2, 3].map(() => MongoMemoryServer.create()));
    uris = await Promise.all(servidores.map(servidor => servidor.getUri()));

    cluster = await crearCluster({
      shards: [
        { nombre: 'shard-1', uri: uris[0], baseDatos: 'tienda' },
        { nombre: 'shard-2', uri: uris[1], baseDatos: 'tienda' },
        { nombre: 'shard-3', uri: uris[2], baseDatos: 'tienda' }
      ],
      colecciones: {
        pedidos: { llave: 'clienteId' },
        usuarios: { llave: 'correo' }
      }
    });

    pedidos = new RepositorioPedidos(cluster);
    usuarios = cluster.repositorio('usuarios');
    await pedidos.insertarVarios(crearPedidos());
  });

  after(async function () {
    if (cluster) await cluster.cerrar();
    await Promise.all(servidores.map(servidor => servidor.stop()));
  });

  it('cada pedido queda en el shard que le toca', async () => {
    assert.strictEqual(await revisarUbicacion(pedidos), TOTAL_PEDIDOS);
  });

  it('el repositorio propio busca por cliente en un solo shard', async () => {
    assert.strictEqual(pedidos.shardsPara({ clienteId: 'c7' }).length, 1);
    assert.strictEqual(pedidos.shardsPara({ total: 10 }).length, 3);

    const encontrados = await pedidos.buscarPorCliente('c7');
    assert.strictEqual(encontrados.length, pedidosDelCliente('c7'));
  });

  it('buscar en todos los shards con orden, saltar y limite', async () => {
    const filtro = { total: { $gte: 500 } };
    assert.strictEqual(pedidos.shardsPara(filtro).length, 3);

    const encontrados = await pedidos.buscar(filtro, { orden: { total: -1, numero: 1 }, saltar: 10, limite: 25 });
    const esperados = pedidosInsertados
      .filter(pedido => pedido.total >= 500)
      .sort((a, b) => (b.total - a.total) || (a.numero - b.numero))
      .slice(10, 35);

    assert.deepStrictEqual(encontrados.map(pedido => pedido.numero), esperados.map(pedido => pedido.numero));
  });

  it('buscar por id', async () => {
    const pedido = pedidosInsertados[5];
    const encontrado = await pedidos.buscarPorId(pedido._id);
    assert.strictEqual(encontrado.numero, pedido.numero);
  });

  it('contar', async () => {
    assert.strictEqual(await pedidos.contar(), TOTAL_PEDIDOS);
    assert.strictEqual(await pedidos.contar({ clienteId: 'c7' }), pedidosDelCliente('c7'));
  });

  it('actualizar', async () => {
    const resultado = await pedidos.actualizarVarios({ clienteId: 'c1' }, { $inc: { total: 1 } });
    assert.strictEqual(resultado.encontrados, pedidosDelCliente('c1'));

    await assert.rejects(pedidos.actualizarUno({ clienteId: 'c1' }, { $set: { clienteId: 'otro' } }), ErrorDeOperacion);
    await assert.rejects(pedidos.actualizarUno({ clienteId: 'c1' }, { $set: { 'clienteId.x': 1 } }), /No se puede cambiar/);
    await assert.rejects(pedidos.actualizarUno({ clienteId: 'c1' }, { total: 1 }), /operadores/);
  });

  it('upsert', async () => {
    await assert.rejects(pedidos.actualizarUno({ total: 999999 }, { $set: { x: 1 } }, { upsert: true }), /upsert/);

    const resultado = await pedidos.actualizarUno({ clienteId: 'nuevo' }, { $set: { total: 5 } }, { upsert: true });
    assert.ok(resultado.idInsertado);
    assert.strictEqual(resultado.shard, cluster.shardDeDocumento(pedidos.configuracion, { clienteId: 'nuevo' }));

    const eliminado = await pedidos.eliminarUno({ clienteId: 'nuevo' });
    assert.strictEqual(eliminado.eliminados, 1);
  });

  it('agregar un shard y rebalancear', async () => {
    await cluster.agregarShard({ nombre: 'shard-4', uri: uris[0], baseDatos: 'tienda4' });
    assert.strictEqual(cluster.estaRebalanceando(), true);
    await assert.rejects(cluster.agregarShard({ nombre: 'shard-5', uri: uris[0] }), /rebalanceo pendiente/);

    // un cliente que ahora le toca al shard nuevo: sus pedidos siguen en el viejo pero se tienen que encontrar
    const movido = pedidosInsertados.find(pedido => cluster.shardDeDocumento(pedidos.configuracion, pedido) === 'shard-4');
    assert.strictEqual(await enShard('shard-4').contar({ clienteId: movido.clienteId }), 0);
    assert.strictEqual((await pedidos.buscarPorCliente(movido.clienteId)).length, pedidosDelCliente(movido.clienteId));

    const movidos = await cluster.rebalancear(100);
    assert.ok(movidos.pedidos > 0);
    assert.strictEqual(cluster.estaRebalanceando(), false);

    assert.strictEqual(await revisarUbicacion(pedidos), TOTAL_PEDIDOS);
    assert.ok(await enShard('shard-4').contar() > 0);
    assert.strictEqual((await pedidos.buscarPorCliente(movido.clienteId)).length, pedidosDelCliente(movido.clienteId));
  });

  it('quitar un shard', async () => {
    await cluster.quitarShard('shard-2');
    await cluster.rebalancear();

    assert.ok(!cluster.nombresDeShards().includes('shard-2'));
    assert.strictEqual(await revisarUbicacion(pedidos), TOTAL_PEDIDOS);
    assert.strictEqual(await pedidos.contar(), TOTAL_PEDIDOS);

    await assert.rejects(cluster.quitarShard('shard-2'), /No existe el shard/);
  });

  it('otra coleccion se reparte entre todos', async () => {
    const lista = [];
    for (let i = 0; i < 3000; i++) lista.push({ correo: 'usuario' + i + '@correo.com' });
    await usuarios.insertarVarios(lista);

    const shards = cluster.nombresDeShards();
    for (const shard of shards) {
      const cantidad = await enShard(shard, 'usuarios').contar();
      assert.ok(cantidad > 3000 / shards.length * 0.7, shard + ' tiene muy pocos: ' + cantidad);
    }

    assert.strictEqual(usuarios.shardsPara({ correo: 'usuario77@correo.com' }).length, 1);
    assert.ok(await usuarios.buscarUno({ correo: 'usuario77@correo.com' }));
  });
});
