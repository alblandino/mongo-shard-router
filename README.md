# mongo-shard-router

Libreria de Node.js para repartir los datos de una aplicacion entre varias bases de datos MongoDB.

## Que es

Cuando una aplicacion crece, una sola base de datos se queda corta. Una forma de resolverlo es dividir los datos en varias bases, cada una con una parte. A cada parte se le llama shard.

Esta libreria hace esa division desde la aplicacion. Tu le dices que bases tienes y como quieres repartir los datos, y ella se encarga de guardar cada documento en la base que le toca y de buscar solo en las bases donde puede estar lo que pides.

No usa el sharding propio de MongoDB (mongos). Cada shard es una base de datos normal.

## Para que sirve

- Repartir muchos datos entre varias bases para que ninguna se llene ni se ponga lenta.
- Agregar mas bases cuando hagan falta, moviendo solo los datos necesarios.

## Como reparte los datos

Cada coleccion tiene un campo llave, por ejemplo `clienteId`. Con ese valor se calcula a que shard va el documento. Todos los documentos con la misma llave quedan en el mismo shard, y los datos quedan repartidos de forma pareja entre todos.

Para calcularlo usa hash consistente: cada shard ocupa varios puntos en un anillo y cada llave va al primer shard que encuentra en el anillo. Asi, cuando se agrega o se quita un shard, solo cambian de lugar los documentos que le tocan a ese shard.

## Instalacion

```
git clone https://github.com/alblandino/mongo-shard-router.git
cd mongo-shard-router
npm install
```

Necesita Node.js 12 o mas nuevo.

## Como usarlo

### 1. Configurar el cluster

```js
const { crearCluster } = require('./src');

const cluster = await crearCluster({
  shards: [
    { nombre: 'shard-1', uri: 'mongodb://10.0.1.10:27017', baseDatos: 'tienda' },
    { nombre: 'shard-2', uri: 'mongodb://10.0.1.11:27017', baseDatos: 'tienda' },
    { nombre: 'shard-3', uri: 'mongodb://10.0.1.12:27017', baseDatos: 'tienda' }
  ],
  colecciones: {
    reservas: { llave: 'clienteId' },
    sesiones: { llave: 'usuarioId' }
  }
});
```

Que significa cada parte:

| Campo | Para que es |
|---|---|
| `shards` | Las bases de datos. Cada una tiene un nombre, la uri de conexion y el nombre de la base. |
| `colecciones` | Las colecciones que se reparten. `llave` es el campo para repartir (si no se pone se usa `_id`). |
| `nodosVirtuales` | Opcional, 500 por defecto. Mientras mas alto, mas parejo queda el reparto. |

En el ejemplo, `reservas` se reparte por cliente y `sesiones` por usuario.

### 2. Guardar y buscar datos

```js
const reservas = cluster.repositorio('reservas');

await reservas.insertarUno({ clienteId: 'ana', total: 120 });

const deAna = await reservas.buscar({ clienteId: 'ana' });
const caras = await reservas.buscar({ total: { $gt: 100 } }, { orden: { total: -1 }, limite: 10 });

await reservas.actualizarUno({ clienteId: 'ana' }, { $set: { estado: 'pagada' } });
await reservas.eliminarUno({ clienteId: 'ana' });
```

Los filtros y los cambios se escriben igual que en MongoDB.

Si el filtro tiene la llave, la consulta va solo al shard donde estan esos datos. Si no la tiene, va a todos y se juntan los resultados. Para ver a cuales iria una consulta:

```js
reservas.shardsPara({ clienteId: 'ana' }); // ['shard-2']
```

### 3. Cerrar las conexiones

```js
await cluster.cerrar();
```

## Ejemplo

Con la configuracion de arriba se guardan estas reservas:

```js
const reservas = cluster.repositorio('reservas');

await reservas.insertarUno({ clienteId: 'ana', total: 120 });
await reservas.insertarUno({ clienteId: 'luis', total: 80 });
await reservas.insertarUno({ clienteId: 'marta', total: 200 });
await reservas.insertarUno({ clienteId: 'giulia', total: 50 });
await reservas.insertarUno({ clienteId: 'pedro', total: 10 });
```

