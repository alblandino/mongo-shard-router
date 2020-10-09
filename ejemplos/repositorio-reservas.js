const { RepositorioDistribuido } = require('../src');
class RepositorioReservas extends RepositorioDistribuido {
  constructor(cluster) {
    super(cluster, 'reservas');
  }

  buscarPorCliente(clienteId, pais) {
    return this.buscar({ clienteId, pais });
  }

  buscarLasMasCaras(cantidad) {
    return this.buscar({}, { orden: { total: -1 }, limite: cantidad });
  }

  cancelar(idReserva) {
    return this.actualizarUno({ _id: idReserva }, { $set: { estado: 'cancelada' } });
  }
}

module.exports = RepositorioReservas;
