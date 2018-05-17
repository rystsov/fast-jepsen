#!/bin/bash

set -e
if ! docker images | grep mongo_client; then
   docker build -t="mongo_client" .
fi

docker rm client1 || true

docker run -i -t --name=client1 --hostname=client1 --network=jepsen -v $(pwd)/app:/client/app mongo_client
