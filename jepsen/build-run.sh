#!/bin/bash

docker build -t="jepsen_control" .

docker rm jepsen_control || true

docker run -i --name=jepsen_control \
  --network=jepsen \
  -v $(pwd)/store:/jepsen/src/store \
  -t jepsen_control