Y quedan asi:

```
ana      -> shard-2
luis     -> shard-3
marta    -> shard-3
giulia   -> shard-3
pedro    -> shard-3
```

Con tan pocos documentos el reparto se ve disparejo. Con muchos queda parejo, como muestra `npm run distribucion` mas abajo.

Para correr este ejemplo sin instalar MongoDB:

```
npm run ejemplo
```

Levanta tres MongoDB en memoria, guarda las reservas y muestra en que shard quedo cada una.

## Repositorio propio

`cluster.repositorio('reservas')` sirve para lo basico. Si quieres consultas con nombre propio, crea una clase que herede de `RepositorioDistribuido`:

```js
const { RepositorioDistribuido } = require('./src');

class RepositorioReservas extends RepositorioDistribuido {
  constructor(cluster) {
    super(cluster, 'reservas');
  }

  buscarPorCliente(clienteId) {
    return this.buscar({ clienteId });
  }

  buscarLasMasCaras(cantidad) {
    return this.buscar({}, { orden: { total: -1 }, limite: cantidad });
  }
}

const reservas = new RepositorioReservas(cluster);
const deLuis = await reservas.buscarPorCliente('luis');
```

## Agregar o quitar shards

```js
await cluster.agregarShard({ nombre: 'shard-4', uri: 'mongodb://10.0.1.13:27017', baseDatos: 'tienda' });
await cluster.rebalancear();
```

`rebalancear()` mueve a `shard-4` solo los documentos que ahora le tocan. Con 4 shards y uno nuevo se mueve mas o menos el 20% de los datos.

Para quitar uno:

```js
await cluster.quitarShard('shard-2');
await cluster.rebalancear();
```

Mientras el rebalanceo no termina, las consultas buscan en todos los shards para no perder ningun documento.

## Metodos

Del cluster:

| Metodo | Que hace |
|---|---|
| `crearCluster(configuracion)` | Crea el cluster y se conecta a todos los shards. |
| `repositorio(nombre)` | Devuelve el repositorio de una coleccion. |
| `agregarShard(shard)` | Agrega un shard. |
| `quitarShard(nombre)` | Quita un shard. |
| `rebalancear()` | Mueve los documentos al shard que les toca y devuelve cuantos movio por coleccion. |
| `cerrar()` | Cierra todas las conexiones. |

Del repositorio:

| Metodo | Que hace |
|---|---|
| `insertarUno(documento)` | Guarda un documento. Devuelve `{ id, shard }`. |
| `insertarVarios(documentos)` | Guarda varios documentos. |
| `buscar(filtro, opciones)` | Devuelve una lista. Opciones: `orden`, `saltar`, `limite` y `campos`. |
| `buscarUno(filtro, opciones)` | Devuelve el primer documento o `null`. |
| `buscarPorId(id)` | Busca por `_id`. |
| `contar(filtro)` | Cuenta los documentos. |
| `actualizarUno(filtro, cambios, opciones)` | Actualiza un documento. Con `{ upsert: true }` lo crea si no existe. |
| `actualizarVarios(filtro, cambios)` | Actualiza todos los que coincidan. |
| `eliminarUno(filtro)` | Elimina un documento. |
| `eliminarVarios(filtro)` | Elimina todos los que coincidan. |
| `shardsPara(filtro)` | Dice a que shards iria una consulta. |

## Limitaciones

- No se puede cambiar la llave de un documento con un update, porque tendria que cambiar de shard. Hay que eliminarlo e insertarlo de nuevo.
- Las operaciones que tocan varios shards no son atomicas. Si un shard falla, los otros pueden haber guardado sus cambios.
- Si un documento se modifica justo mientras el rebalanceo lo esta moviendo, ese cambio se puede perder.
- No tiene `aggregate`.

## Pruebas

```
npm test
```

Levanta tres MongoDB en memoria y prueba la libreria completa. La primera vez descarga MongoDB y tarda un poco.

Tambien hay un script que muestra como se reparten 200,000 llaves entre 4 shards:

```
npm run distribucion
```
