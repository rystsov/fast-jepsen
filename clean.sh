#!/bin/bash

set -e

docker stop node1 node2 node3 || true
docker rm node1 node2 node3 jepsen_control || true
docker image rm fastjepsen_mongo1 fastjepsen_mongo2 fastjepsen_mongo3 jepsen_control || true
