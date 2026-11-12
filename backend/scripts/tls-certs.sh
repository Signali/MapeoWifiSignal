#!/usr/bin/env bash
# Crea los certificados para HTTPS local de la demo (ver backend/README.md, sección HTTPS).
#
#   bash backend/scripts/tls-certs.sh [IP ...]
#
# - La primera vez crea una mini autoridad certificadora propia (certs/ca.key + certs/ca.crt) y
#   copia su certificado PÚBLICO a la app (android/app/src/main/res/raw/signalmap_ca.crt).
# - Cada vez emite un certificado del servidor (certs/server.crt + server.key) válido 30 días
#   para localhost, 127.0.0.1 y las IP que se pasen (la del PC en la red de ese día).
# La carpeta certs/ NO se versiona: las claves privadas nunca van al repositorio.
set -euo pipefail
export MSYS_NO_PATHCONV=1 # Git Bash en Windows convertiría "/CN=..." en una ruta

cd "$(dirname "$0")/../.."
mkdir -p certs android/app/src/main/res/raw

if [ ! -f certs/ca.key ]; then
  openssl ecparam -name prime256v1 -genkey -noout -out certs/ca.key
  openssl req -x509 -new -key certs/ca.key -sha256 -days 365 -subj "/CN=SignalMap CA (demo)" \
    -addext "basicConstraints=critical,CA:true,pathlen:0" \
    -addext "keyUsage=critical,keyCertSign,cRLSign" \
    -out certs/ca.crt
  cp certs/ca.crt android/app/src/main/res/raw/signalmap_ca.crt
  echo "CA nueva creada. Si cambió android/app/src/main/res/raw/signalmap_ca.crt, recompila la app."
fi

san="DNS:localhost,IP:127.0.0.1"
for ip in "$@"; do san="$san,IP:$ip"; done

openssl ecparam -name prime256v1 -genkey -noout -out certs/server.key
openssl req -new -key certs/server.key -subj "/CN=SignalMap" -out certs/server.csr
printf 'subjectAltName=%s\nbasicConstraints=CA:FALSE\nkeyUsage=digitalSignature\nextendedKeyUsage=serverAuth\n' "$san" > certs/server.ext
openssl x509 -req -in certs/server.csr -CA certs/ca.crt -CAkey certs/ca.key -CAcreateserial \
  -days 30 -sha256 -extfile certs/server.ext -out certs/server.crt
rm -f certs/server.csr certs/server.ext certs/ca.srl

echo "Certificado del servidor listo (30 días) para: $san"
echo "En .env: TLS_CERT_FILE=certs/server.crt y TLS_KEY_FILE=certs/server.key"
