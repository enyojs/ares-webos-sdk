#!/bin/bash

# the folder this script is in
ARES_DIR=$(cd `dirname $0` && pwd)

# node script we are going to run
PACKAGE="$ARES_DIR/lib/ares-package.js"

# path to included node
export NODE_PATH="$ARES_DIR/node/bin"

# run node script with imported params
PATH=$NODE_PATH:$PATH node $PACKAGE $@
