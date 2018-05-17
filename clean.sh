#!/bin/bash

set -e

docker stop node1 node2 node3
docker rm node1 node2 node3
docker image rm consistencymongodb_mongo1 consistencymongodb_mongo2 consistencymongodb_mongo3