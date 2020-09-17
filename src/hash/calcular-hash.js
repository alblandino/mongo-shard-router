const crypto = require('crypto');

// numero de 32 bits sacado de los primeros 4 bytes del md5
function calcularHash(texto) {
  const md5 = crypto.createHash('md5').update(String(texto)).digest();
  return md5.readUInt32BE(0);
}

module.exports = calcularHash;
