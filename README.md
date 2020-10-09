# mongo-shard-router

Libreria de Node.js para repartir los datos de una aplicacion entre varias bases de datos MongoDB.

## Que es

Cuando una aplicacion crece, una sola base de datos se queda corta. Una forma de resolverlo es dividir los datos en varias bases, cada una con una parte. A cada parte se le llama shard.

Esta libreria hace esa division desde la aplicacion. Tu le dices que bases tienes y como quieres repartir los datos, y ella se encarga de guardar cada documento en la base que le toca y de buscar solo en las bases donde puede estar lo que pides.

No usa el sharding propio de MongoDB (mongos). Cada shard es una base de datos normal.

## Para que sirve

- Repartir muchos datos entre varias bases para que ninguna se llene ni se ponga lenta.
- Guardar los datos de cada cliente cerca de donde esta, por ejemplo los clientes de Europa en un servidor de Europa.
- Agregar mas bases cuando hagan falta, moviendo solo los datos necesarios.

## Como reparte los datos

Hay dos formas y se pueden usar juntas.

**Por llave.** Cada coleccion tiene un campo llave, por ejemplo `clienteId`. Con ese valor se calcula a que shard va el documento. Todos los documentos con la misma llave quedan en el mismo shard, y los datos quedan repartidos de forma pareja entre todos.

**Por ubicacion.** Se definen zonas, por ejemplo America y Europa. Cada zona tiene sus shards y su lista de paises. Un documento va a la zona de su pais. Si no tiene pais pero tiene coordenadas, va a la zona mas cercana. Si no tiene ninguna de las dos cosas, va a la zona por defecto.

**Las dos juntas.** Primero se elige la zona por la ubicacion y despues el shard dentro de esa zona por la llave.

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
    { nombre: 'america-1', uri: 'mongodb://10.0.1.10:27017', baseDatos: 'tienda' },
    { nombre: 'america-2', uri: 'mongodb://10.0.1.11:27017', baseDatos: 'tienda' },
    { nombre: 'europa-1', uri: 'mongodb://10.1.1.10:27017', baseDatos: 'tienda' }
  ],
  zonas: [
    {
      nombre: 'america',
      shards: ['america-1', 'america-2'],
      paises: ['DO', 'US', 'MX', 'CL', 'PE'],
      centro: { lat: 18.48, lng: -69.93 }
    },
    {
      nombre: 'europa',
      shards: ['europa-1'],
      paises: ['ES', 'FR', 'DE', 'IT'],
      centro: { lat: 40.41, lng: -3.70 }
    }
  ],
  zonaPorDefecto: 'america',
  colecciones: {
    reservas: { llave: 'clienteId', geo: { pais: 'pais', ubicacion: 'ubicacion' } },
    sesiones: { llave: 'usuarioId' }
  }
});
```

Que significa cada parte:

| Campo | Para que es |
|---|---|
| `shards` | Las bases de datos. Cada una tiene un nombre, la uri de conexion y el nombre de la base. |
| `zonas` | Opcional. Cada zona tiene sus shards, sus paises y un centro para calcular cual queda mas cerca. |
| `zonaPorDefecto` | Zona a la que va un documento cuando no se sabe su ubicacion. |
| `colecciones` | Las colecciones que se reparten. `llave` es el campo para repartir (si no se pone se usa `_id`). `geo` es opcional y dice en que campos estan el pais y las coordenadas. |
| `nodosVirtuales` | Opcional, 500 por defecto. Mientras mas alto, mas parejo queda el reparto. |

En el ejemplo, `reservas` se reparte por ubicacion y por cliente, y `sesiones` solo por usuario entre todos los shards.

### 2. Guardar y buscar datos

```js
const reservas = cluster.repositorio('reservas');

await reservas.insertarUno({ clienteId: 'ana', pais: 'DO', total: 120 });

const deAna = await reservas.buscar({ clienteId: 'ana', pais: 'DO' });
const caras = await reservas.buscar({ total: { $gt: 100 } }, { orden: { total: -1 }, limite: 10 });

