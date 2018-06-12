#!/bin/bash

sleep 5s

node1=$(getent hosts node1 | awk '{ print $1 }')
node2=$(getent hosts node2 | awk '{ print $1 }')
node3=$(getent hosts node3 | awk '{ print $1 }')

if [ -z "$node1" ] ; then exit 1 ; fi;
if [ -z "$node2" ] ; then exit 1 ; fi;
if [ -z "$node3" ] ; then exit 1 ; fi;

ssh-keyscan -t rsa node1 >> ~/.ssh/known_hosts
ssh-keyscan -t rsa node2 >> ~/.ssh/known_hosts
ssh-keyscan -t rsa node3 >> ~/.ssh/known_hosts

rm -f /jepsen/ssh-agent-socket
ssh-agent -a /jepsen/ssh-agent-socket

export SSH_AUTH_SOCK=/jepsen/ssh-agent-socket

ssh-add /root/.ssh/id_rsa

java -jar /jepsen/src/target/uberjar/clojure-mongo-0.1.0-SNAPSHOT-standalone.jar 40