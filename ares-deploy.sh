#!/bin/bash

#set -x

# Call me with: ./ares-deploy.sh <path/to/App>

if [ ! -d "$1" ] ; then
  echo "USAGE: $0 <path/to/App>"
  exit 1
fi

# the folder this script is in
ARES_DIR=$(cd `dirname $0` && pwd)

# path to included node
export NODE_PATH="$ARES_DIR/node/bin"

# run app's deploy script, if any
pushd $1
if [ -e tools/deploy.sh ] ; then
  chmod +x tools/deploy.sh
  PATH=$NODE_PATH:$PATH ./tools/deploy.sh
  APPDIR=`basename $PWD`
  cp -f *.json deploy/$APPDIR/
fi
popd

