# How to reproduce the issue

1. clone this repo https://github.com/rystsov/consistency-mongodb.git
2. open a couple of terminals in consistency-mongodb
3. start the mongodb cluster: `docker-compose up`
4. start the client: `cd client && ./build-run.sh`
5. figure out how the primary: `./primary.sh`
6. isolate the primary (in my case it's node1): `./isolate.sh node1`
7. wait ~20 seconds
8. heal the network: `./rejoin.sh node1`
9. observe the violation

Let's review the `may-17` violation (see [may-17/output](https://github.com/rystsov/consistency-mongodb/blob/master/experiments/may-17/output)):

```
read(key2, node3) never written or stale data: 362
known value on the beginning of the read is: 371
read(key2, node1) never written or stale data: 362
known value on the beginning of the read is: 371
read(key3, node1) never written or stale data: 371
known value on the beginning of the read is: 375
```

Then we review the events which led to the violation (see tail of [may-17/events](https://github.com/rystsov/consistency-mongodb/blob/master/experiments/may-17/events)):

```
{"key":"key3","from":"node1","event":"read-start"}
...
{"key":"key3","from":"node1","value":"375","event":"read-ack"}
{"key":"key3","from":"node1","event":"read-start"}
...
{"key":"key3","from":"node1","value":"371","event":"read-ack"}
```

As we see, node `node1` read `375` and then `371` which violates consistency because there is only one writer in the system and it writes sequentially using an increasing sequence. So the observed history is impossible.

## Structure of the test

- four nodes in the system
- three host MongoDB's replica set
- same nodes host a thin nodejs application with talks with the DB and exposes http interface to read, create and update a key/value pair
- fourth node is a client working with http interface of each node and detecting consistency violations

## The client

The client has three async/await coroutines to sequentially update value of its key using an increasing sequence. Each coroutine works with its key and node. Updates to key1 go to node1, key2 to node2 and key3 to node3. Also there are 9 reading coroutines: three coroutines per node to read "key1", "key2" and "key3" keys.

# Resume

We demonstrated an violation of linearizability in the recent version of MongoDB (3.6.4). The bug may be either in the replication layer of the database or the official MongoDB driver for Node.js (3.1.0-beta4).