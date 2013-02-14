#!/bin/bash

# the folder this script is in
ARES_DIR=$(cd `dirname $0` && pwd)

# node script we are going to run
GENERATE="$ARES_DIR/lib/ares-generate.js"

# path to included node
export NODE_PATH="$ARES_DIR/node/bin"

# run node script with imported params
PATH=$PATH:$NODE_PATH node $GENERATE $@
