#!/bin/bash

set -e
if ! docker images | grep mongo_client; then
   docker build -t="mongo_client" .
fi

docker rm client1 || true

rm -rf logs

mkdir logs

docker run -i -t --name=client1 --hostname=client1 --network=jepsen -v $(pwd)/logs:/client/logs mongo_client | tee -a $(pwd)/logs/output
