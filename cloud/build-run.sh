#!/bin/bash

set -e

if ! docker images | grep cloud_fast_jepsen; then
  docker build -t="cloud_fast_jepsen" .
fi

docker rm cloud_fast_jepsen || true

docker run -i -t --name=cloud_fast_jepsen \
  -v $(pwd):/cloud \
  cloud_fast_jepsen