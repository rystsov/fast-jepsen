#!/bin/bash

set -e

pushd keys

./build-run.sh

popd

cp keys/data/id_rsa db/
cp keys/data/id_rsa.pub db/

docker-compose up