await reservas.actualizarUno({ clienteId: 'ana', pais: 'DO' }, { $set: { estado: 'pagada' } });
await reservas.eliminarUno({ clienteId: 'ana', pais: 'DO' });
```

Los filtros y los cambios se escriben igual que en MongoDB.

Si el filtro tiene la llave o el pais, la consulta va solo a los shards donde pueden estar esos datos. Si no tiene ninguno de los dos, va a todos y se juntan los resultados. Para ver a cuales iria una consulta:

```js
reservas.shardsPara({ pais: 'ES' }); // ['europa-1']
```

### 3. Cerrar las conexiones

```js
await cluster.cerrar();
```

## Ejemplo

Con la configuracion de arriba se guardan estas reservas:

```js
const reservas = cluster.repositorio('reservas');

await reservas.insertarUno({ clienteId: 'ana', pais: 'DO', total: 120 });
await reservas.insertarUno({ clienteId: 'luis', pais: 'ES', total: 80 });
await reservas.insertarUno({ clienteId: 'marta', pais: 'CL', total: 200 });

// no tiene pais, tiene coordenadas de Roma
await reservas.insertarUno({ clienteId: 'giulia', ubicacion: { type: 'Point', coordinates: [12.49, 41.89] }, total: 50 });

// no tiene pais ni coordenadas
await reservas.insertarUno({ clienteId: 'pedro', total: 10 });
```

Y quedan asi:

```
ana      -> america-2   (Republica Dominicana esta en la zona america)
luis     -> europa-1    (Espana esta en la zona europa)
marta    -> america-1   (Chile esta en la zona america)
giulia   -> europa-1    (Roma queda mas cerca del centro de europa)
pedro    -> america-1   (no se sabe donde esta, va a la zona por defecto)
```

Dentro de America, el shard de cada cliente lo decide su `clienteId`.

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

  buscarPorCliente(clienteId, pais) {
    return this.buscar({ clienteId, pais });
  }

  buscarLasMasCaras(cantidad) {
    return this.buscar({}, { orden: { total: -1 }, limite: cantidad });
  }
}

const reservas = new RepositorioReservas(cluster);
const deLuis = await reservas.buscarPorCliente('luis', 'ES');
```

## Agregar o quitar shards

```js
await cluster.agregarShard({ nombre: 'america-3', uri: 'mongodb://10.0.1.12:27017', baseDatos: 'tienda' }, 'america');
await cluster.rebalancear();
```

`rebalancear()` mueve a `america-3` solo los documentos que ahora le tocan. Con 4 shards y uno nuevo se mueve mas o menos el 20% de los datos.

Para quitar uno:

```js
await cluster.quitarShard('america-2');
await cluster.rebalancear();
```

Mientras el rebalanceo no termina, las consultas buscan en todos los shards para no perder ningun documento.

## Metodos

Del cluster:

| Metodo | Que hace |
|---|---|
| `crearCluster(configuracion)` | Crea el cluster y se conecta a todos los shards. |
| `repositorio(nombre)` | Devuelve el repositorio de una coleccion. |
| `agregarShard(shard, zona)` | Agrega un shard. La zona es opcional. |
| `quitarShard(nombre)` | Quita un shard. |
| `rebalancear()` | Mueve los documentos al shard que les toca y devuelve cuantos movio por coleccion. |
| `cerrar()` | Cierra todas las conexiones. |

Del repositorio:

| Metodo | Que hace |
|---|---|
| `insertarUno(documento)` | Guarda un documento. Devuelve `{ id, shard }`. |
| `insertarVarios(documentos)` | Guarda varios documentos. |
| `buscar(filtro, opciones)` | Devuelve una lista. Opciones: `orden`, `saltar`, `limite`, `campos` y `zona`. |
| `buscarUno(filtro, opciones)` | Devuelve el primer documento o `null`. |
| `buscarPorId(id)` | Busca por `_id`. |
| `contar(filtro, opciones)` | Cuenta los documentos. |
| `actualizarUno(filtro, cambios, opciones)` | Actualiza un documento. Con `{ upsert: true }` lo crea si no existe. |
| `actualizarVarios(filtro, cambios, opciones)` | Actualiza todos los que coincidan. |
| `eliminarUno(filtro, opciones)` | Elimina un documento. |
| `eliminarVarios(filtro, opciones)` | Elimina todos los que coincidan. |
| `shardsPara(filtro, zona)` | Dice a que shards iria una consulta. |

## Limitaciones

- No se puede cambiar la llave, el pais ni las coordenadas de un documento con un update, porque tendria que cambiar de shard. Hay que eliminarlo e insertarlo de nuevo.
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
