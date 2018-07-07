# Jepsen and exponentially fast linearizability checker

This project explores an application of an idea from the ["Testing shared memories"](http://citeseerx.ist.psu.edu/viewdoc/download?doi=10.1.1.107.3013&rep=rep1&type=pdf) paper to [Jepsen](http://jepsen.io/).

Jepsen is a tool to test consistency guarantees of distributed systems. It performs operations, injects faults, collects history and then tries to check if the history is linearizable.

The problem of checking linearizability is NP-complete, and the process of the checking belongs to the O(n!) class meaning that it takes an enormous amount of resources (time, memory) to validate long histories:

  * ["OOM: If we run Jepsen for a long time, it may cause OOM easily."](https://medium.com/@siddontang/use-chaos-to-test-the-distributed-system-linearizability-4e0e778dfc7d)
  * ["Knossos times out on benchmark 7 and 99, and runs out of memory on 40, 57, 85 and 97"](https://github.com/ahorn/linearizability-checker)

TSM paper notices that additional restrictions shift the problem from the NP to the O(n ln n) space and make the process of validation exponentially faster.

This project successfully implements the TSM-inspired checker, integrates it with Jepsen and reproduces the MongoDB 2.6.7 result to validate that new checker is able to find violations.

## Restrictions?

TSM focuses on testing registers supporting update and read operations. Also, it requires that all the updates are performed using compare-and-set over a record's version (write-id). Formally:

 1. Each record has an additional write-id field.
 2. Each version of a record must have unique write-id.
 3. Each update has a precondition on the current value of write-id.

### Isn't it too much to require CAS for every update operation?

If a system is expected to have concurrent writes such as a collaboration of multiple users or single user interacting with the system via multiple devices and we don't want to make assumptions on the meaning of the updates, then the system should support CAS.

In multi-threaded applications, we have a choice to use pessimistic concurrency (locking) or optimistic concurrency (compare-and-set) but in a distributed environment [locks don't work and require the underlying storage to support fencing](https://martin.kleppmann.com/2016/02/08/how-to-do-distributed-locking.html), so we need CAS even to use pessimistic concurrency.

## Checker

The checker implements `jepsen.checker/Checker` protocol, accepts history, keeps start and confirmation of a read operation, start, and confirmation of a write operation and then checks if it's possible to linearize them.

History sample, each read has `write-id` and write - `prev-write-id` and `w1`:

```
{:type :invoke, :f :read, :value nil, :process 8, :time 333383000}
{:type :ok, :f :read, :value 0, :process 8, :time 443435300, :write-id "00000000-0000-0000-0000-000000000000"}
{:type :invoke, :f :write, :value 0, :write-id "e2a02cec-2168-45e5-80e4-e009744454e9", :prev-write-id "00000000-0000-0000-0000-000000000000", :process 9, :time 513243900}
{:type :ok, :f :write, :value 0, :write-id "e2a02cec-2168-45e5-80e4-e009744454e9", :prev-write-id "00000000-0000-0000-0000-000000000000", :process 9, :time 940449900}
```

One of the TSM's algorithms for validation consistency (see Theorem 4.13) is:

  1. Build a graph of the read and write events
  2. Add an edge from a write `w1` to a write `w2` if `w1.write-id == w2.prev-write-id` (write-order). Check that a write `w1` has only one outcoming edge leading to a write.
  3. Add an edge from a write `w1` to a read `r1` if `w1.write-id == r1.write-id` and check that the read value correspond to the written value (read-mapping).
  4. Add an edge from a read `r1` to a write `w2` if `r1.write-id == w2.prev-write-id`.
  5. Add an edge from an event `e1` to an event `e2` if `e2` starts after `e1's` confirmation in any client's timeline.
  6. Any topological sort of the graph gives a linearization of the history.

Jepsen runs on a single control node using multithreading to simulate multiple clients. So we can use its time as absolute time. Edges `2`, `3`, `5` are co-directed with time because they represent causal relations. With linearizability a read is required to return at least the most recent confirmed write known on the moment the read started, it also implies that `4` is co-directed with time so we can check the absence of cycles as time flows (online):
  
  1. Sort all the events by time.
  2. The set of all observed writes and their dependencies (in a CAS sense) must form a chain leading to the initial value. On start, the chain consists only the initial value.
  3. Process events one-by-one.
  4. On observation of a value (end of a read or a write):
      - if the corresponding write is already part of the chain:
        - if the observation is a write confirmation: does nothing
        - if it's a read: check that the observed value is or comes after the tail of the chain known at the moment the operation started
      - verify that the CAS-dependencies of the observed value lead to the current tail of the chain and add them making the observed value a new tail

If the history is sorted, then the algorithm takes linear time and can work online otherwise it's O(n ln n).

## How to run?

1. Install docker
2. Clone this repo
3. `./build-run-cluser.sh`
4. `./build-run-jepsen.sh`

If Jepsen observes a violation of consistency, you'll see something like

       "key1"
       {:timeline {:valid? true},
        :linear
        {:valid? false,
         :some-details
         "Read read at 35287712100 '20226f4b-2fcb-448f-9efe-20dfeb993f88' write-id but a fresher '63c31089-1c2a-4f30-b0ab-840049a75ecd -> fe7fc6e6-085e-4013-b8da-1882bcc773a0 -> e54d712a-b533-4af0-952b-8d8395aea839 -> 89de57a9-b2c8-4e81-b5aa-ffe6ab82b240 -> 0ffa3246-3cad-4c81-b2d7-b39e298ffa7a -> 478b5ef4-13be-44ab-80ba-c125e9a70c4e -> 0e31c898-15c0-4d95-8a34-728be94192b6 -> 20226f4b-2fcb-448f-9efe-20dfeb993f88' write-id chain was already known at 14329830400 before the read started (35184932600)"},
        :valid? false}},
      :failures ["key1"]},
     :valid? false}
    
    Analysis invalid! (?????? ???

In this case we have the following situation:

    14329830400 - sombody saw 63c31089-1c2a-4f30-b0ab-840049a75ecd
    35184932600 - read started
    35287712100 - read returned 20226f4b-2fcb-448f-9efe-20dfeb993f88

but 20226f4b-2fcb-448f-9efe-20dfeb993f88 is 63c31089-1c2a-4f30-b0ab-840049a75ecd's dependancy:

    63c31089-1c2a-4f30-b0ab-840049a75ecd -> 
    fe7fc6e6-085e-4013-b8da-1882bcc773a0 -> 
    e54d712a-b533-4af0-952b-8d8395aea839 -> 
    89de57a9-b2c8-4e81-b5aa-ffe6ab82b240 -> 
    0ffa3246-3cad-4c81-b2d7-b39e298ffa7a -> 
    478b5ef4-13be-44ab-80ba-c125e9a70c4e ->
    0e31c898-15c0-4d95-8a34-728be94192b6 -> 
    20226f4b-2fcb-448f-9efe-20dfeb993f88

so the read should have returned at least 63c31089-1c2a-4f30-b0ab-840049a75ecd.

## Differences between this and vanilla Jepsen setups

This setup has a couple of new features compared to regular structure aimed to increase the probability of finding a violation.

### Remote clients

Each node hosts MongoDB replica and a NodeJS app exposing HTTP key/value interface to MongoDB, so the control node (Jepsen) works with the database via the exposed interface. Clients running inside Jepsen always see the same worldview because Jepsen introduces faults only between the database's nodes. With the remote clients, this feature is gone and a network partition makes clients see the world differently adding a new possibility to break (see db/api-js).

### Sticky symmetrical writer-readers topology

The setup is using three keys `key1`, `key2` and `key2`; for each key, there are four clients: one writer and three readers. Each client is "sticky" and communicates with its designated node, for example `key1`'s writer always writes via `node1`, readers read via `node1`, `node2` and `node3`. The same is true for `key2` and `key3` but their writers write via `node2` and `node3`.

With this symmetrical topology and isolation of any node will affect at least one writer and all readers thus increasing intrusion and chances to observe something strange (see dispatcher.clj).

### Guided nemesis

Instead of picking a node randomly nemesis asks MongoDB who's the current primary and isolates it to maximize the impact (see isolate.clj).

### Version oracle

Usually, Jepsen operates on a small set of possible values and to perform CAS it randomly select value to use it as previous value in a predicate. If the set has three elements, then there is 33% chance of guessing it right.

The TSM algorithm requires each update to be unique to map every read with a write. The chance of guessing a right value picking from a countable set is zero. So a particular object (see oracle.clj) asks clients for last observed and written value and helps them to guess right write-id (version) to use in CAS.