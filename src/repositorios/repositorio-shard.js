// acceso a los datos de una coleccion dentro de un solo shard.
// es la unica clase que usa el driver de mongo para leer y escribir
class RepositorioShard {
  constructor(baseDeDatos, nombreColeccion) {
    this.coleccion = baseDeDatos.collection(nombreColeccion);
  }

  async insertarUno(documento) {
    await this.coleccion.insertOne(documento);
  }

  async insertarVarios(documentos) {
    await this.coleccion.insertMany(documentos);
  }

  buscar(filtro, opciones = {}) {
    let cursor = this.coleccion.find(filtro);

    if (opciones.campos) cursor = cursor.project(opciones.campos);
    if (opciones.orden) cursor = cursor.sort(opciones.orden);
    if (opciones.saltar) cursor = cursor.skip(opciones.saltar);
    if (opciones.limite) cursor = cursor.limit(opciones.limite);

    return cursor.toArray();
  }

  // devuelve un cursor para recorrer la coleccion completa sin cargarla toda en memoria
  recorrerTodos() {
    return this.coleccion.find({});
  }

  contar(filtro = {}) {
    return this.coleccion.countDocuments(filtro);
  }

  async actualizarUno(filtro, cambios, { upsert = false } = {}) {
    const resultado = await this.coleccion.updateOne(filtro, cambios, { upsert });
    return {
      encontrados: resultado.matchedCount,
      modificados: resultado.modifiedCount,
      // el driver 3.x devuelve { index, _id } en upsertedId
      idInsertado: resultado.upsertedId ? resultado.upsertedId._id : null
    };
  }

  async actualizarVarios(filtro, cambios) {
    const resultado = await this.coleccion.updateMany(filtro, cambios);
    return {
      encontrados: resultado.matchedCount,
      modificados: resultado.modifiedCount
    };
  }

  async eliminarUno(filtro) {
    const resultado = await this.coleccion.deleteOne(filtro);
    return resultado.deletedCount;
  }

  async eliminarVarios(filtro) {
    const resultado = await this.coleccion.deleteMany(filtro);
    return resultado.deletedCount;
  }

  // inserta el documento o lo reemplaza si ya existe uno con el mismo _id
  async guardar(documento) {
    await this.coleccion.replaceOne({ _id: documento._id }, documento, { upsert: true });
  }

  async eliminarPorIds(ids) {
    await this.coleccion.deleteMany({ _id: { $in: ids } });
  }
}

module.exports = RepositorioShard;
