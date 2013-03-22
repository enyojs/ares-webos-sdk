#!/bin/bash

# the folder this script is in
BIN_DIR=$(cd `dirname $0` && pwd)

# node script we are going to run
SCRIPT="$BIN_DIR/../lib/ares-generate.js"

# path to included node
NODE_BASE=$BIN_DIR/../node
NODE_BIN="$NODE_BASE/bin"
export NODE_PATH="$NODE_BASE/lib"

# run node script with imported params
PATH=$NODE_BIN:$PATH node $SCRIPT $@
