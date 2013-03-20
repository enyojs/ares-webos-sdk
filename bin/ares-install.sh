#!/bin/bash

# the folder this script is in
BIN_DIR=$(cd `dirname $0` && pwd)

# node script we are going to run
SCRIPT="$BIN_DIR/../lib/ares-install.js"

# path to included node
export NODE_PATH="$BIN_DIR/../node/bin"

# run node script with imported params
PATH=$NODE_PATH:$PATH node $SCRIPT $@
