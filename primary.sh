#!/bin/bash

docker exec -i -t node1 /mongo/mongodb-linux-x86_64-3.6.4/bin/mongo --eval 'rs.status().members.map(x => x.stateStr == "PRIMARY" ?  x.name + " (*)" : x.name)'