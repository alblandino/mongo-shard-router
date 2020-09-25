const { MongoMemoryServer } = require('mongodb-memory-server');
const { crearCluster } = require('../src');
const RepositorioReservas = require('./repositorio-reservas');

const RESERVAS_DE_EJEMPLO = [
  { clienteId: 'ana', total: 120 },
  { clienteId: 'luis', total: 80 },
  { clienteId: 'marta', total: 200 },
  { clienteId: 'giulia', total: 50 },
  { clienteId: 'pedro', total: 10 }
];

function crearConfiguracion(uris) {
  return {
    shards: [
      { nombre: 'shard-1', uri: uris[0], baseDatos: 'app' },
      { nombre: 'shard-2', uri: uris[1], baseDatos: 'app' },
      { nombre: 'shard-3', uri: uris[2], baseDatos: 'app' }
    ],
    colecciones: {
      reservas: { llave: 'clienteId' },
      sesiones: { llave: 'usuarioId' }
    }
  };
}

async function mostrarDondeQuedaCadaReserva(reservas) {
  for (const reserva of RESERVAS_DE_EJEMPLO) {
    const resultado = await reservas.insertarUno(reserva);
    console.log(reserva.clienteId.padEnd(8), '->', resultado.shard);
  }
}

function mostrarAQueShardsVanLasConsultas(reservas) {
  console.log('{ clienteId: "ana" } va a', reservas.shardsPara({ clienteId: 'ana' }));
  console.log('{ clienteId: { $in: ["ana", "luis"] } } va a', reservas.shardsPara({ clienteId: { $in: ['ana', 'luis'] } }));
  console.log('{ total: { $gt: 100 } } va a', reservas.shardsPara({ total: { $gt: 100 } }));
}

async function ejecutar() {
  const servidores = await Promise.all([1, 2, 3].map(() => MongoMemoryServer.create()));
  const uris = await Promise.all(servidores.map(servidor => servidor.getUri()));
  const cluster = await crearCluster(crearConfiguracion(uris));
  const reservas = new RepositorioReservas(cluster);

  await mostrarDondeQuedaCadaReserva(reservas);
  console.log();
  mostrarAQueShardsVanLasConsultas(reservas);

  const masCaras = await reservas.buscarLasMasCaras(3);
  console.log('las 3 mas caras:', masCaras.map(r => r.clienteId + ' ' + r.total).join(', '));

  console.log();
  console.log('agregando shard-4...');
  await cluster.agregarShard({ nombre: 'shard-4', uri: uris[0], baseDatos: 'app4' });
  console.log('movidos:', await cluster.rebalancear());

  await cluster.cerrar();
  await Promise.all(servidores.map(servidor => servidor.stop()));
}

ejecutar().catch(error => {
  console.error(error);
  process.exit(1);
});
