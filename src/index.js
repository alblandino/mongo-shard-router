const { Cluster, crearCluster } = require('./cluster/cluster');
const RepositorioDistribuido = require('./repositorios/repositorio-distribuido');
const AnilloHash = require('./hash/anillo-hash');
const { distanciaKm } = require('./geo/coordenadas');
const { ErrorDeConfiguracion, ErrorDeEnrutamiento, ErrorDeOperacion } = require('./comun/errores');

module.exports = {
  crearCluster,
  Cluster,
  RepositorioDistribuido,
  AnilloHash,
  distanciaKm,
  ErrorDeConfiguracion,
  ErrorDeEnrutamiento,
  ErrorDeOperacion
};
