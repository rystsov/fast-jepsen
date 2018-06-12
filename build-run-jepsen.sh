#!/bin/bash

set -e

pushd keys

./build-run.sh

popd

cp keys/data/id_rsa jepsen/
cp keys/data/id_rsa.pub jepsen/

pushd jepsen

./build-run.sh

popd