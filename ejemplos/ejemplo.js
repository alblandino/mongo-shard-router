const { MongoMemoryServer } = require('mongodb-memory-server');
const { crearCluster } = require('../src');
const RepositorioReservas = require('./repositorio-reservas');

const RESERVAS_DE_EJEMPLO = [
  { clienteId: 'ana', pais: 'DO', total: 120 },
  { clienteId: 'luis', pais: 'ES', total: 80 },
  { clienteId: 'marta', pais: 'CL', total: 200 },
  // sin pais va por coordenadas
  { clienteId: 'giulia', ubicacion: { type: 'Point', coordinates: [12.49, 41.89] }, total: 50 },
  // sin pais ni coordenadas va a la zona por defecto
  { clienteId: 'pedro', total: 10 }
];

function crearConfiguracion(uris) {
  return {
    shards: [
      { nombre: 'america-1', uri: uris[0], baseDatos: 'app' },
      { nombre: 'america-2', uri: uris[1], baseDatos: 'app' },
      { nombre: 'europa-1', uri: uris[2], baseDatos: 'app' }
    ],
    zonas: [
      { nombre: 'america', shards: ['america-1', 'america-2'], paises: ['DO', 'US', 'MX', 'CL', 'PE'], centro: { lat: 18.48, lng: -69.93 } },
      { nombre: 'europa', shards: ['europa-1'], paises: ['ES', 'FR', 'DE', 'IT'], centro: { lat: 40.41, lng: -3.70 } }
    ],
    zonaPorDefecto: 'america',
    colecciones: {
      reservas: { llave: 'clienteId', geo: { pais: 'pais', ubicacion: 'ubicacion' } },
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
  console.log('{ clienteId: "ana", pais: "DO" } va a', reservas.shardsPara({ clienteId: 'ana', pais: 'DO' }));
  console.log('{ pais: "ES" } va a', reservas.shardsPara({ pais: 'ES' }));
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
  console.log('agregando america-3...');
  await cluster.agregarShard({ nombre: 'america-3', uri: uris[0], baseDatos: 'app3' }, 'america');
  console.log('movidos:', await cluster.rebalancear());

  await cluster.cerrar();
  await Promise.all(servidores.map(servidor => servidor.stop()));
}

ejecutar().catch(error => {
  console.error(error);
  process.exit(1);
});
