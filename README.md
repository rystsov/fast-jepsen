# Jepsen and fast linearizability checker

This project applies an idea from the ["Testing shared memories"](http://citeseerx.ist.psu.edu/viewdoc/download?doi=10.1.1.107.3013&rep=rep1&type=pdf) paper to [Jepsen](http://jepsen.io/).

Jepsen is a tool to test consistency guarantees of distributed systems. It performs operations, injects faults, collects history and then tries to check if the history is linearizable.

The problem of checking linearizability is NP-complete, and the process of the checking belongs to the O(n!) class meaning that it takes an enormous amount of resources (time, memory) to validate long histories:

  * "Jepsen’s linearizability checker, Knossos, is not fast enough to reliably verify long histories," from the [CockroachDB analysis](https://jepsen.io/analyses/cockroachdb-beta-20160829).
  * "Because checking long histories for linearizability is expensive, we’ll break up our test into operations on different documents, and check each one independently—only working with a given document for ~60 seconds", from the [RethinkDB analysis](https://jepsen.io/analyses/rethinkdb-2-2-3-reconfiguration).

"Testing shared memories" adds restrictions to shift the problem from the NP to O(n ln n) and O(n) spaces.

Reduced complexity allows to test systems for hours and check consistency of the long-running operations such as reconfiguration, compaction/vacuuming, splitting a single replica set into several shards, live update, taking backups, etc.

This project successfully implements a checker from the paper, integrates it with Jepsen and reproduces the MongoDB 2.6.7 analysis to validate that new checker can find violations.

## Restrictions?

The paper focuses on testing registers supporting update and read operations. Also, it requires that all the updates are performed using compare-and-set over a record's version (write-id). Formally:

 1. Each record has an additional write-id field.
 2. Each version of a record must have unique write-id.
 3. Each update has a precondition on the current value of write-id.

### Isn't it too much to require CAS for every update operation?

If a system is expected to have concurrent writes such as a collaboration of multiple users or single user interacting with the system via multiple devices and we don't want to make assumptions on the meaning of the updates, then the system should support CAS.

In multi-threaded applications, we have a choice to use pessimistic concurrency (locking) or optimistic concurrency (compare-and-set), but in a distributed environment [locks don't work and require the underlying storage to support fencing](https://martin.kleppmann.com/2016/02/08/how-to-do-distributed-locking.html), so we need CAS in both cases.

## Checker

The checker implements `jepsen.checker/Checker` protocol, accepts history, ignores all but:

 - start of a read - `:type :invoke, :f :read`
 - result of a read - `:type :ok, :f :read`
 - start of a write - `:type :invoke, :f :write`
 - confirmation a write - `:type :ok, :f :write`

and checks if they are consistent.

History sample, each read has `write-id` and write - `prev-write-id` and `w1`:

```
{:host "node1", :type :invoke, :f :read, :value nil, :process 8, :time 333383000}
{:host "node1", :type :ok, :f :read, :value 0, :process 8, :time 443435300, :write-id "00000000-0000-0000-0000-000000000000"}
{:host "node2", :type :invoke, :f :write, :value 0, :write-id "e2a02cec-2168-45e5-80e4-e009744454e9", :prev-write-id "00000000-0000-0000-0000-000000000000", :process 9, :time 513243900}
{:host "node2", :type :ok, :f :write, :value 0, :write-id "e2a02cec-2168-45e5-80e4-e009744454e9", :prev-write-id "00000000-0000-0000-0000-000000000000", :process 9, :time 940449900}
```

One of the algorithms from "Testing shared memories" (Theorem 4.13) is:

  1. Build a graph of the read and write events
  2. Add an edge from a write `w1` to a write `w2` if `w1.write-id == w2.prev-write-id` (write-order). Check that a write `w1` has only one outcoming edge leading to a write.
  3. Add an edge from a write `w1` to a read `r1` if `w1.write-id == r1.write-id` and check that the read value correspond to the written value (read-mapping).
  4. Add an edge from a read `r1` to a write `w2` if `r1.write-id == w2.prev-write-id`.
  5. Add an edge from an event `e1` to an event `e2` if `e2` starts after `e1` finishes in any client's timeline.
  6. Any topological sort of the graph gives a linearization of the history.

Jepsen runs on a single control node using multithreading to simulate multiple clients. So we can use its time as absolute time. Edges `2`, `3`, `5` are co-directed with time because they represent causal relations. With linearizability a read is required to return at least the most recent confirmed write known on the moment the read started, it also implies that `4` is co-directed with time so we can check the absence of cycles as time flows (online):
  
  1. Sort all the events by time.
  2. The set of all observed writes and their dependencies (in a CAS sense) must form a chain leading to the initial value. On start, the chain consists only the initial value.
  3. Process events one-by-one.
  4. On observation of a value (end of a read or a write):
      - if the corresponding write is already part of the chain:
        - if the observation is a write confirmation: does nothing
        - if it's a read: check that the observed value is or comes after the head of the chain known at the moment the operation started
      - verify that the CAS-dependencies of the observed value lead to the current head of the chain and add them making the observed value a new head

If the history is sorted, then the algorithm takes linear time and can work online otherwise it's O(n ln n).

## How to run?

1. Install docker
2. Clone this repo
3. `./build-run-cluser.sh`
4. `./build-run-jepsen.sh`

If Jepsen observes a violation of consistency, you'll see something like

       {:timeline {:valid? true},
        :linear {:valid? true, :some-details nil},
        :valid? true},
       "key1"
       {:timeline {:valid? true},
        :linear
        {:valid? false,
         :some-details
         "Read read at 35220694031 'ffda150b-fb28-44d3-87e4-f922fdd8e807' write-id but a fresher 'b16e7d06-5786-4139-8420-9ee6ef6515a5 -> f0045d0e-ff02-4076-80cf-c8d8bd5949b7 -> 26ecb0d6-6ac3-4a7a-870b-4f55314522f4 -> ffda150b-fb28-44d3-87e4-f922fdd8e807' write-id chain was already known at 10173375459 before the read started (35208254096)"},
        :valid? false}},
      :failures ["key1"]},
     :valid? false}
    
    Analysis invalid! (?????? ???

In this case we have the following situation:

    10173375459 - sombody saw b16e7d06-5786-4139-8420-9ee6ef6515a5
    35208254096 - read started
    35220694031 - read returned ffda150b-fb28-44d3-87e4-f922fdd8e807

but ffda150b-fb28-44d3-87e4-f922fdd8e807 is b16e7d06-5786-4139-8420-9ee6ef6515a5's dependancy:

    b16e7d06-5786-4139-8420-9ee6ef6515a5 ->
    f0045d0e-ff02-4076-80cf-c8d8bd5949b7 ->
    26ecb0d6-6ac3-4a7a-870b-4f55314522f4 ->
    ffda150b-fb28-44d3-87e4-f922fdd8e807

so the read should have returned at least b16e7d06-5786-4139-8420-9ee6ef6515a5.

## Other features

This setup has a couple of new features compared to regular structure aimed to increase the probability of finding a violation.

### Remote clients

Each node hosts MongoDB replica and a NodeJS app exposing HTTP key/value interface to MongoDB, so the control node (Jepsen) works with the database via the exposed interface. Clients running inside Jepsen always see the same worldview because Jepsen introduces faults only between the database's nodes. With the remote clients, this feature is gone and a network partition makes clients see the world differently adding a new possibility to break (see db/api-js).

### Sticky symmetrical writer-readers topology

The setup is using three keys `key1`, `key2` and `key2`; for each key, there are four clients: one writer and three readers. Each client is "sticky" and communicates with its designated node, for example `key1`'s writer always writes via `node1`, readers read via `node1`, `node2` and `node3`. The same is true for `key2` and `key3` but their writers write via `node2` and `node3`.

With this symmetrical topology and isolation of any node will affect at least one writer and all readers thus increasing intrusion and chances to observe something strange (see dispatcher.clj).

### Guided nemesis

Instead of picking a node randomly nemesis asks MongoDB who's the current primary and isolates it to maximize the impact (see isolate.clj).

### Currect value predictor

Usually, Jepsen operates on a small set of possible values and to perform CAS it randomly select value to use it as previous value in a predicate. If the set has three elements, then there is 33% chance of guessing it right.

The TSM algorithm requires each update to be unique to map every read to a write event. The chance of guessing a right value picking randomly from a countable set is zero. So clients pass observed values to an oracle (see oracle.clj) and then use it to guess a current write-id (version).