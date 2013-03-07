#!/bin/bash

# the folder this script is in
ARES_DIR=$(cd `dirname $0` && pwd)

# path to included node
export NODE_PATH="$ARES_DIR/node/bin"

# launch ares IDE
cd $ARES_DIR/ares-project
PATH=$NODE_PATH:$PATH node ide.js -b $@
