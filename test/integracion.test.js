const assert = require('assert');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { crearCluster, RepositorioDistribuido, ErrorDeOperacion } = require('../src');

const PAISES = ['DO', 'US', 'MX', 'CL', 'ES', 'FR', 'DE'];
const PAISES_EUROPA = ['ES', 'FR', 'DE'];
const TOTAL_PEDIDOS = 2000;

class RepositorioPedidos extends RepositorioDistribuido {
  constructor(cluster) {
    super(cluster, 'pedidos');
  }

  buscarPorCliente(clienteId, pais) {
    return this.buscar({ clienteId, pais });
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
      pais: PAISES[i % PAISES.length],
      total: (i * 37) % 1000,
      numero: i
    });
  }
  return pedidosInsertados;
}

function pedidosDeEuropa() {
  return pedidosInsertados.filter(pedido => PAISES_EUROPA.includes(pedido.pais)).length;
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
        { nombre: 'america-1', uri: uris[0], baseDatos: 'tienda' },
        { nombre: 'america-2', uri: uris[1], baseDatos: 'tienda' },
        { nombre: 'europa-1', uri: uris[2], baseDatos: 'tienda' }
      ],
      zonas: [
        { nombre: 'america', shards: ['america-1', 'america-2'], paises: ['DO', 'US', 'MX', 'CL'], centro: { lat: 18.48, lng: -69.93 } },
        { nombre: 'europa', shards: ['europa-1'], paises: PAISES_EUROPA, centro: { lat: 40.41, lng: -3.70 } }
      ],
      zonaPorDefecto: 'america',
      colecciones: {
        pedidos: { llave: 'clienteId', geo: { pais: 'pais', ubicacion: 'ubicacion' } },
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

  it('cada pedido queda en su shard y los de europa en europa-1', async () => {
    assert.strictEqual(await revisarUbicacion(pedidos), TOTAL_PEDIDOS);
    assert.strictEqual(await enShard('europa-1').contar(), pedidosDeEuropa());
  });

  it('por pais va a la zona y sin pais por coordenadas', async () => {
    const roma = await pedidos.insertarUno({ clienteId: 'giulia', ubicacion: { type: 'Point', coordinates: [12.49, 41.89] } });
    assert.strictEqual(roma.shard, 'europa-1');

    const santiago = await pedidos.insertarUno({ clienteId: 'pedro', ubicacion: [-70.66, -33.45] });
    assert.ok(santiago.shard.startsWith('america'));

    const conPais = await pedidos.insertarUno({ clienteId: 'luis', pais: 'MX', ubicacion: [12.49, 41.89] });
    assert.ok(conPais.shard.startsWith('america'), 'el pais tiene que mandar sobre las coordenadas');

    for (const clienteId of ['giulia', 'pedro', 'luis']) {
      await pedidos.eliminarUno({ clienteId });
    }
  });

  it('el repositorio propio busca por cliente en un solo shard', async () => {
    assert.strictEqual(pedidos.shardsPara({ clienteId: 'c7', pais: 'CL' }).length, 1);
    assert.deepStrictEqual(pedidos.shardsPara({ pais: 'ES' }), ['europa-1']);
    assert.strictEqual(pedidos.shardsPara({ clienteId: 'c7' }).length, 2);

    const encontrados = await pedidos.buscarPorCliente('c7', 'CL');
    const esperados = pedidosInsertados.filter(pedido => pedido.clienteId === 'c7' && pedido.pais === 'CL');
    assert.strictEqual(encontrados.length, esperados.length);
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
    assert.strictEqual(await pedidos.contar({ pais: 'ES' }), pedidosInsertados.filter(pedido => pedido.pais === 'ES').length);
    assert.strictEqual(await pedidos.contar({}, { zona: 'europa' }), pedidosDeEuropa());
  });

  it('actualizar', async () => {
    const resultado = await pedidos.actualizarVarios({ clienteId: 'c1' }, { $inc: { total: 1 } });
    assert.strictEqual(resultado.encontrados, pedidosInsertados.filter(pedido => pedido.clienteId === 'c1').length);

    await assert.rejects(pedidos.actualizarUno({ clienteId: 'c1' }, { $set: { clienteId: 'otro' } }), ErrorDeOperacion);
    await assert.rejects(pedidos.actualizarUno({ clienteId: 'c1' }, { $set: { pais: 'ES' } }), /No se puede cambiar/);
    await assert.rejects(pedidos.actualizarUno({ clienteId: 'c1' }, { total: 1 }), /operadores/);
  });

  it('upsert', async () => {
    await assert.rejects(pedidos.actualizarUno({ total: 999999 }, { $set: { x: 1 } }, { upsert: true }), /upsert/);

    const resultado = await pedidos.actualizarUno({ clienteId: 'nuevo', pais: 'FR' }, { $set: { total: 5 } }, { upsert: true });
    assert.ok(resultado.idInsertado);
    assert.strictEqual(resultado.shard, 'europa-1');

    const eliminado = await pedidos.eliminarUno({ clienteId: 'nuevo', pais: 'FR' });
    assert.strictEqual(eliminado.eliminados, 1);
  });

  it('agregar un shard y rebalancear', async () => {
    await cluster.agregarShard({ nombre: 'america-3', uri: uris[0], baseDatos: 'tienda3' }, 'america');
    assert.strictEqual(cluster.estaRebalanceando(), true);
    await assert.rejects(cluster.agregarShard({ nombre: 'america-4', uri: uris[0] }), /rebalanceo pendiente/);

    // un cliente que ahora le toca al shard nuevo: sus pedidos siguen en el viejo pero se tienen que encontrar
    const movido = pedidosInsertados.find(pedido => cluster.shardDeDocumento(pedidos.configuracion, pedido) === 'america-3');
    const esperados = pedidosInsertados.filter(pedido => pedido.clienteId === movido.clienteId && pedido.pais === movido.pais);
    assert.strictEqual(await enShard('america-3').contar({ clienteId: movido.clienteId }), 0);
    assert.strictEqual((await pedidos.buscarPorCliente(movido.clienteId, movido.pais)).length, esperados.length);

    const movidos = await cluster.rebalancear(100);
    assert.ok(movidos.pedidos > 0);
    assert.strictEqual(cluster.estaRebalanceando(), false);

    assert.strictEqual(await revisarUbicacion(pedidos), TOTAL_PEDIDOS);
    assert.ok(await enShard('america-3').contar() > 0);
    assert.strictEqual(await enShard('europa-1').contar(), pedidosDeEuropa());
    assert.strictEqual((await pedidos.buscarPorCliente(movido.clienteId, movido.pais)).length, esperados.length);
  });

  it('quitar un shard', async () => {
    await cluster.quitarShard('america-2');
    await cluster.rebalancear();

    assert.ok(!cluster.nombresDeShards().includes('america-2'));
    assert.strictEqual(await revisarUbicacion(pedidos), TOTAL_PEDIDOS);
    assert.strictEqual(await pedidos.contar(), TOTAL_PEDIDOS);

    await assert.rejects(cluster.quitarShard('europa-1'), /unico shard de la zona/);
  });

  it('coleccion solo por hash se reparte entre todos', async () => {
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
