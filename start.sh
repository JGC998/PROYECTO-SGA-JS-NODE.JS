#!/bin/sh
# Arranca el servidor SGA LIN en el puerto 3000
NODE_BIN="$HOME/.nvm/versions/node/v22.19.0/bin/node"
NPM_BIN="$HOME/.nvm/versions/node/v22.19.0/bin/npm"

# Buscar Node si la ruta por defecto no existe
if [ ! -f "$NODE_BIN" ]; then
    NVM_DIR="$HOME/.nvm/versions/node"
    LATEST=$(ls -1 "$NVM_DIR" 2>/dev/null | sort -V | tail -1)
    if [ -n "$LATEST" ]; then
        NODE_BIN="$NVM_DIR/$LATEST/bin/node"
        NPM_BIN="$NVM_DIR/$LATEST/bin/npm"
        echo "Usando Node.js $LATEST"
    else
        echo "Error: Node.js no encontrado en $NVM_DIR"
        exit 1
    fi
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Instalar dependencias si node_modules no existe o package.json cambió
if [ ! -d "$SCRIPT_DIR/node_modules" ]; then
    echo "node_modules no encontrado — ejecutando npm install..."
    cd "$SCRIPT_DIR" && "$NPM_BIN" install
    if [ $? -ne 0 ]; then
        echo "Error: npm install falló"
        exit 1
    fi
fi

echo "Iniciando SGA LIN en http://localhost:3000"
exec "$NODE_BIN" "$SCRIPT_DIR/server.js"
