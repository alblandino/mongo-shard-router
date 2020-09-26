const AnilloHash = require('../src/hash/anillo-hash');
const calcularHash = require('../src/hash/calcular-hash');

const TOTAL_LLAVES = 200000;
const SHARDS = ['shard-1', 'shard-2', 'shard-3', 'shard-4'];
const NODOS_VIRTUALES_A_PROBAR = [1, 10, 100, 500];

function crearLlave(numero) {
  return 'cliente-' + numero;
}

function porcentaje(cantidad) {
  return (cantidad / TOTAL_LLAVES * 100).toFixed(1) + '%';
}

function contarLlavesPorShard(anillo) {
  const conteo = Object.fromEntries(SHARDS.map(shard => [shard, 0]));
  for (let i = 0; i < TOTAL_LLAVES; i++) {
    conteo[anillo.obtenerShard(crearLlave(i))]++;
  }
  return conteo;
}

function mostrarReparto() {
  console.log('Reparto de ' + TOTAL_LLAVES + ' llaves en 4 shards (lo ideal es 25% cada uno)');

  for (const nodosVirtuales of NODOS_VIRTUALES_A_PROBAR) {
    const conteo = contarLlavesPorShard(new AnilloHash(SHARDS, nodosVirtuales));
    const porcentajes = SHARDS.map(shard => porcentaje(conteo[shard]));
    console.log(String(nodosVirtuales).padStart(4) + ' nodos virtuales: ' + porcentajes.join('  '));
  }
}

function mostrarLlavesQueCambianAlAgregarUnShard() {
  console.log('Llaves que cambian de shard al pasar de 4 a 5 shards');

  const antes = new AnilloHash(SHARDS);
  const despues = new AnilloHash([...SHARDS, 'shard-5']);
  let cambiaronConAnillo = 0;
  let cambiaronConModulo = 0;

  for (let i = 0; i < TOTAL_LLAVES; i++) {
    const llave = crearLlave(i);
    const hash = calcularHash(llave);
    if (antes.obtenerShard(llave) !== despues.obtenerShard(llave)) cambiaronConAnillo++;
    if (hash % 4 !== hash % 5) cambiaronConModulo++;
  }

  console.log('con el anillo: ' + porcentaje(cambiaronConAnillo));
  console.log('con hash % n:  ' + porcentaje(cambiaronConModulo));
}

mostrarReparto();
console.log();
mostrarLlavesQueCambianAlAgregarUnShard();
