#!/bin/bash

if ! docker images | grep jepsen_keys; then
  docker build -t="jepsen_keys" .
fi

mkdir -p data

if [[ -f data/id_rsa && -f data/id_rsa.pub ]]; then
  echo "Keys already exist"
else
  docker rm jepsen_keys || true
  docker run -i --name=jepsen_keys \
  -v $(pwd)/data:/data \
  -t jepsen_keys
fi