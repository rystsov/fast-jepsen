It looks like MongoDB 3.6.4 with strictness write and read concerns (majority/linearizability) violates linearizability and returns stale data when a former isolated primary rejoined the cluster.

Bug: https://jira.mongodb.org/browse/SERVER-35038

## How to reproduce the issue

1. clone this repo https://github.com/rystsov/consistency-mongodb.git
2. open a couple of terminals in consistency-mongodb
3. start the mongodb cluster: `docker-compose up`
4. start clients / consistency checker: `cd client && ./build-run.sh`
5. figure out who is the primary: `./primary.sh`
6. isolate the primary (in my case it's node1): `./isolate.sh node1`
7. wait ~20 seconds
8. heal the network: `./rejoin.sh node1`
9. observe the violation

The output of the checker ([may-17/output](https://github.com/rystsov/consistency-mongodb/blob/master/experiments/may-17/output)) in my case had:

```
read(key2, node3) never written or stale data: 362
known value on the beginning of the read is: 371
read(key2, node1) never written or stale data: 362
known value on the beginning of the read is: 371
read(key3, node1) never written or stale data: 371
known value on the beginning of the read is: 375
```

The log of read/write events ([may-17/events](https://github.com/rystsov/consistency-mongodb/blob/master/experiments/may-17/events)) explains the violation:

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

- Four nodes in the system.
- Three hosts MongoDB's replica set.
- Same nodes host a thin Node.js application exposes straightforward key-value read/write API to MongoDB over HTTP.
- Fourth node is a client / consistency checker, it uses HTTP interface and detects consistency violations.

## Client

Client has three async/await coroutines to sequentially update value of its key using an increasing sequence. Each coroutine works with its key and node. Updates to `key1` go to `node1`, `key2` to `node2` and `key3` to `node3`. Also there are 9 reading coroutines: three coroutines per node to read `key1`, `key2` and `key3` keys.

All reads were done with "linearizable" read concern and "majority" write concern.

The checker produces two log files:
 * output - is the same as he checker's output
 * events - history of start/end read/write operations

### Output legend

`output` contains output of the client:

```
0 ||   20    0 |   18    0   26    0   24    0 ||   26    0 |   18    0   25    0   27    0 ||   25    0 |   18    0   24    0   23    0
1 ||   17    0 |   19    0   29    0   28    0 ||   28    0 |   18    0   28    0   28    0 ||   29    0 |   16    0   28    0   30    0
2 ||   18    0 |   17    0   28    0   28    0 ||   26    0 |   18    0   27    0   28    0 ||   27    0 |   15    0   25    0   29    0
```

Each row summarizes one second of the experiment.

A row consists of several columns - the first column is the number of seconds passed since the beginning of the experiment, then there are three groups of columns, each group is dedicated to one of the nodes: node1, node2 and node3.

The first two columns in a group represent a writer process with number of successful and failed writes per second. For example, during the first second of an experiment a client updated `key1` via `node1` 20 times, `key2` via `node2` 26 times and `key3` via `node3` 25 times.

The last 6 columns in each group correspond to reading `key1`, `key2`, `key3` from the group's node. Each key spans over two columns: number of successful and failed reads.

If there is a consistency violation the log will also include something like:

```
read(key2, node3) never written or stale data: 362
known value on the beginning of the read is: 371
read(key2, node1) never written or stale data: 362
known value on the beginning of the read is: 371
read(key3, node1) never written or stale data: 371
known value on the beginning of the read is: 375
```

In this case, we know that a client read `key3` and got 371 however it had been aleady known on the moment just before a request was issued that the expected value should not be less than 375.

### Events legend

It's a log of events as they were observed by a client. Since Node.js is single threaded the order of events is consistent with wall clock.

Each log entry may below to one of four classes:

1. `{"key":"key3","from":"node3","event":"read-start"}` - a client started reading key `key3` from node `node3`.
2. `{"key":"key3","from":"node3","value":"1","event":"read-ack"}` - a client read value `1` from node `node3`.
3. `{"key":"key2","value":"3","event":"write-start"}` - a client started writing value `3` to key `key2` (via node `node2`)
4. `{"key":"key2","event":"write-ack"}` - a client successfully wrote a value