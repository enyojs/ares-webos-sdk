#!/bin/bash

# the folder this script is in
BIN_DIR=$(cd `dirname $0` && pwd)

# node script we are going to run
SCRIPT=${BIN_DIR}/../lib/node_modules/ares-webos-sdk/bin/ares-inspect.js

# check file path
if [ ! -e $SCRIPT ]; then
    echo "no file file found"
    SCRIPT=${BIN_DIR}/ares-inspect.js
else
    echo "file exist"
fi

# path to node modules
export NODE_PATH=$(cd ${BIN_DIR}/../lib && pwd)

# run node script with imported params
PATH=$BIN_DIR:$PATH node $SCRIPT $@
